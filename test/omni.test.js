import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { interpret, messagesFromFixture, parse, replayFixture } from "../omni-adapter.js";
import {
  OMNI_ADDRESS_HINT,
  OMNI_IN_USE_HINT,
  createOmniConnection,
  normaliseOmniSettings,
  reconnectDelay,
  websocketUrl,
} from "../omni-connection.js";
import { createOmniLog } from "../omni-log.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "omni");

function silence(run) {
  const original = console.info;
  console.info = () => {};
  try {
    return run();
  } finally {
    console.info = original;
  }
}

describe("Omni adapter", () => {
  it("returns null and logs until a real frame is known", () => {
    const lines = [];
    const original = console.info;
    console.info = (...args) => lines.push(args.join(" "));
    try {
      assert.equal(parse("not-a-real-frame"), null);
    } finally {
      console.info = original;
    }
    assert.equal(lines.length, 1);
    assert.match(lines[0], /not parsed yet/);
    assert.match(lines[0], /not-a-real-frame/);
  });

  it("recognises the scorer's dart objects and board states", () => {
    assert.deepEqual(interpret({ type: "number", multiplier: 3, value: 20 }), {
      kind: "dart",
      dart: { type: "number", multiplier: 3, value: 20 },
    });
    assert.deepEqual(interpret({ type: "outer" }), { kind: "dart", dart: { type: "outer" } });
    assert.deepEqual(interpret({ type: "inner" }), { kind: "dart", dart: { type: "inner" } });
    assert.deepEqual(interpret({ type: "miss" }), { kind: "dart", dart: { type: "miss" } });
    assert.deepEqual(interpret({ type: "state", state: "takeout" }), { kind: "state", state: "takeout" });
    assert.equal(interpret({ type: "state", state: "calibrating" }).state, "calibrating");
    assert.equal(interpret({ type: "state", state: "ready" }).state, "ready");
    assert.equal(interpret(null), null);
    assert.equal(interpret({ type: "number", multiplier: 4, value: 20 }), null);
    assert.equal(interpret({ type: "state", state: "guessed" }), null);
  });

  it("replays every fixture file through the adapter", () => {
    const names = readdirSync(fixtureDir).filter((name) => /\.(txt|json|log)$/i.test(name));
    assert.ok(names.includes("placeholder.txt"));
    silence(() => {
      for (const name of names) {
        const text = readFileSync(join(fixtureDir, name), "utf8");
        const messages = messagesFromFixture(text);
        assert.ok(messages.length >= 1, name);
        const results = replayFixture(text);
        assert.equal(results.length, messages.length, name);
        for (const result of results) {
          const outcome = interpret(result);
          assert.ok(result === null || outcome, `${name} returned a shape the scorer cannot use`);
        }
      }
    });
  });

  it("treats the placeholder capture as one raw message and does not score it", () => {
    const text = readFileSync(join(fixtureDir, "placeholder.txt"), "utf8");
    assert.equal(messagesFromFixture(text).length, 1);
    assert.equal(messagesFromFixture(text)[0], text);
    silence(() => assert.deepEqual(replayFixture(text), [null]));
  });

  it("replays an exported json capture message by message", () => {
    const log = createOmniLog({ now: () => new Date("2026-11-17T21:00:00.000Z") });
    log.add("frame-one", "single 20");
    log.add(new Uint8Array([1, 2, 3]), "");
    const exported = log.toJSON();
    const seen = [];
    const results = silence(() => replayFixture(exported, (message) => {
      seen.push(message);
      return parse(message);
    }));
    assert.equal(seen[0], "frame-one");
    assert.deepEqual(seen[1], new Uint8Array([1, 2, 3]));
    assert.deepEqual(results, [null, null]);
  });
});

describe("Omni message log", () => {
  it("keeps a note of what was thrown and exports txt and json", () => {
    const log = createOmniLog({ now: () => new Date("2026-11-17T21:04:00.000Z") });
    const entry = log.add("raw-frame");
    log.setNote(entry.id, "treble 20");
    const text = log.toText();
    assert.match(text, /treble 20/);
    assert.match(text, /raw-frame/);
    assert.match(text, /2026-11-17T21:04:00.000Z/);
    const json = JSON.parse(log.toJSON());
    assert.equal(json.source, "the-snake-501-omni");
    assert.equal(json.messages[0].note, "treble 20");
    assert.equal(json.messages[0].raw, "raw-frame");
    assert.equal(json.messages[0].encoding, "text");
  });
});

describe("Omni connection", () => {
  it("stores an empty address and builds a url only from what was typed", () => {
    assert.deepEqual(normaliseOmniSettings(null), { enabled: false, host: "", port: "", path: "" });
    assert.deepEqual(normaliseOmniSettings({ enabled: "yes", host: 12, port: null, path: null }), {
      enabled: false,
      host: "",
      port: "",
      path: "",
    });
    assert.equal(websocketUrl({ enabled: true, host: "", port: "", path: "" }), null);
    assert.equal(websocketUrl({ host: "10.1.1.1", port: "", path: "" }), null);
    assert.equal(websocketUrl({ host: "10.1.1.1", port: "9", path: "" }), "ws://10.1.1.1:9");
    assert.equal(websocketUrl({ host: "10.1.1.1", port: "9", path: "board" }), "ws://10.1.1.1:9/board");
    assert.equal(websocketUrl({ host: "10.1.1.1", port: "9", path: "/live" }), "ws://10.1.1.1:9/live");
    assert.equal(reconnectDelay(0), 1000);
    assert.equal(reconnectDelay(1), 2000);
    assert.equal(reconnectDelay(2), 4000);
    assert.equal(reconnectDelay(8), 30000);
  });

  it("stays disconnected while auto-score is off", () => {
    const sockets = [];
    const connection = createOmniConnection({
      Socket: class {
        constructor(url) { sockets.push(url); }
      },
      schedule() { throw new Error("should not schedule"); },
    });
    connection.start({ enabled: false, host: "10.1.1.1", port: "9", path: "" });
    assert.equal(connection.status(), "disconnected");
    assert.equal(sockets.length, 0);
  });

  it("reports a missing address without opening a socket", () => {
    const sockets = [];
    const connection = createOmniConnection({
      Socket: class {
        constructor(url) { sockets.push(url); }
      },
      schedule() { throw new Error("should not schedule"); },
    });
    connection.start({ enabled: true, host: "  ", port: "", path: "" });
    assert.equal(connection.status(), "error");
    assert.equal(connection.hint(), OMNI_ADDRESS_HINT);
    assert.equal(sockets.length, 0);
  });

  it("reconnects with backoff and names the other-app hint", () => {
    const { connection, sockets, tasks } = harness();
    connection.start({ enabled: true, host: "10.0.0.5", port: "1", path: "" });
    assert.equal(connection.status(), "connecting");
    assert.equal(sockets[0].url, "ws://10.0.0.5:1");
    sockets[0].fail();
    assert.equal(connection.status(), "error");
    assert.equal(connection.hint(), OMNI_IN_USE_HINT);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].ms, 1000);

    tasks[0].fn();
    assert.equal(connection.status(), "connecting");
    sockets[1].fail();
    assert.equal(tasks[1].ms, 2000);

    tasks[1].fn();
    sockets[2].onopen();
    assert.equal(connection.status(), "connected");
    assert.equal(connection.hint(), "");

    sockets[2].close();
    assert.equal(connection.status(), "error");
    assert.equal(tasks.at(-1).ms, 1000);
    connection.stop();
    assert.equal(connection.status(), "disconnected");
    assert.equal(tasks.at(-1).cancelled, true);
  });

  it("forwards a socket message to the scorer", () => {
    const received = [];
    const { connection, sockets } = harness({
      onMessage(data) { received.push(data); },
    });
    connection.start({ enabled: true, host: "10.0.0.8", port: "2", path: "feed" });
    assert.equal(sockets[0].url, "ws://10.0.0.8:2/feed");
    sockets[0].onopen();
    sockets[0].deliver("ping");
    assert.deepEqual(received, ["ping"]);
  });
});

function harness(extra = {}) {
  const tasks = [];
  const sockets = [];
  class FakeSocket {
    constructor(url) {
      this.url = url;
      sockets.push(this);
    }
    close() { this.onclose?.(); }
    fail() {
      this.onerror?.();
      this.onclose?.();
    }
    deliver(data) { this.onmessage?.({ data }); }
  }
  const connection = createOmniConnection({
    Socket: FakeSocket,
    schedule(fn, ms) {
      const task = { fn, ms, cancelled: false };
      tasks.push(task);
      return task;
    },
    cancel(task) { task.cancelled = true; },
    ...extra,
  });
  return { connection, sockets, tasks };
}
