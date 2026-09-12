import api from "./api";

const HEARTBEAT_INTERVAL_MS = 60000;

let consumerCount = 0;
let intervalId = null;

async function ping() {
    try {
        await api.presenceHeartbeat();
    } catch {
        /* non-fatal */
    }
}

export function startHeartbeat() {
    if (typeof window === "undefined") return;
    consumerCount++;
    if (consumerCount > 1) return;
    ping(); // immediate
    intervalId = setInterval(ping, HEARTBEAT_INTERVAL_MS);
}

export function stopHeartbeat() {
    if (consumerCount > 0) consumerCount--;
    if (consumerCount > 0) return;
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
}
