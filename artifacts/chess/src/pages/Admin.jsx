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
