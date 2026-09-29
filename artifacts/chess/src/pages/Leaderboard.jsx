import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Trophy } from "lucide-react";
import { useUser } from "../contexts/UserContext";
import api from "../services/api";
import { RATING_POOLS, DEFAULT_TIME_CONTROL } from "../utils/timeControls";
import "./Leaderboard.css";

const LEADERBOARD_LIMIT = 50;

export default function Leaderboard() {
    const { user } = useUser();
    const [timeControl, setTimeControl] = useState(DEFAULT_TIME_CONTROL);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async (control) => {
        setLoading(true);
        setError("");
        try {
            const data = await api.getLeaderboard(LEADERBOARD_LIMIT, control);
            setRows(Array.isArray(data?.leaderboard) ? data.leaderboard : []);
        } catch (err) {
            setError(err.message || "Failed to load leaderboard");
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load(timeControl);
    }, [timeControl, load]);

    const activeControl =
        RATING_POOLS.find((control) => control.id === timeControl) ||
        RATING_POOLS[0];
    // Read a row's rating for a given pool. Rapid 10+0 and 10+3 share the
    // rapid pool, so the pool id is what matters rather than the control.
    const ratingFor = (row, poolId) => {
        if (poolId === "rapid") return row.rapidElo;
        if (poolId === "classical") return row.classicalElo;
        return row.elo;
    };
    const otherPools = RATING_POOLS.filter((pool) => pool.id !== timeControl);

    return (
        <div className="leaderboard-page">
            <div className="leaderboard-container">
                <header className="leaderboard-header">
                    <div className="leaderboard-eyebrow">
                        <Trophy size={13} />
                        <span>Rankings</span>
                    </div>
                    <h1 className="leaderboard-title">Leaderboard</h1>
                    <p className="leaderboard-subtitle">
                        Top players by rating. Unlimited, Rapid, and
                        Classical each have their own rating pool. Both Rapid
                        variants (10+0 and 10+3) share the Rapid rating.
                    </p>
                </header>

                <label className="select-field leaderboard-pool-select">
                    <span className="select-field-label">Rating pool</span>
                    <select
                        aria-label="Rating pool"
                        value={timeControl}
                        onChange={(event) => setTimeControl(event.target.value)}
                    >
                        {RATING_POOLS.map((option) => (
                            <option key={option.id} value={option.id}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>

                <section className="leaderboard-card card-surface">
                    <div className="leaderboard-card-head">
                        <h2 className="section-title">
                            {activeControl.label} Ratings
                        </h2>
                        <button
                            className="leaderboard-refresh"
                            onClick={() => load(timeControl)}
                            title="Refresh"
                            aria-label="Refresh leaderboard"
                        >
                            <RefreshCw size={16} />
                        </button>
                    </div>

                    {loading ? (
                        <div className="leaderboard-status">
                            <Loader2 size={18} className="spin" /> Loading
                            rankings…
                        </div>
                    ) : error ? (
                        <p className="leaderboard-error" role="alert">
                            {error}
                        </p>
                    ) : rows.length === 0 ? (
                        <div className="leaderboard-status">
                            No ranked players yet.
                        </div>
                    ) : (
                        <ol className="leaderboard-list">
                            {rows.map((row) => {
                                const isSelf =
                                    user?.username &&
                                    row.username === user.username;
                                const ranked = ratingFor(row, timeControl);
                                return (
                                    <li
                                        key={row.username}
                                        className={`leaderboard-row ${
                                            isSelf ? "is-self" : ""
                                        }`}
                                    >
                                        <span className="leaderboard-rank">
                                            {row.rank}
                                        </span>
                                        <span className="leaderboard-player">
                                            {row.username}
                                            {isSelf && (
                                                <span className="leaderboard-you">
                                                    you
                                                </span>
                                            )}
                                        </span>
                                        <span
                                            className="leaderboard-rating"
                                            title={`${activeControl.label} rating`}
                                        >
                                            {ranked ?? "—"}
                                        </span>
                                        <span
                                            className="leaderboard-other"
                                            title={otherPools
                                                .map(
                                                    (pool) =>
                                                        `${pool.label} rating`,
                                                )
                                                .join(", ")}
                                        >
                                            {otherPools.map((pool) => (
                                                <span
                                                    key={pool.id}
                                                    className="leaderboard-other-item"
                                                >
                                                    {pool.label}{" "}
                                                    {ratingFor(row, pool.id) ??
                                                        "—"}
                                                </span>
                                            ))}
                                        </span>
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </section>

                <p className="leaderboard-note">
                    Left column is the {activeControl.label} rating; the second
                    lists each player's other pool ratings.
                </p>
            </div>
        </div>
    );
}
