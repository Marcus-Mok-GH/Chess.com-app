import {
    ArrowUpRight,
    Check,
    Loader2,
    RefreshCw,
    UserMinus,
    UserPlus,
    Users,
    Wifi,
    WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../contexts/UserContext";
import api from "../services/api";
import { startHeartbeat, stopHeartbeat } from "../services/presence";
import "./Friends.css";
import { useT } from '../i18n/I18nContext';
import { tNow } from '../i18n/translate';

const POLL_INTERVAL_MS = 30000;

export default function Friends() {
  const t = useT();
    const navigate = useNavigate();
    const { user, isLoggedIn, isLoading } = useUser();

    const [friends, setFriends] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [onlineIds, setOnlineIds] = useState(() => new Set());
    const onlineIdsRef = useRef(onlineIds);
    onlineIdsRef.current = onlineIds;

    const [addUsername, setAddUsername] = useState("");
    const [adding, setAdding] = useState(false);
    const [addError, setAddError] = useState("");
    const [addSuccess, setAddSuccess] = useState("");
    const [removing, setRemoving] = useState("");

    const loadFriends = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError("");
        try {
            const data = await api.getFriends();
            const list = Array.isArray(data?.friends) ? data.friends : [];
            setFriends(list);
            setOnlineIds(
                new Set(list.filter((f) => f.online).map((f) => String(f.id))),
            );
        } catch (err) {
            setError(err.message || "Failed to load friends");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isLoggedIn) return;
        loadFriends();
    }, [isLoggedIn, loadFriends]);

    // Mark the user online via the presence heartbeat and keep polling friend
    // online status while this page is mounted.
    useEffect(() => {
        if (!isLoggedIn || !user?.id) return;
        startHeartbeat();
        const poll = setInterval(() => loadFriends(true), POLL_INTERVAL_MS);
        return () => {
            clearInterval(poll);
            stopHeartbeat();
        };
    }, [isLoggedIn, user?.id, user?.username, loadFriends]);

    async function handleAddFriend(event) {
        event.preventDefault();
        const username = addUsername.trim();
        if (!username) return;
        setAdding(true);
        setAddError("");
        setAddSuccess("");
        try {
            await api.addFriend(username);
            setAddSuccess(tNow('{username} added to your friends.', { username }));
            setAddUsername("");
            loadFriends(true);
        } catch (err) {
            setAddError(err.message || "Failed to add friend");
        } finally {
            setAdding(false);
        }
    }

    async function handleRemoveFriend(friend) {
        setRemoving(String(friend.id));
        try {
            await api.removeFriend(friend.username);
            setFriends((prev) =>
                prev.filter((f) => String(f.id) !== String(friend.id)),
            );
        } catch (err) {
            setError(err.message || "Failed to remove friend");
        } finally {
            setRemoving("");
        }
    }

    if (isLoading) {
        return (
            <div className="friends-page">
                <div className="friends-container">
                    <div
                        style={{
                            textAlign: "center",
                            padding: "4rem",
                            color: "var(--text-dim)",
                        }}
                    >
                        {t("Loading...")}</div>
                </div>
            </div>
        );
    }

    if (!isLoggedIn || !user) {
        return (
            <div className="friends-page">
                <div className="friends-container">
                    <div className="friends-empty-card card-surface">
                        <Users size={40} />
                        <h2>{t("Access Restricted")}</h2>
                        <p
                            style={{
                                color: "var(--text-dim)",
                                marginBottom: "1.5rem",
                                textAlign: "center",
                            }}
                        >
                            {t("You need to be logged in to access account specific privileges.")}</p>
                        <button
                            className="friends-primary-btn"
                            onClick={() => navigate("/login")}
                        >
                            {t("Go to Login")}</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="friends-page">
            <div className="friends-container">
                <header className="friends-header">
                    <div className="friends-eyebrow">
                        <Users size={13} />
                        <span>{t("Social")}</span>
                    </div>
                    <h1 className="friends-title">{t("Friends")}</h1>
                    <p className="friends-subtitle">
                        {t("Add players, see who is online, and jump into games together.")}</p>
                </header>

                {/* Add friend */}
                <section className="friends-card card-surface">
                    <form
                        className="friends-add-form"
                        onSubmit={handleAddFriend}
                    >
                        <label className="sr-only" htmlFor="friend-username">
                            {t("Username")}</label>
                        <input
                            id="friend-username"
                            type="text"
                            className="friends-input"
                            placeholder={t("Add by username")}
                            value={addUsername}
                            onChange={(e) => setAddUsername(e.target.value)}
                            maxLength={50}
                            autoComplete="off"
                        />
                        <button
                            type="submit"
                            className="friends-primary-btn"
                            disabled={adding || !addUsername.trim()}
                        >
                            {adding ? (
                                <Loader2 size={16} className="spin" />
                            ) : (
                                <UserPlus size={16} />
                            )}
                            {t("Add Friend")}</button>
                    </form>
                    {addError && (
                        <p
                            className="friends-form-msg friends-form-msg--error"
                            role="alert"
                        >
                            {addError}
                        </p>
                    )}
                    {addSuccess && (
                        <p
                            className="friends-form-msg friends-form-msg--success"
                            role="status"
                        >
                            {addSuccess}
                        </p>
                    )}
                </section>

                {/* Friend list */}
                <section className="friends-list-section">
                    <div className="friends-list-head">
                        <h2 className="section-title">{t("Your Friends")}</h2>
                        <button
                            className="friends-refresh"
                            onClick={() => loadFriends(true)}
                            title={t("Refresh")}
                            aria-label={t("Refresh friends")}
                        >
                            <RefreshCw size={16} />
                        </button>
                    </div>

                    {loading && friends.length === 0 ? (
                        <div className="friends-loading card-surface">
                            <Loader2 size={18} className="spin" /> {' '}{t("Loading friends…")}</div>
                    ) : friends.length === 0 ? (
                        <div className="friends-empty-card card-surface">
                            <Users size={36} />
                            <p>
                                {t("No friends yet. Add someone by username above to get started.")}</p>
                        </div>
                    ) : (
                        <ul className="friends-list">
                            {friends.map((friend) => {
                                const isOnline =
                                    onlineIds.has(String(friend.id)) ||
                                    Boolean(friend.online);
                                return (
                                    <li
                                        key={String(friend.id)}
                                        className="friend-row card-surface"
                                    >
                                        <span
                                            className={`friend-status-dot ${isOnline ? "is-online" : ""}`}
                                            aria-label={
                                                t(isOnline ? "Online" : "Offline")
                                            }
                                        />
                                        <div className="friend-info">
                                            <span className="friend-name">
                                                {friend.username}
                                            </span>
                                            <span className="friend-meta">
                                                {isOnline ? (
                                                    <>
                                                        <Wifi size={12} />{" "}
                                                        {t("Online")}</>
                                                ) : (
                                                    <>
                                                        <WifiOff size={12} />{" "}
                                                        {t("Offline")}</>
                                                )}
                                            </span>
                                        </div>
                                        <div className="friend-actions">
                                            <button
                                                className="friend-action friend-action--remove"
                                                onClick={() =>
                                                    handleRemoveFriend(friend)
                                                }
                                                disabled={
                                                    removing ===
                                                    String(friend.id)
                                                }
                                                title={t("Remove friend")}
                                                aria-label={t('Remove {username}', { username: friend.username })}
                                            >
                                                {removing ===
                                                String(friend.id) ? (
                                                    <Loader2
                                                        size={16}
                                                        className="spin"
                                                    />
                                                ) : (
                                                    <UserMinus size={16} />
                                                )}
                                            </button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    {error && (
                        <p className="friends-error" role="alert">
                            {t(error)}
                        </p>
                    )}
                </section>

                <section className="friends-tip card-surface">
                    <ArrowUpRight size={16} />
                    <p>
                        {t("Tip: friends appear with a green dot when they are online on the site.")}</p>
                </section>
            </div>
        </div>
    );
}
