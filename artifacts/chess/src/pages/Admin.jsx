import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "../contexts/UserContext";
import api from "../services/api";
import "./Admin.css";

export default function Admin() {
    const { user } = useUser();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [message, setMessage] = useState(null);
    const [busyUserId, setBusyUserId] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [banTarget, setBanTarget] = useState(null);
    const [banReason, setBanReason] = useState("");
    const [analyticsTarget, setAnalyticsTarget] = useState(null);
    const [analytics, setAnalytics] = useState(null);
    const [eloInput, setEloInput] = useState("");
    const [eloBusy, setEloBusy] = useState(false);
    const searchTimeout = useRef(null);

    const isAdmin = Boolean(user?.isAdmin);

    const runSearch = useCallback(async (q) => {
        const trimmed = q.trim();
        if (trimmed.length === 1) {
            setResults([]);
            setMessage("Type at least 2 characters to search.");
            return;
        }
        setIsSearching(true);
        try {
            const data = await api.adminSearchUsers(trimmed);
            setResults(data.users || []);
            if (!data.users?.length) setMessage(trimmed ? `No accounts matched "${trimmed}".` : "No accounts yet.");
            else setMessage(null);
        } catch (error) {
            setMessage(error.message || "Search failed.");
        } finally {
            setIsSearching(false);
        }
    }, []);

    // Load the full account list as soon as the panel opens for an admin,
    // so an empty search box shows every user instead of a blank list.
    useEffect(() => {
        if (isAdmin) runSearch("");
    }, [isAdmin, runSearch]);

    // Debounced search as the admin types.
    const onQueryChange = (value) => {
        setQuery(value);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => runSearch(value), 350);
    };

    useEffect(() => {
        return () => {
            if (searchTimeout.current) clearTimeout(searchTimeout.current);
        };
    }, []);

    const refresh = () => runSearch(query);

    const handleBan = async () => {
        if (!banTarget) return;
        setBusyUserId(banTarget.id);
        try {
            const data = await api.adminBanUser(banTarget.id, banReason.trim() || undefined);
            setMessage(`Banned ${data.user?.username || banTarget.username}.`);
            setResults((prev) =>
                prev.map((u) => (u.id === banTarget.id ? { ...u, ...data.user } : u)),
            );
            setBanTarget(null);
            setBanReason("");
        } catch (error) {
            setMessage(error.message || "Ban failed.");
        } finally {
            setBusyUserId(null);
        }
    };

    const handleUnban = async (target) => {
        setBusyUserId(target.id);
        try {
            const data = await api.adminUnbanUser(target.id);
            setMessage(`Unbanned ${data.user?.username || target.username}.`);
            setResults((prev) =>
                prev.map((u) => (u.id === target.id ? { ...u, ...data.user } : u)),
            );
        } catch (error) {
            setMessage(error.message || "Unban failed.");
        } finally {
            setBusyUserId(null);
        }
    };

    const handleDelete = async (target) => {
        setBusyUserId(target.id);
        try {
            await api.adminDeleteUser(target.id);
            setMessage(`Deleted account ${target.username}.`);
            setResults((prev) => prev.filter((u) => u.id !== target.id));
            setConfirmDelete(null);
        } catch (error) {
            setMessage(error.message || "Delete failed.");
        } finally {
            setBusyUserId(null);
        }
    };

    const handleViewAnalytics = async (target) => {
        setAnalyticsTarget(target);
        setAnalytics(null);
        try {
            const data = await api.adminGetUserAnalytics(target.id);
            setAnalytics(data);
            setEloInput(String(data.user?.elo ?? ""));
        } catch (error) {
            setAnalytics({ error: error.message || "Failed to load analytics." });
        }
    };

    const handleSaveElo = async () => {
        if (!analyticsTarget) return;
        const parsed = Number(eloInput);
        if (!Number.isInteger(parsed) || parsed < 100 || parsed > 4000) {
            setAnalytics((prev) => ({ ...prev, eloError: "Elo must be a whole number between 100 and 4000." }));
            return;
        }
        setEloBusy(true);
        try {
            const data = await api.adminSetUserElo(analyticsTarget.id, parsed);
            setAnalytics((prev) => ({ ...prev, user: data.user, eloError: null }));
            setResults((prev) =>
                prev.map((u) => (u.id === analyticsTarget.id ? { ...u, ...data.user } : u)),
            );
            setMessage(`Set ${data.user?.username || analyticsTarget.username}'s elo to ${data.user.elo}.`);
        } catch (error) {
            setAnalytics((prev) => ({ ...prev, eloError: error.message || "Elo update failed." }));
        } finally {
            setEloBusy(false);
        }
    };

    if (!isAdmin) {
        return (
            <div className="admin-page page-container">
                <h1 className="admin-title">Admin</h1>
                <p className="admin-message">You need admin access to view this page.</p>
            </div>
        );
    }

    return (
        <div className="admin-page page-container">
            <h1 className="admin-title">Admin</h1>
            <p className="admin-subtitle">Search accounts, then ban, unban, or delete them.</p>

            <input
                className="admin-search"
                type="search"
                placeholder="Search by username or email (min. 2 characters)"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                aria-label="Search accounts"
            />

            {message && <p className="admin-message" role="status">{message}</p>}

            {results.length > 0 && (
                <ul className="admin-results" aria-label="Account results">
                    {results.map((u) => (
                        <li key={u.id} className="admin-row">
                            <div className="admin-row-info">
                                <span className="admin-row-name">{u.username}</span>
                                <span className="admin-row-email">{u.email || "no email"}</span>
                                <span className="admin-row-meta">
                                    {u.elo} elo · {u.gamesPlayed} games
                                    {u.isBanned && <span className="admin-badge admin-badge-banned">banned</span>}
                                    {u.isAdmin && <span className="admin-badge admin-badge-admin">admin</span>}
                                </span>
                                {u.isBanned && u.bannedReason && (
                                    <span className="admin-row-reason">Reason: {u.bannedReason}</span>
                                )}
                            </div>
                            <div className="admin-row-actions">
                                <button
                                    className="admin-btn"
                                    disabled={busyUserId === u.id}
                                    onClick={() => handleViewAnalytics(u)}
                                >
                                    Analytics
                                </button>
                                {u.isBanned ? (
                                    <button
                                        className="admin-btn admin-btn-unban"
                                        disabled={busyUserId === u.id || u.isAdmin}
                                        onClick={() => handleUnban(u)}
                                    >
                                        Unban
                                    </button>
                                ) : (
                                    <button
                                        className="admin-btn admin-btn-ban"
                                        disabled={busyUserId === u.id || u.isAdmin}
                                        onClick={() => { setBanTarget(u); setBanReason(""); }}
                                    >
                                        Ban
                                    </button>
                                )}
                                <button
                                    className="admin-btn admin-btn-delete"
                                    disabled={busyUserId === u.id || u.isAdmin}
                                    onClick={() => setConfirmDelete(u)}
                                >
                                    Delete
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {isSearching && results.length === 0 && <p className="admin-message">Searching…</p>}

            {analyticsTarget && (
                <div className="admin-modal" role="dialog" aria-modal="true" aria-label={`Analytics for ${analyticsTarget.username}`}>
                    <div className="admin-modal-content admin-analytics-modal">
                        <h2>{analyticsTarget.username}</h2>
                        {!analytics && <p className="admin-modal-note">Loading analytics…</p>}
                        {analytics?.error && <p className="admin-modal-note">{analytics.error}</p>}
                        {analytics && !analytics.error && (
                            <>
                                <div className="admin-analytics-stats">
                                    <div className="admin-stat">
                                        <span className="admin-stat-label">Elo</span>
                                        <div className="admin-elo-edit">
                                            <input
                                                type="number"
                                                min={100}
                                                max={4000}
                                                step={1}
                                                value={eloInput}
                                                onChange={(e) => setEloInput(e.target.value)}
                                                aria-label="Elo rating"
                                                disabled={eloBusy}
                                            />
                                            <button
                                                className="admin-btn"
                                                onClick={handleSaveElo}
                                                disabled={eloBusy || Number(eloInput) === analytics.user.elo}
                                            >
                                                Save
                                            </button>
                                        </div>
                                    </div>
                                    {analytics.eloError && (
                                        <p className="admin-modal-note admin-elo-error">{analytics.eloError}</p>
                                    )}
                                    <div className="admin-stat">
                                        <span className="admin-stat-label">Games</span>
                                        <span className="admin-stat-value">{analytics.stats.totalGames}</span>
                                    </div>
                                    <div className="admin-stat">
                                        <span className="admin-stat-label">W / L / D</span>
                                        <span className="admin-stat-value">
                                            {analytics.stats.wins} / {analytics.stats.losses} / {analytics.stats.draws}
                                        </span>
                                    </div>
                                    <div className="admin-stat">
                                        <span className="admin-stat-label">Win rate</span>
                                        <span className="admin-stat-value">{analytics.stats.winRate}%</span>
                                    </div>
                                    <div className="admin-stat">
                                        <span className="admin-stat-label">Joined</span>
                                        <span className="admin-stat-value">
                                            {analytics.user.createdAt
                                                ? new Date(analytics.user.createdAt).toLocaleDateString()
                                                : "unknown"}
                                        </span>
                                    </div>
                                </div>
                                <h3 className="admin-analytics-heading">
                                    Recent games ({analytics.recentGames.length})
                                </h3>
                                {analytics.recentGames.length === 0 && (
                                    <p className="admin-modal-note">No games played yet.</p>
                                )}
                                {analytics.recentGames.length > 0 && (
                                    <ul className="admin-games-list">
                                        {analytics.recentGames.map((g) => (
                                            <li key={g.gameId} className="admin-game-row">
                                                <span className={`admin-game-result admin-game-result-${g.result}`}>
                                                    {g.result}
                                                </span>
                                                <span className="admin-game-opp">
                                                    vs {g.opponent || "guest"} <i>({g.color})</i>
                                                </span>
                                                <span className="admin-game-meta">
                                                    {g.mode || "local"} · {g.playedAt ? new Date(g.playedAt).toLocaleDateString() : ""}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </>
                        )}
                        <div className="admin-modal-actions">
                            <button className="admin-btn" onClick={() => setAnalyticsTarget(null)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {banTarget && (
                <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Ban account">
                    <div className="admin-modal-content">
                        <h2>Ban {banTarget.username}?</h2>
                        <p className="admin-modal-note">
                            They will be signed out immediately and cannot sign back in until unbanned.
                        </p>
                        <input
                            className="admin-reason-input"
                            type="text"
                            placeholder="Reason (optional)"
                            value={banReason}
                            onChange={(e) => setBanReason(e.target.value)}
                            maxLength={300}
                        />
                        <div className="admin-modal-actions">
                            <button
                                className="admin-btn admin-btn-ban"
                                disabled={busyUserId === banTarget.id}
                                onClick={handleBan}
                            >
                                Confirm ban
                            </button>
                            <button
                                className="admin-btn"
                                onClick={() => setBanTarget(null)}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {confirmDelete && (
                <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Delete account">
                    <div className="admin-modal-content">
                        <h2>Delete {confirmDelete.username}?</h2>
                        <p className="admin-modal-note">
                            This permanently removes the account and its data. Games stay in the
                            archive without a player attached. This cannot be undone.
                        </p>
                        <div className="admin-modal-actions">
                            <button
                                className="admin-btn admin-btn-delete"
                                disabled={busyUserId === confirmDelete.id}
                                onClick={() => handleDelete(confirmDelete)}
                            >
                                Delete permanently
                            </button>
                            <button
                                className="admin-btn"
                                onClick={() => setConfirmDelete(null)}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
