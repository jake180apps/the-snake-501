import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLegalDart } from "../logic/darts.js";
import { bracketSlots } from "../logic/tournament.js";
import { legalTargets } from "../logic/random.js";
import { act, addDarts, addTyped, botThrow, create, project, undo } from "../logic/index.js";

const T = (value) => ({ type: "number", multiplier: 3, value });
const D = (value) => ({ type: "number", multiplier: 2, value });
const S = (value) => ({ type: "number", multiplier: 1, value });
const MISS = { type: "miss" };

function play(state, ...darts) {
  return addDarts(state, darts);
}

describe("winner stays on", () => {
  it("only allows the two formats and rotates the winner", () => {
    assert.throws(() => create("winner", { variant: "101", players: [{ name: "A" }, { name: "B" }] }));
    let state = create("winner", {
      variant: "501",
      random: false,
      rngSeed: 3,
      players: [{ name: "Ann" }, { name: "Ben" }, { name: "Cleo" }],
    });
    state = play(state, T(20), T(20), T(20));
    assert.equal(project(state).subhead, "Ben");
    state = undo(state);
    state = undo(state);
    state = undo(state);
    assert.equal(project(state).headline, "501");
  });
});

describe("tournament", () => {
  it("gives byes no darts and uses a standard 8 draw", () => {
    assert.deepEqual(bracketSlots(8), [1, 8, 4, 5, 2, 7, 3, 6]);
    let state = create("tournament", {
      seeding: "manual",
      rngSeed: 5,
      start: 101,
      players: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }, { name: "E" }],
    });
    const bye = state.rounds[0].matches.find((match) => match.bye);
    assert.ok(bye);
    assert.equal(state.records.every((row) => row.darts === 0), true);
    state = act(state, "begin");
    assert.equal(project(state).phase, "live");
    assert.equal(state.records.every((row) => row.darts === 0), true);
  });
});

describe("cricket", () => {
  it("scores the spare marks on the closing treble and supports cut-throat", () => {
    let state = create("cricket", { rngSeed: 1, players: [{ name: "Ann" }, { name: "Ben" }] });
    state = play(state, D(20), T(20));
    assert.equal(project(state).raw.points[0], 40);
    assert.equal(project(state).raw.marks[0][20], 3);
    let cut = create("cricket", { rngSeed: 1, cutThroat: true, players: [{ name: "Ann" }, { name: "Ben" }] });
    cut = play(cut, D(20), T(20));
    assert.equal(project(cut).raw.points[0], 0);
    assert.equal(project(cut).raw.points[1], 40);
  });
});

describe("halve-it", () => {
  it("halves odd totals down and keeps a qualifying hit", () => {
    let state = create("halve", { rngSeed: 1, players: [{ name: "Ann" }] });
    state = addTyped(state, { total: 45 });
    assert.equal(project(state).players[0].primary, "45");
    state = addTyped(state, { total: 0 });
    assert.equal(project(state).players[0].primary, "22");
    assert.equal(project(state).raw.scores[0].halves, 1);
  });
});

describe("shanghai", () => {
  it("wins immediately on single, double and treble in any order", () => {
    let state = create("shanghai", { rngSeed: 1, length: 7, players: [{ name: "Ann" }, { name: "Ben" }] });
    state = play(state, D(1), S(1), T(1));
    const view = project(state);
    assert.equal(view.phase, "done");
    assert.equal(view.raw.winner, 0);
    assert.equal(view.players[0].primary, "6");
  });
});

describe("around the clock", () => {
  it("advances inside the visit and does not skip unless asked", () => {
    let state = create("clock", { rngSeed: 1, players: [{ name: "Ann" }] });
    state = play(state, S(1), D(2), T(3));
    assert.equal(project(state).raw.rows[0].at, 3);
    let skip = create("clock", { rngSeed: 1, skip: true, players: [{ name: "Ann" }] });
    skip = play(skip, D(1));
    assert.equal(project(skip).raw.rows[0].at, 2);
  });
});

describe("121", () => {
  it("climbs after a finish and falls back to the three-dart safehouse", () => {
    let state = create("ladder", { rngSeed: 1, attempts: 4, players: [{ name: "Ann" }] });
    state = play(state, T(20), T(19), D(2));
    let view = project(state);
    assert.equal(view.raw.rows[0].completed, 121);
    assert.equal(view.raw.rows[0].safe, 121);
    assert.equal(view.raw.rows[0].target, 122);
    state = addTyped(state, { total: 0, miss: true, dartsUsed: 3 });
    state = addTyped(state, { total: 0, miss: true, dartsUsed: 3 });
    state = addTyped(state, { total: 0, miss: true, dartsUsed: 3 });
    view = project(state);
    assert.equal(view.raw.rows[0].target, 121);
    assert.equal(view.raw.rows[0].completed, 121);
  });
});

describe("score, singles and doubles", () => {
  it("counts score training without a checkout and scores training points", () => {
    let score = create("score", { rngSeed: 1, visits: 1, players: [{ name: "Ann" }] });
    score = play(score, T(20), T(20), T(20));
    assert.equal(project(score).phase, "done");
    assert.equal(project(score).end.players[0].rows.find((row) => row.label === "180s").value, "1");
    assert.equal(project(score).end.players[0].rows.some((row) => row.label === "Checkout"), false);

    let singles = create("singles", { rngSeed: 1, players: [{ name: "Ann" }] });
    singles = play(singles, T(1), D(1), S(1));
    assert.equal(project(singles).players[0].primary, "6");
    assert.equal(project(singles).raw.target, 2);

    let doubles = create("doubles", { rngSeed: 1, bull: false, players: [{ name: "Ann" }] });
    doubles = play(doubles, S(1), D(1));
    assert.equal(project(doubles).headline, "D2");
    assert.equal(project(doubles).raw.rows[0].darts, 2);
  });
});

describe("random checkout", () => {
  it("draws only real three-dart doubles", () => {
    const targets = legalTargets({ budget: 3, outRule: "double", min: 2, max: 180, preset: "random" });
    for (const bogey of [169, 168, 166, 165, 163, 162, 159, 171, 180]) {
      assert.equal(targets.includes(bogey), false);
    }
    assert.equal(targets.includes(170), true);
    let state = create("random", { rngSeed: 11, rounds: 1, budget: 3, players: [{ name: "Ann" }] });
    const target = project(state).raw.target;
    assert.equal(targets.includes(target), true);
  });
});

describe("killer", () => {
  it("activates on your double, punishes a later self-hit, and ignores a quiet dart", () => {
    let state = create("killer", { rngSeed: 2, numbers: [20, 19], players: [{ name: "Ann" }, { name: "Ben" }] });
    state = play(state, S(20));
    assert.equal(project(state).players[0].detail, "");
    assert.equal(project(state).players[0].primary, "3");
    state = play(state, D(20));
    assert.equal(project(state).raw.players[0].killer, true);
    assert.equal(project(state).raw.players[0].lives, 3);
    state = play(state, D(20));
    assert.equal(project(state).raw.players[0].lives, 2);
    assert.equal(project(state).raw.players[0].selfHits, 1);
  });
});

describe("higher and lower", () => {
  it("moves only the bar that was beaten and eliminates a miss or an equal score", () => {
    let state = create("higher", { rngSeed: 1, players: [{ name: "Ann" }, { name: "Ben" }] });
    state = play(state, T(20), MISS, S(20));
    assert.equal(project(state).players[0].out, true);
    assert.equal(project(state).raw.high, 41);
    state = create("higher", { rngSeed: 1, players: [{ name: "Ann" }, { name: "Ben" }] });
    state = play(state, T(20), S(20), S(20));
    assert.equal(project(state).raw.high, 100);
    assert.equal(project(state).raw.low, 26);
    state = play(state, S(5), S(5), S(5));
    assert.equal(project(state).raw.low, 15);
    assert.equal(project(state).raw.high, 100);
    state = play(state, T(1), S(20), S(20));
    assert.equal(project(state).players[0].out, true);
    assert.equal(project(state).raw.high, 100);
  });
});

describe("bots stay legal", () => {
  it("throws a legal dart in every bot mode", () => {
    const setups = [
      ["x01", { start: 301, players: [{ name: "Bot", bot: 15 }, { name: "Ann" }] }],
      ["cricket", { players: [{ name: "Bot", bot: 4 }, { name: "Ann" }] }],
      ["halve", { players: [{ name: "Bot", bot: 8 }] }],
      ["shanghai", { players: [{ name: "Bot", bot: 10 }] }],
      ["clock", { players: [{ name: "Bot", bot: 6 }] }],
      ["score", { visits: 1, players: [{ name: "Bot", bot: 12 }] }],
      ["singles", { players: [{ name: "Bot", bot: 3 }] }],
      ["doubles", { players: [{ name: "Bot", bot: 9 }] }],
      ["killer", { numbers: [11, 12], players: [{ name: "Bot", bot: 7 }, { name: "Ann" }] }],
      ["higher", { players: [{ name: "Bot", bot: 5 }, { name: "Ann" }] }],
      ["ladder", { attempts: 1, players: [{ name: "Bot", bot: 11 }] }],
      ["random", { rounds: 1, players: [{ name: "Bot", bot: 2 }] }],
    ];
    for (const [mode, config] of setups) {
      let state = create(mode, { ...config, rngSeed: 42 });
      if (project(state).phase === "confirm") state = act(state, "begin");
      const next = botThrow(state);
      const event = next.events?.at(-1) || next.x01?.events?.at(-1) || next.match?.events?.at(-1);
      const dart = event?.dart || event?.darts?.[0];
      assert.equal(isLegalDart(dart), true, mode);
      const again = botThrow(undo(next));
      const replay = again.events?.at(-1) || again.x01?.events?.at(-1) || again.match?.events?.at(-1);
      assert.deepEqual(replay?.dart || replay?.darts?.[0], dart, mode);
    }
  });
});
