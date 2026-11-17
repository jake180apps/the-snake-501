/** In-memory capture of raw Omni frames, with a note of what was thrown. */

export const OMNI_LOG_STORAGE_KEY = "snake501.omni.log";

const CAP = 300;

export function createOmniLog(options = {}) {
  const now = options.now || (() => new Date());
  const cap = options.cap || CAP;
  const entries = [];
  let nextId = 1;

  function snapshot(entry) {
    return {
      id: entry.id,
      at: entry.at,
      encoding: entry.encoding,
      raw: entry.raw,
      note: entry.note,
    };
  }

  return {
    add(data, note = "") {
      const stored = normaliseRaw(data);
      const entry = {
        id: nextId++,
        at: now().toISOString(),
        encoding: stored.encoding,
        raw: stored.raw,
        note: String(note || ""),
      };
      entries.push(entry);
      while (entries.length > cap) entries.shift();
      return snapshot(entry);
    },
    setNote(id, note) {
      const entry = entries.find((item) => item.id === Number(id));
      if (!entry) return null;
      entry.note = String(note ?? "");
      return snapshot(entry);
    },
    list() {
      return entries.map(snapshot);
    },
    clear() {
      entries.length = 0;
    },
    load(saved) {
      if (!Array.isArray(saved)) return;
      entries.length = 0;
      for (const item of saved) {
        if (!item || typeof item.raw !== "string") continue;
        entries.push({
          id: nextId++,
          at: typeof item.at === "string" ? item.at : now().toISOString(),
          encoding: item.encoding === "base64" ? "base64" : "text",
          raw: item.raw,
          note: typeof item.note === "string" ? item.note : "",
        });
      }
      while (entries.length > cap) entries.shift();
    },
    toJSON(exportedAt = now()) {
      return JSON.stringify({
        source: "the-snake-501-omni",
        exportedAt: exportedAt.toISOString(),
        messages: entries.map(snapshot),
      }, null, 2);
    },
    toText() {
      const blocks = entries.map((entry) => {
        const lines = [entry.at];
        if (entry.encoding === "base64") lines.push("Encoding: base64");
        if (entry.note) lines.push(`Note: ${entry.note}`);
        lines.push(entry.raw);
        return lines.join("\n");
      });
      const body = blocks.length ? blocks.join("\n\n---\n\n") : "No messages yet.";
      return `Target Omni capture\nEach block is one raw message and the note of what was thrown.\n\n${body}\n`;
    },
  };
}

export function normaliseRaw(data) {
  if (typeof data === "string") return { encoding: "text", raw: data };
  if (data instanceof ArrayBuffer) return { encoding: "base64", raw: bytesToBase64(new Uint8Array(data)) };
  if (ArrayBuffer.isView(data)) {
    return {
      encoding: "base64",
      raw: bytesToBase64(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)),
    };
  }
  return { encoding: "text", raw: data == null ? "" : String(data) };
}

export function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
