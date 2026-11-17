/**
 * Plain-text WebSocket link to a Target Omni on the home network.
 * Host, port and path come from Settings. Nothing here is a guessed endpoint.
 */

export const OMNI_STORAGE_KEY = "snake501.omni";

export const OMNI_IN_USE_HINT = "The board may be in use by another app. Close DartCounter or the Target app, then power-cycle the Omni.";

export const OMNI_ADDRESS_HINT = "Enter the Omni IP address and port. Leave the path empty until you have recorded one.";

export function normaliseOmniSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    enabled: source.enabled === true,
    host: typeof source.host === "string" ? source.host : "",
    port: typeof source.port === "string" ? source.port : "",
    path: typeof source.path === "string" ? source.path : "",
  };
}

/** ws:// URL from the saved fields, or null when the address is incomplete. */
export function websocketUrl(settings) {
  const clean = normaliseOmniSettings(settings);
  const host = clean.host.trim();
  const portText = clean.port.trim();
  const path = clean.path.trim();
  if (!host || !portText) return null;
  if (/[\s/]/.test(host) || host.includes("://")) return null;
  if (!/^\d+$/.test(portText)) return null;
  const port = Number(portText);
  if (port < 1 || port > 65535) return null;
  if (/\s/.test(path) || path.includes("://")) return null;
  let url = `ws://${host}:${port}`;
  if (path) url += path.startsWith("/") ? path : `/${path}`;
  return url;
}

/** Delay before the next reconnect. Attempt 0 waits 1s, then 2s, 4s, up to 30s. */
export function reconnectDelay(attempt) {
  const step = Math.max(0, Math.floor(Number(attempt) || 0));
  return Math.min(30000, 1000 * 2 ** Math.min(step, 8));
}

export function createOmniConnection(options = {}) {
  const Socket = options.Socket || globalThis.WebSocket;
  const schedule = options.schedule || ((fn, ms) => setTimeout(fn, ms));
  const cancel = options.cancel || ((id) => clearTimeout(id));
  const onStatus = options.onStatus || (() => {});
  const onMessage = options.onMessage || (() => {});

  let settings = normaliseOmniSettings(null);
  let status = "disconnected";
  let hint = "";
  let socket = null;
  let timer = null;
  let attempt = 0;
  let session = 0;
  let stopped = true;

  function setStatus(next, nextHint = "") {
    status = next;
    hint = nextHint;
    onStatus({ status, hint });
  }

  function closeSocket() {
    const ws = socket;
    socket = null;
    if (!ws) return;
    ws.onopen = null;
    ws.onclose = null;
    ws.onerror = null;
    ws.onmessage = null;
    try { ws.close(); } catch { /* already closed */ }
  }

  function clearTimer() {
    if (timer == null) return;
    cancel(timer);
    timer = null;
  }

  function halt() {
    stopped = true;
    session += 1;
    clearTimer();
    closeSocket();
  }

  function armRetry(ticket) {
    setStatus("error", OMNI_IN_USE_HINT);
    const delay = reconnectDelay(attempt);
    attempt += 1;
    timer = schedule(() => {
      timer = null;
      if (stopped || ticket !== session) return;
      connect();
    }, delay);
  }

  function connect() {
    clearTimer();
    const url = websocketUrl(settings);
    if (!url) {
      setStatus("error", OMNI_ADDRESS_HINT);
      return;
    }
    if (typeof Socket !== "function") {
      setStatus("error", OMNI_IN_USE_HINT);
      return;
    }
    const ticket = ++session;
    setStatus("connecting", "");
    let ws;
    try {
      ws = new Socket(url);
    } catch {
      armRetry(ticket);
      return;
    }
    try { ws.binaryType = "arraybuffer"; } catch { /* optional on this socket */ }
    socket = ws;
    let settled = false;
    const fail = () => {
      if (ticket !== session || settled || stopped) return;
      settled = true;
      if (socket === ws) socket = null;
      armRetry(ticket);
    };
    ws.onopen = () => {
      if (ticket !== session || stopped) return;
      attempt = 0;
      setStatus("connected", "");
    };
    ws.onmessage = (event) => {
      if (ticket !== session || stopped) return;
      onMessage(event?.data);
    };
    ws.onerror = () => fail();
    ws.onclose = () => fail();
  }

  return {
    start(next) {
      settings = normaliseOmniSettings(next);
      halt();
      if (!settings.enabled) {
        setStatus("disconnected", "");
        return;
      }
      stopped = false;
      attempt = 0;
      connect();
    },
    stop() {
      halt();
      setStatus("disconnected", "");
    },
    status: () => status,
    hint: () => hint,
  };
}
