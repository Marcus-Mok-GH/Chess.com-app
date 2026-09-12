import "./ChessGame.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "../contexts/SettingsContext";
import { useUser } from "../contexts/UserContext";
import {
    buildGameFromHistory,
    normalizeMoveHistory,
} from "../engine/game/moveHistory";
import api from "../services/api";
import { startHeartbeat, stopHeartbeat } from "../services/presence";
import {
    clearOnlineGameState,
    clearOnlineSession,
    saveOnlineSession,
} from "../utils/gamePersistence";
import haptics from "../utils/haptics";
import { findKingSquare } from "./ChessGame/utils";
import { useGameCore } from "./OnlineChessGame/hooks/useGameCore";
import GameUI from "./OnlineChessGame/subcomponents/GameUI";

const REACTIONS = ["GOOD", "CLAP", "THINK", "WOW", "PARTY", "SWEAT"];

export default function OnlineChessGame({
    gameId,
    playerId,
    playerColor,
    opponentInfo,
    onLeave,
}) {
    const { settings } = useSettings();
    const { user } = useUser();
    const {
        game,
        setGame,
        moveHistory,
        setMoveHistory,
        gameStatus,
        setGameStatus,
        endReason,
        setEndReason,
        winner,
        setWinner,
        moveError,
        setMoveError,
        makeMove,
        colorCode,
        moveInFlightRef,
        restoredMeta,
    } = useGameCore(gameId, playerId, playerColor, settings);

    const [chatMessages, setChatMessages] = useState([]);
    const [selectedSquare, setSelectedSquare] = useState(null);
    const [possibleMoves, setPossibleMoves] = useState([]);
    const [animatingPieces, setAnimatingPieces] = useState([]);
    const [opponentStatus, setOpponentStatus] = useState("connected");
    const [whitePlayer, setWhitePlayer] = useState(
        () => restoredMeta?.whitePlayer || { name: "White", elo: null },
    );
    const [blackPlayer, setBlackPlayer] = useState(
        () => restoredMeta?.blackPlayer || { name: "Black", elo: null },
    );
    const [eloChange, setEloChange] = useState(null);
    const [drawOffered, setDrawOffered] = useState(false);
    const [showVictory, setShowVictory] = useState(false);
    const lastVictoryKeyRef = useRef(null);
    const victoryTimeoutRef = useRef(null);
    const hasHydratedFromDb = useRef(false);
    // Tracks the newest server snapshot applied locally so delayed socket
    // snapshots cannot roll the board back to an earlier turn.
    const animationIdRef = useRef(0);
    // Use the server's monotonic move count for synchronization. The stored
    // history can arrive in different serialized shapes, but move_count is the
    // authoritative version used by the move endpoint.
    const appliedMoveCountRef = useRef(moveHistory.length);
    const eloFetchedRef = useRef(false);
    const chatTickRef = useRef(0);
    const presenceTickRef = useRef(0);
    const boardOrientation = playerColor || "white";

    useEffect(() => {
        if (!gameId || !playerId) return;
        saveOnlineSession({
            gameId,
            playerId,
            playerColor,
            opponentInfo,
        });
    }, [gameId, playerId, playerColor, opponentInfo]);

    useEffect(() => {
        if (!gameId || hasHydratedFromDb.current) return;
        let cancelled = false;

        api.getGameByCode(gameId)
            .then((data) => {
                if (cancelled || !data) return;
                const history = normalizeMoveHistory(data.move_history);
                const serverMoveCount = Number.isInteger(data.move_count)
                    ? data.move_count
                    : history.length;
                // The server is authoritative for the first hydration. Local storage can
                // contain a snapshot from a previous match when a game code is reused,
                // so stale client history must never veto a fresh server snapshot.
                appliedMoveCountRef.current = serverMoveCount;
                setGame(buildGameFromHistory(history, data.fen));
                setMoveHistory(history);
                if (data.status === "ended" || data.status === "completed") {
                    setGameStatus("ended");
                } else if (data.status) {
                    setGameStatus(
                        data.status === "playing" ||
                            data.status === "in_progress"
                            ? "playing"
                            : data.status,
                    );
                }
                if (data.white_player_name || data.black_player_name) {
                    if (data.white_player_name) {
                        setWhitePlayer((prev) => ({
                            name: data.white_player_name || prev.name,
                            elo: data.white_elo ?? prev.elo,
                        }));
                    }
                    if (data.black_player_name) {
                        setBlackPlayer((prev) => ({
                            name: data.black_player_name || prev.name,
                            elo: data.black_elo ?? prev.elo,
                        }));
                    }
                }
                hasHydratedFromDb.current = true;
            })
            .catch(() => {
                hasHydratedFromDb.current = true;
            });

        return () => {
            cancelled = true;
        };
    }, [gameId]);

    useEffect(() => {
        if (gameId && user) startHeartbeat();
        return () => stopHeartbeat();
    }, [gameId, user]);

    // HTTP polling — primary source of truth for opponent moves.
    // Local player's own moves are confirmed via the POST response, but opponent
    // moves arrive only through this poll.  The interval avoids overlapping polls
    // via the inFlight guard and stops when the game ends.
    const gameStatusRef = useRef(gameStatus);

    useEffect(() => {
        appliedMoveCountRef.current = Math.max(
            appliedMoveCountRef.current,
            moveHistory.length,
        );
    }, [moveHistory.length]);

    useEffect(() => {
        gameStatusRef.current = gameStatus;
    }, [gameStatus]);

    useEffect(() => {
        if (!gameId || !playerId) return;

        let cancelled = false;
        let inFlight = false;
        const intervalId = setInterval(async () => {
            if (cancelled || inFlight) return;
            if (gameStatusRef.current === "ended") return;
            inFlight = true;
            try {
                const data = await api.getGameByCode(gameId);
                if (cancelled || !data) return;

                const serverHistory = normalizeMoveHistory(data.move_history);
                const serverMoveCount = Number.isInteger(data.move_count)
                    ? data.move_count
                    : serverHistory.length;
                const knownCount = appliedMoveCountRef.current;
                const hasNewMoves = serverMoveCount > knownCount;

                const serverStatus =
                    data.status === "ended" || data.status === "completed"
                        ? "ended"
                        : data.status || "playing";
                if (serverStatus === "ended") {
                    setGameStatus("ended");
                    setDrawOffered(false);
                    if (data.result) setWinner(data.result);
                    clearOnlineSession();

                    // Elo change: fetch profile after game ends (once)
                    if (
                        !eloFetchedRef.current &&
                        data.game_mode === "ranked" &&
                        user?.username
                    ) {
                        eloFetchedRef.current = true;
                        try {
                            const snapElo =
                                playerColor === "white"
                                    ? data.white_elo
                                    : data.black_elo;
                            if (snapElo != null) {
                                const profile = await api.getUserProfile(
                                    user.username,
                                );
                                setEloChange(
                                    (profile?.elo ?? snapElo) - snapElo,
                                );
                            }
                        } catch {
                            /* non-fatal */
                        }
                    }
                    // endReason: set to result if draw; otherwise leave null (resign shows "X wins")
                    if (!endReason)
                        setEndReason(data.result === "draw" ? "draw" : null);
                } else if (
                    gameStatusRef.current !== "ended" &&
                    (data.status === "playing" || data.status === "in_progress")
                ) {
                    setGameStatus("playing");
                }

                // ── Throttled sub-polls (run only every N ticks to avoid flooding) ─────────
                const tick = ++chatTickRef.current; // monotonically increments every poll cycle

                // Draw offer — every ~4 ticks (~6s)
                if (tick % 4 === 0) {
                    try {
                        const draw = await api.getDrawOffer(gameId);
                        const offer = draw?.offer;
                        setDrawOffered(
                            Boolean(offer && offer.offeredBy !== playerId),
                        );
                    } catch {
                        /* transient */
                    }
                }

                // Chat — every ~4 ticks (~6s)
                if (tick % 4 === 0) {
                    try {
                        const myUid = playerId.split("_")[1];
                        const room = gameId.toLowerCase();
                        const chatData = await api.getMessages(room, 50);
                        const oppId =
                            data.white_player_id && data.black_player_id
                                ? playerColor === "white"
                                    ? data.black_player_id
                                    : data.white_player_id
                                : null;
                        const msgs = (chatData?.messages || []).map((m) => ({
                            playerId:
                                String(m.userId) === String(myUid)
                                    ? playerId
                                    : oppId,
                            message: m.body,
                        }));
                        setChatMessages(msgs);
                    } catch {
                        /* transient */
                    }
                }

                // Opponent presence — every ~10 ticks (~15s), only if logged in
                if (++presenceTickRef.current % 10 === 0 && user) {
                    try {
                        const oppId =
                            data.white_player_id && data.black_player_id
                                ? playerColor === "white"
                                    ? data.black_player_id
                                    : data.white_player_id
                                : null;
                        if (oppId) {
                            const oppUid = oppId.split("_")[1];
                            const pRes = await api.getPresence(oppUid);
                            setOpponentStatus(
                                pRes?.online ? "connected" : "disconnected",
                            );
                        }
                    } catch {
                        /* transient or 401 for guests — leave status unchanged */
                    }
                }

                if (!hasNewMoves) return;

                appliedMoveCountRef.current = serverMoveCount;

                setGame(buildGameFromHistory(serverHistory, data.fen));
                setMoveHistory(serverHistory);

                const lastEntry = serverHistory[serverHistory.length - 1];
                let lastEntryObj = null;
                if (typeof lastEntry === "object" && lastEntry)
                    lastEntryObj = lastEntry;
                else if (typeof lastEntry === "string") {
                    try {
                        lastEntryObj = JSON.parse(lastEntry);
                    } catch {
                        lastEntryObj = null;
                    }
                }
                if (lastEntryObj && lastEntryObj.captured) haptics.capture();
                else haptics.move();
            } catch {
                // Transient network blip — keep polling
            } finally {
                inFlight = false;
            }
        }, 1500);

        return () => {
            cancelled = true;
            clearInterval(intervalId);
        };
    }, [
        gameId,
        playerId,
        playerColor,
        setGame,
        setMoveHistory,
        setGameStatus,
        setWinner,
    ]);

    useEffect(() => {
        if (opponentInfo) {
            if (playerColor === "white")
                setBlackPlayer({
                    name: opponentInfo.name,
                    elo: opponentInfo.elo,
                });
            else
                setWhitePlayer({
                    name: opponentInfo.name,
                    elo: opponentInfo.elo,
                });
        }
    }, [opponentInfo, playerColor]);

    useEffect(() => {
        if (!game) return;
        const isCheckmate = game.isCheckmate();
        const winningColor = isCheckmate
            ? game.turn() === "w"
                ? "black"
                : "white"
            : null;
        const didPlayerWin = isCheckmate && winningColor === playerColor;
        if (!didPlayerWin) {
            setShowVictory(false);
            return;
        }
        const victoryKey = `${game.fen()}-${winningColor}`;
        if (lastVictoryKeyRef.current === victoryKey) return;
        lastVictoryKeyRef.current = victoryKey;
        setShowVictory(true);
        if (victoryTimeoutRef.current) clearTimeout(victoryTimeoutRef.current);
        victoryTimeoutRef.current = setTimeout(
            () => setShowVictory(false),
            2200,
        );
    }, [game, playerColor]);

    const triggerAnimation = useCallback((move) => {
        const id = animationIdRef.current++;
        setAnimatingPieces((prev) => [
            ...prev,
            {
                id,
                piece: { type: move.piece, color: move.color },
                fromSquare: move.from,
                toSquare: move.to,
            },
        ]);
    }, []);

    const handlePieceDrop = useCallback(
        async (from, to) => {
            if (moveInFlightRef.current) return false;
            if (game.turn() !== colorCode || gameStatus !== "playing")
                return false;
            const piece = game.get(from);
            if (!piece || piece.color !== colorCode) return false;
            const moved = await makeMove({ from, to, promotion: "q" });
            if (moved) {
                haptics.move();
                setSelectedSquare(null);
                setPossibleMoves([]);
                setDrawOffered(false);
            }
            return moved;
        },
        [game, colorCode, gameStatus, makeMove, moveInFlightRef],
    );

    const canDragPiece = useCallback(
        (pieceType, square) => {
            if (game.turn() !== colorCode || gameStatus !== "playing")
                return false;
            const piece = game.get(square);
            return Boolean(
                piece &&
                    piece.color === colorCode &&
                    pieceType?.[0] === colorCode,
            );
        },
        [game, colorCode, gameStatus],
    );

    const onSquareClick = useCallback(
        (square) => {
            if (game.turn() !== colorCode || gameStatus !== "playing") return;
            const piece = game.get(square);
            if (piece && piece.color === colorCode) {
                if (square === selectedSquare) {
                    setSelectedSquare(null);
                    setPossibleMoves([]);
                    return;
                }
                setSelectedSquare(square);
                haptics.select();
                setPossibleMoves(
                    game.moves({ square, verbose: true }).map((m) => m.to),
                );
                return;
            }
            if (selectedSquare) {
                const isLegal = possibleMoves.includes(square);
                if (isLegal) {
                    handlePieceDrop(selectedSquare, square);
                    return;
                }
            }
            setSelectedSquare(null);
            setPossibleMoves([]);
        },
        [
            game,
            colorCode,
            gameStatus,
            selectedSquare,
            possibleMoves,
            handlePieceDrop,
        ],
    );

    const customSquareStyles = useMemo(() => {
        const styles = {};
        if (selectedSquare)
            styles[selectedSquare] = {
                backgroundColor: "rgba(255, 255, 0, 0.4)",
            };
        possibleMoves.forEach((s) => {
            const isCapture = game.get(s);
            styles[s] = {
                background: isCapture
                    ? "radial-gradient(circle, rgba(0, 0, 0, 0.1) 85%, transparent 85%)"
                    : "radial-gradient(circle, rgba(0, 0, 0, 0.2) 25%, transparent 25%)",
                borderRadius: "50%",
            };
        });
        if (game.inCheck()) {
            const king = findKingSquare(game, game.turn());
            if (king)
                styles[king] = { backgroundColor: "rgba(255, 0, 0, 0.5)" };
        }
        return styles;
    }, [selectedSquare, possibleMoves, game]);

    const capturedPieces = useMemo(() => {
        const current = {
            w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
            b: { p: 0, n: 0, b: 0, r: 0, q: 0 },
        };
        game.board().forEach((row) =>
            row.forEach(
                (p) => p && p.type !== "k" && current[p.color][p.type]++,
            ),
        );
        const captured = { w: [], b: [] };
        const initial = { p: 8, n: 2, b: 2, r: 2, q: 1 };
        ["w", "b"].forEach((c) =>
            ["q", "r", "b", "n", "p"].forEach((p) => {
                for (let i = 0; i < initial[p] - current[c][p]; i++)
                    captured[c].push(p);
            }),
        );
        return captured;
    }, [game]);

    const getStatusMessage = () => {
        if (gameStatus === "ended")
            return endReason === "resignation"
                ? `${winner} wins by resignation`
                : winner === "draw"
                  ? "Draw"
                  : `${winner} wins`;
        if (game.inCheck()) return "Check!";
        return game.turn() === colorCode ? "Your turn" : "Opponent's turn";
    };

    return (
        <div className="online-chess-game">
            <GameUI
                topPlayer={
                    boardOrientation === "white"
                        ? { ...blackPlayer, color: "b" }
                        : { ...whitePlayer, color: "w" }
                }
                bottomPlayer={
                    boardOrientation === "white"
                        ? { ...whitePlayer, color: "w" }
                        : { ...blackPlayer, color: "b" }
                }
                game={game}
                onSquareClick={onSquareClick}
                onPieceDrop={handlePieceDrop}
                canDragPiece={canDragPiece}
                boardOrientation={boardOrientation}
                customSquareStyles={customSquareStyles}
                settings={settings}
                animatingPieces={animatingPieces}
                removeAnimation={(id) =>
                    setAnimatingPieces((prev) =>
                        prev.filter((a) => a.id !== id),
                    )
                }
                showVictory={showVictory}
                gameId={gameId}
                opponentStatus={opponentStatus}
                eloChange={eloChange}
                moveError={moveError}
                getStatusMessage={getStatusMessage}
                drawOffered={drawOffered}
                handleRespondDraw={(acc) => {
                    setDrawOffered(false);
                    api.respondDraw(gameId, playerId, acc).catch((e) =>
                        setMoveError(e.message),
                    );
                }}
                REACTIONS={REACTIONS}
                handleSendReaction={(r) => {
                    const room = gameId.toLowerCase();
                    api.sendMessage(room, r)
                        .then((res) => {
                            if (res?.message) {
                                setChatMessages((prev) => [
                                    ...prev,
                                    { playerId, message: r },
                                ]);
                            }
                        })
                        .catch(() => {});
                }}
                chatMessages={chatMessages}
                handleSendMessage={(m) => {
                    const room = gameId.toLowerCase();
                    api.sendMessage(room, m)
                        .then((res) => {
                            if (res?.message) {
                                setChatMessages((prev) => [
                                    ...prev,
                                    { playerId, message: res.message.body },
                                ]);
                            }
                        })
                        .catch(() => {});
                }}
                playerId={playerId}
                moveHistory={moveHistory}
                gameStatus={gameStatus}
                handleOfferDraw={() => {
                    api.offerDraw(gameId, playerId).catch((e) =>
                        setMoveError(e.message),
                    );
                }}
                handleResign={() => {
                    setDrawOffered(false);
                    const opponentColor =
                        playerColor === "white" ? "black" : "white";
                    api.endOnlineGame({
                        gameId,
                        playerId,
                        result: opponentColor,
                        reason: "resignation",
                        token: localStorage.getItem("chess_user_token"),
                    }).catch((e) => setMoveError(e.message));
                    clearOnlineSession();
                    if (gameId) clearOnlineGameState(gameId);
                }}
                canLeave={
                    gameStatus === "ended" &&
                    (winner === "white" || winner === "black")
                }
                onLeave={() => {
                    setDrawOffered(false);
                    clearOnlineSession();
                    if (gameId) clearOnlineGameState(gameId);
                    onLeave?.();
                }}
                capturedPieces={capturedPieces}
            />
        </div>
    );
}
