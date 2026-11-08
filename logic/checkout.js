/** Checkout routes. Bogey numbers are never offered. */

import { dartLabel, dartPoints, isDouble, isTreble, scoringFaces } from "./darts.js";

export const BOGEYS = [169, 168, 166, 165, 163, 162, 159];
const BOGEY_SET = new Set(BOGEYS);

export function isBogey(score) {
  return BOGEY_SET.has(score);
}

export function finishOk(dart, outRule) {
  if (outRule === "straight") return dartPoints(dart) > 0;
  if (outRule === "double") return isDouble(dart);
  if (outRule === "master") return isDouble(dart) || isTreble(dart);
  return false;
}

export function bustsOnLeave(leave, outRule) {
  if (leave < 0) return true;
  if ((outRule === "double" || outRule === "master") && leave === 1) return true;
  return false;
}

export function finishingFaces(outRule) {
  return scoringFaces().filter((dart) => finishOk(dart, outRule));
}

const POSITIVE = [...new Set(scoringFaces().map((dart) => dartPoints(dart)).filter((score) => score > 0))];

const TABLE = {
  straight: buildTable("straight"),
  double: buildTable("double"),
  master: buildTable("master"),
};

function buildTable(outRule) {
  const maxDarts = 9;
  const ok = Array.from({ length: maxDarts + 1 }, () => new Set());
  for (const dart of finishingFaces(outRule)) ok[1].add(dartPoints(dart));
  for (let darts = 2; darts <= maxDarts; darts += 1) {
    for (const score of ok[darts - 1]) ok[darts].add(score);
    for (const leave of ok[darts - 1]) {
      if (bustsOnLeave(leave, outRule)) continue;
      for (const points of POSITIVE) ok[darts].add(points + leave);
    }
  }
  return ok;
}

export function canCheckout(score, darts, outRule = "double") {
  if (!Number.isInteger(score) || score <= 0) return false;
  const rule = TABLE[outRule] ? outRule : "double";
  const budget = Math.max(1, Math.min(9, darts | 0));
  return TABLE[rule][budget].has(score);
}

const SETUPS = setupOrder();

function setupOrder() {
  const list = [];
  for (let value = 20; value >= 1; value -= 1) list.push({ type: "number", multiplier: 3, value });
  list.push({ type: "inner" }, { type: "outer" });
  for (let value = 20; value >= 1; value -= 1) list.push({ type: "number", multiplier: 2, value });
  for (let value = 20; value >= 1; value -= 1) list.push({ type: "number", multiplier: 1, value });
  return list;
}

function finishRank(dart) {
  const points = dartPoints(dart);
  if (points === 50) return 100;
  if (points === 40) return 90;
  if (points === 32) return 80;
  if (points === 16) return 70;
  if (dart.type === "inner") return 60;
  return points;
}

function routeText(darts) {
  return darts.map((dart) => dartLabel(dart)).join(" · ");
}

/**
 * Up to `limit` ways to finish `score` inside this visit (at most 3 darts).
 * When the finish needs a later visit, returns one safe setup route instead.
 * Never returns a bogey or a total above 170 for a three-dart double finish.
 */
export function suggestCheckout(score, dartsLeft, outRule = "double", limit = 3) {
  const left = dartsLeft | 0;
  const visit = Math.min(3, Math.max(0, left));
  if (visit < 1 || !canCheckout(score, Math.max(left, visit), outRule)) return [];
  if (outRule === "double" && visit >= 3 && left <= 3 && (score > 170 || isBogey(score))) return [];

  const found = [];
  if (canCheckout(score, visit, outRule)) {
    walk(score, visit, [], found, outRule, limit);
  }
  const unique = dedupe(found).slice(0, limit);
  if (unique.length) return unique.map(pack);
  const setup = setupRoute(score, left, outRule);
  return setup.length ? [pack(setup)] : [];
}

function walk(remaining, darts, path, found, outRule, limit) {
  if (found.length >= limit) return;
  if (darts === 1) {
    const hits = finishingFaces(outRule)
      .filter((dart) => dartPoints(dart) === remaining)
      .sort((a, b) => finishRank(b) - finishRank(a));
    if (hits[0]) found.push([...path, hits[0]]);
    return;
  }
  let branched = 0;
  for (const dart of SETUPS) {
    if (found.length >= limit || branched >= 5) return;
    const points = dartPoints(dart);
    if (points <= 0 || points >= remaining) continue;
    const leave = remaining - points;
    if (bustsOnLeave(leave, outRule)) continue;
    if (!canCheckout(leave, darts - 1, outRule)) continue;
    branched += 1;
    walk(leave, darts - 1, [...path, dart], found, outRule, limit);
  }
}

function setupRoute(score, dartsLeft, outRule) {
  const route = [];
  let remaining = score;
  const steps = Math.min(3, Math.max(0, dartsLeft - 1));
  for (let index = 0; index < steps; index += 1) {
    const after = dartsLeft - route.length - 1;
    let pick = null;
    for (const dart of SETUPS) {
      const points = dartPoints(dart);
      if (points <= 0 || points >= remaining) continue;
      const leave = remaining - points;
      if (bustsOnLeave(leave, outRule)) continue;
      if (!canCheckout(leave, after, outRule)) continue;
      pick = dart;
      break;
    }
    if (!pick) break;
    route.push(pick);
    remaining -= dartPoints(pick);
    const room = Math.min(3 - route.length, dartsLeft - route.length);
    if (room >= 1 && canCheckout(remaining, room, outRule)) {
      const finish = [];
      walk(remaining, room, [], finish, outRule, 1);
      if (finish[0]) return [...route, ...finish[0]];
      break;
    }
  }
  return route;
}

function dedupe(routes) {
  const seen = new Set();
  const out = [];
  for (const route of routes) {
    const text = routeText(route);
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(route);
  }
  return out;
}

function pack(darts) {
  return {
    darts: darts.map((dart) => ({ ...dart })),
    labels: darts.map((dart) => dartLabel(dart)),
    text: routeText(darts),
  };
}

export function finishChoices(outRule, remaining, dartsUsed) {
  const darts = Math.max(1, Math.min(3, dartsUsed | 0));
  const options = [];
  for (const dart of finishingFaces(outRule)) {
    const points = dartPoints(dart);
    if (points <= 0 || points > remaining) continue;
    const setup = remaining - points;
    const setupDarts = darts - 1;
    if (setup === 0 && setupDarts >= 0) {
      options.push(dart);
      continue;
    }
    if (setupDarts >= 1 && setup > 0) options.push(dart);
  }
  const unique = [];
  const seen = new Set();
  for (const dart of options.sort((a, b) => finishRank(b) - finishRank(a))) {
    const label = dartLabel(dart);
    if (seen.has(label)) continue;
    seen.add(label);
    unique.push({ id: label, label, dart });
  }
  return unique;
}
