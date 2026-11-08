import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLegalDart, isPossibleVisit } from "../logic/darts.js";
import { BOGEYS, canCheckout, suggestCheckout } from "../logic/checkout.js";
import { makeRand, throwAimed } from "../logic/bot.js";
import { createX01, nextLeg, project, throwDart, typedVisit, undo, aim } from "../logic/x01.js";

const T = (value) => ({ type: "number", multiplier: 3, value });
const D = (value) => ({ type: "number", multiplier: 2, value });
const S = (value) => ({ type: "number", multiplier: 1, value });
const MISS = { type: "miss" };
const BULL = { type: "inner" };

function match(extra = {}, players = [{ name: "Jake" }, { name: "Sam" }]) {
  return createX01({
    players,
    start: 501,
    inRule: "straight",
    outRule: "double",
    legsMode: "single",
    rngSeed: 7,
    ...extra,
  });
}

function shoot(state, ...darts) {
  for (const dart of darts) state = throwDart(state, dart);
  return state;
}

describe("visit totals and checkouts", () => {
  it("rejects impossible three-dart totals and allows real ones", () => {
    for (const total of [179, 178, 176, 175, 173, 172, 169]) {
      assert.equal(isPossibleVisit(total, 3), false, String(total));
    }
    for (const total of [0, 1, 2, 3, 26, 41, 45, 60, 81, 85, 100, 140, 170, 177, 180]) {
      assert.equal(isPossibleVisit(total, 3), true, String(total));
    }
    assert.equal(isPossibleVisit(180, 1), false);
    assert.equal(isPossibleVisit(60, 1), true);
  });

  it("never suggests a bogey or a finish above 170 in three darts", () => {
    for (const score of [...BOGEYS, 171, 172, 180]) {
      assert.equal(canCheckout(score, 3, "double"), false, String(score));
      assert.deepEqual(suggestCheckout(score, 3, "double"), []);
    }
    assert.equal(canCheckout(170, 3, "double"), true);
    assert.equal(canCheckout(40, 1, "double"), true);
    assert.equal(canCheckout(50, 1, "double"), true);
    assert.equal(canCheckout(1, 1, "straight"), true);
    assert.equal(canCheckout(1, 1, "double"), false);
    assert.equal(canCheckout(3, 1, "master"), true);
    const route = suggestCheckout(170, 3, "double", 1)[0];
    assert.ok(route);
    assert.equal(route.labels.at(-1), "Bull");
    assert.equal(route.labels.length <= 3, true);
  });
});

describe("x01 scoring", () => {
  it("subtracts, busts on overshoot and on 1, and checks out on a double", () => {
    let state = match({ start: 101, players: [{ name: "Jake" }] });
    state = shoot(state, T(20), S(20), S(1));
    let view = project(state);
    assert.equal(view.raw.remaining, 20);
    state = shoot(state, S(19));
    view = project(state);
    assert.equal(view.raw.remaining, 20);
    assert.equal(view.raw.stats[0].busts, 1);
    assert.equal(view.lastText.includes("busts"), true);
    state = shoot(state, D(10));
    view = project(state);
    assert.equal(view.phase, "done");
    assert.equal(view.raw.stats[0].highestCheckout, 20);
    assert.equal(view.raw.stats[0].darts, 3 + 1 + 1);
    assert.equal(view.raw.stats[0].points, 81 + 20);
  });

  it("does not bust a straight-out finish on 1 and does bust a single on double-out", () => {
    let straight = match({ start: 101, outRule: "straight", players: [{ name: "Jake" }] });
    straight = shoot(straight, T(20));
    assert.equal(project(straight).headline, "41");
    straight = shoot(straight, D(20), S(1));
    assert.equal(project(straight).phase, "done");

    let doubled = match({ start: 101, players: [{ name: "Jake" }] });
    doubled = shoot(doubled, T(20), S(20), S(1));
    doubled = shoot(doubled, S(20));
    const view = project(doubled);
    assert.equal(view.phase, "live");
    assert.equal(view.raw.remaining, 20);
    assert.equal(view.raw.stats[0].busts, 1);
  });

  it("keeps double in and master in independent of the out", () => {
    let state = match({ start: 101, inRule: "double", players: [{ name: "Jake" }] });
    state = shoot(state, S(20), S(20), S(20));
    assert.equal(project(state).raw.remaining, 101);
    assert.equal(project(state).raw.opened, false);
    state = shoot(state, D(20), S(1), MISS);
    assert.equal(project(state).raw.remaining, 60);
    assert.equal(project(state).raw.opened, true);

    let master = match({ start: 301, inRule: "master", outRule: "master", players: [{ name: "Jake" }] });
    master = shoot(master, S(20));
    assert.equal(project(master).raw.runningOpen, false);
    assert.equal(project(master).headline, "301");
    master = shoot(master, T(20), MISS);
    assert.equal(project(master).raw.remaining, 241);
  });

  it("ends the leg on the checkout dart and records the darts actually thrown", () => {
    let state = match({ start: 101, players: [{ name: "Jake" }] });
    state = shoot(state, T(20), S(1));
    assert.equal(project(state).phase, "live");
    state = shoot(state, D(20));
    const view = project(state);
    assert.equal(view.phase, "done");
    assert.equal(view.raw.stats[0].winningLegDarts[0], 3);
    assert.equal(view.raw.stats[0].darts, 3);
  });

  it("counts a setup double as not a winning-double attempt", () => {
    let state = match({ start: 301, players: [{ name: "Jake" }] });
    state = shoot(state, D(20), MISS, MISS);
    const stats = project(state).raw.stats[0];
    assert.equal(stats.doubleAttempts, 0);
    assert.equal(stats.doubleTracked, false);
    state = shoot(state, D(16));
    const on32 = createX01({ players: [{ name: "Jake" }], start: 101, rngSeed: 1 });
    const aimed = shoot(on32, T(20), S(1), S(8));
    const after = shoot(aimed, S(16), MISS, MISS);
    const rate = project(after).raw.stats[0];
    assert.equal(rate.doubleAttempts, 3);
    assert.equal(rate.doubleHits, 0);
    assert.equal(project(after).raw.remaining, 16);
  });

  it("accepts a typed checkout without naming the finishing dart, and rejects 179", () => {
    const state = match({ start: 101, players: [{ name: "Jake" }] });
    assert.throws(() => typedVisit(state, { total: 179, dartsUsed: 3 }), /impossible/i);
    const stuck = typedVisit(state, { total: 98, dartsUsed: 3 });
    assert.equal(project(stuck).raw.remaining, 3);
    assert.throws(() => typedVisit(stuck, { total: 3, dartsUsed: 1 }), /check out/i);
    const done = typedVisit(state, { total: 101, dartsUsed: 3, doubles: "2" });
    const checked = project(done);
    assert.equal(checked.phase, "done");
    assert.equal(checked.raw.stats[0].doubleHits, 1);
    assert.equal(checked.raw.stats[0].doubleAttempts, 2);
    const open = typedVisit(match({ start: 501, players: [{ name: "Jake" }] }), {
      total: 180,
      dartsUsed: 3,
    });
    const view = project(open);
    assert.equal(view.raw.remaining, 321);
    assert.equal(view.raw.stats[0].oneEighties, 1);
    assert.equal(view.raw.stats[0].tons + view.raw.stats[0].tonForties, 0);
  });

  it("busts a typed total that leaves 1 and tracks an unknown checkout as tracked only when told", () => {
    let state = match({ start: 101, players: [{ name: "Jake" }] });
    state = typedVisit(state, { total: 100, dartsUsed: 3 });
    assert.equal(project(state).raw.remaining, 101);
    assert.equal(project(state).raw.stats[0].busts, 1);
    assert.equal(project(state).raw.stats[0].points, 0);
    assert.equal(project(state).raw.stats[0].doubleTracked, false);
  });

  it("weights the first nine and keeps busts in the average as scoreless darts", () => {
    let state = match({ start: 501, players: [{ name: "Jake" }] });
    state = shoot(state, T(20), T(20), T(20));
    state = shoot(state, T(20), T(19), S(20));
    state = shoot(state, T(20), T(20), T(20));
    state = shoot(state, S(1), MISS, MISS);
    const stats = project(state).raw.stats[0];
    assert.equal(stats.firstNineDarts, 9);
    assert.equal(stats.firstNinePoints, 180 + 137 + 180);
    assert.equal(stats.darts, 12);
    assert.equal(stats.points, 180 + 137 + 180 + 1);
    const average = (3 * stats.points) / stats.darts;
    assert.ok(average > 100);
  });

  it("rotates team-mates and alternates the next leg", () => {
    let state = createX01({
      teams: true,
      players: [{ name: "Jake" }, { name: "Mia" }, { name: "Sam" }, { name: "Ned" }],
      teamNames: ["Home", "Away"],
      start: 101,
      legsMode: "first",
      legs: 2,
      starter: 0,
      alternate: true,
      rngSeed: 4,
    });
    state = shoot(state, T(20));
    assert.equal(project(state).subhead, "Jake");
    assert.equal(project(state).headline, "41");
    state = shoot(state, S(20), S(1));
    assert.equal(project(state).subhead, "Sam");
    assert.equal(project(state).players[0].primary, "20");
    state = shoot(state, S(1), S(1), S(1));
    assert.equal(project(state).subhead, "Mia");
    state = shoot(state, D(10));
    assert.equal(project(state).phase, "between");
    state = nextLeg(state);
    assert.equal(project(state).subhead, "Ned");
    assert.equal(project(state).players[1].primary, "101");
  });

  it("undoes a committed dart without rerolling a bot reply", () => {
    let state = match({ start: 501 }, [{ name: "Jake" }, { name: "Bot", bot: 8 }]);
    state = shoot(state, T(20), T(20), T(20));
    const withBot = throwDart(state, aimDart(state));
    const again = throwDart(undo(withBot), aimDart(undo(withBot)));
    assert.deepEqual(withBot.events.at(-1), again.events.at(-1));
    const back = undo(undo(undo(undo(withBot))));
    assert.equal(project(back).raw.remaining, 501);
  });
});

function aimDart(state) {
  const view = project(state);
  const rand = makeRand(state.rngSeed, state.events.length);
  const target = aim(view, rand);
  return throwAimed(target, view.botLevel, rand);
}

describe("bots", () => {
  it("throws only legal darts and a stronger bot hits more trebles", () => {
    let weakHits = 0;
    let strongHits = 0;
    for (let step = 0; step < 400; step += 1) {
      const weak = throwAimed({ type: "number", multiplier: 3, value: 20 }, 1, makeRand(99, step));
      const strong = throwAimed({ type: "number", multiplier: 3, value: 20 }, 15, makeRand(99, step));
      assert.equal(isLegalDart(weak), true);
      assert.equal(isLegalDart(strong), true);
      if (weak.type === "number" && weak.multiplier === 3 && weak.value === 20) weakHits += 1;
      if (strong.type === "number" && strong.multiplier === 3 && strong.value === 20) strongHits += 1;
    }
    assert.ok(strongHits > weakHits + 150);
  });
});
