/**
 * Target Omni message adapter.
 *
 * The wire format is not known. `parse` returns null until a captured frame
 * shows what the board actually sends. It must not invent a layout.
 *
 * A future parser returns one of the scorer's dart objects:
 *   { type: "number", multiplier, value }  multiplier 1, 2 or 3; value 1–20
 *   { type: "outer" }  { type: "inner" }  { type: "miss" }
 * or a board state { type: "state", state: "takeout" | "calibrating" | "ready" }
 * or null when the message is neither.
 */

const STATES = new Set(["takeout", "calibrating", "ready"]);

export function parse(rawMessage) {
  console.info("Omni adapter: message not parsed yet", previewForLog(rawMessage));
  return null;
}

/** Turn a parse() result into a dart, a state event, or null. */
export function interpret(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.type === "state") {
    if (!STATES.has(parsed.state)) return null;
    return { kind: "state", state: parsed.state };
  }
  if (parsed.type === "miss" || parsed.type === "outer" || parsed.type === "inner") {
    return { kind: "dart", dart: { type: parsed.type } };
  }
  if (parsed.type === "number") {
    const multiplier = parsed.multiplier;
    const value = parsed.value;
    if (multiplier !== 1 && multiplier !== 2 && multiplier !== 3) return null;
    if (!Number.isInteger(value) || value < 1 || value > 20) return null;
    return { kind: "dart", dart: { type: "number", multiplier, value } };
  }
  return null;
}

/**
 * Replay one fixture through the adapter.
 * A JSON export from this app (source "the-snake-501-omni") is replayed message
 * by message. Any other file is a single raw capture, passed through unchanged.
 */
export function replayFixture(text, parseMessage = parse) {
  return messagesFromFixture(text).map((message) => parseMessage(message));
}

export function messagesFromFixture(text) {
  const source = String(text ?? "");
  const trimmed = source.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed);
      if (data?.source === "the-snake-501-omni" && Array.isArray(data.messages)) {
        return data.messages.map(decodeExportMessage);
      }
    } catch {
      /* Not our export. The whole file is one raw message. */
    }
  }
  return [source];
}

function decodeExportMessage(message) {
  if (!message || typeof message.raw !== "string") return "";
  if (message.encoding === "base64") return base64ToBytes(message.raw);
  return message.raw;
}

export function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function previewForLog(rawMessage) {
  if (typeof rawMessage === "string") {
    return rawMessage.length > 180 ? `${rawMessage.slice(0, 180)}...` : rawMessage;
  }
  if (rawMessage instanceof ArrayBuffer) return `[binary ${rawMessage.byteLength} bytes]`;
  if (ArrayBuffer.isView(rawMessage)) return `[binary ${rawMessage.byteLength} bytes]`;
  if (rawMessage == null) return "[empty]";
  return `[${typeof rawMessage}]`;
}
