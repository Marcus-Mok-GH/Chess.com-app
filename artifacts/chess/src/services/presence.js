import api from "./api";

const HEARTBEAT_INTERVAL_MS = 60000;

let started = false;
let intervalId = null;

async function ping() {
    try {
        await api.presenceHeartbeat();
    } catch {
        /* non-fatal */
    }
}

export function startHeartbeat() {
    if (started || typeof window === "undefined") return;
    started = true;
    ping(); // immediate
    intervalId = setInterval(ping, HEARTBEAT_INTERVAL_MS);
}

export function stopHeartbeat() {
    started = false;
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
}
