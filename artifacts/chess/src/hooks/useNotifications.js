import { useEffect, useState } from 'react';
import api from '../services/api';

/**
 * Shared inbox store for the notification bell.
 *
 * The shell renders a bell twice (desktop sidebar and mobile header), so the
 * data lives at module level: one fetch, one poll, one unread count — and both
 * instances stay in sync when one of them marks something read.
 */
const POLL_INTERVAL_MS = 60000;

const EMPTY = {
    userId: null,
    items: [],
    unreadCount: 0,
    loaded: false,
    loading: false,
    error: null,
};

let state = { ...EMPTY };
const listeners = new Set();
let pollTimer = null;

function emit() {
    const snapshot = { ...state, items: state.items };
    for (const listener of [...listeners]) listener(snapshot);
}

async function refresh() {
    if (!state.userId || state.loading) return;
    const requestedFor = state.userId;
    state = { ...state, loading: true };
    emit();

    let next;
    try {
        const data = await api.getNotifications();
        next = {
            items: Array.isArray(data?.notifications) ? data.notifications : [],
            unreadCount: Number(data?.unreadCount) || 0,
            error: null,
        };
    } catch (error) {
        next = { error: error?.message || 'Failed to load notifications' };
    }
    // The account changed while this was in flight, so this response belongs
    // to the previous session. Dropping it whole (rather than merging) keeps
    // one account's inbox from surfacing under another, and leaves the new
    // account's own in-flight fetch owning `loading`.
    if (state.userId !== requestedFor) return;
    state = { ...state, ...next, loaded: true, loading: false };
    emit();
}

function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => { void refresh(); }, POLL_INTERVAL_MS);
}

function stopPolling() {
    if (!pollTimer) return;
    clearInterval(pollTimer);
    pollTimer = null;
}

function applyReadUpdate(idOrNull, unreadCount) {
    const readAt = new Date().toISOString();
    state = {
        ...state,
        unreadCount: Number(unreadCount) || 0,
        items: state.items.map((item) => {
            const targeted = idOrNull == null || item.id === idOrNull;
            if (!targeted || item.read_at) return item;
            return { ...item, read_at: readAt };
        }),
    };
    emit();
}

export async function markAllNotificationsRead() {
    if (!state.userId) return;
    const requestedFor = state.userId;
    const data = await api.markNotificationsRead({ all: true });
    // Same stale-session guard as refresh: this count describes the previous
    // account's inbox, so it must not overwrite the current one's.
    if (state.userId !== requestedFor) return;
    applyReadUpdate(null, data?.unreadCount);
}

export async function markNotificationRead(id) {
    if (!state.userId || id == null) return;
    const requestedFor = state.userId;
    const data = await api.markNotificationsRead({ ids: [id] });
    if (state.userId !== requestedFor) return;
    applyReadUpdate(id, data?.unreadCount);
}

/**
 * @param {string|null} userId - The signed-in account, or null when signed out.
 */
export function useNotifications(userId) {
    const key = userId == null ? null : String(userId);
    const [snapshot, setSnapshot] = useState(() => ({ ...state }));

    useEffect(() => {
        listeners.add(setSnapshot);

        if (state.userId !== key) {
            // A different account signed in: drop the previous inbox before
            // the first fetch so nothing leaks across sessions.
            state = { ...EMPTY, userId: key };
            emit();
        }
        if (key && !state.loaded) void refresh();
        if (key) startPolling();

        return () => {
            listeners.delete(setSnapshot);
            if (!listeners.size) stopPolling();
        };
    }, [key]);

    return snapshot;
}
