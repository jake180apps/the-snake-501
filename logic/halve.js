/** Traditional nine-round Halve-It. Miss the round and the total is halved, rounding down. */

import { dartPoints, isDouble, isTreble, normaliseDart } from "./darts.js";
import { makeSeed } from "./bot.js";
import { makeSides, memberOn } from "./roster.js";
import { shell } from "./shell.js";

export const ROUNDS = [
  { kind: "number", n: 15, label: "15" },
  { kind: "number", n: 16, label: "16" },
  { kind: "double", label: "Any double" },
  { kind: "number", n: 17, label: "17" },
  { kind: "number", n: 18, label: "18" },
  { kind: "treble", label: "Any treble" },
  { kind: "number", n: 19, label: "19" },
  { kind: "number", n: 20, label: "20" },
  { kind: "bull", label: "Bull" },
];

const POSSIBLE = new Map(ROUNDS.map((round) => [round.label, sums(round)]));

export function create(config = {}) {
  const sides = makeSides(config, { min: 1, max: 4, allowTeams: true });
  return { v: 1, mode: "halve", rngSeed: makeSeed(config), sides, events: [] };
}

export function project(state) {
  const scores = state.sides.map(() => ({ total: 0, success: 0, failed: 0, halves: 0, best: 0 }));
  const visits = state.sides.map(() => 0);
  let round = 0;
  let turn = 0;
  let pending = [];
  let lastText = "";

  for (const event of state.events) {
    if (round >= ROUNDS.length) break;
    if (event.type === "dart") {
      pending.push(event.dart);
      if (pending.length === 3) close(qualifying(ROUNDS[round], pending));
    } else if (event.type === "total" && pending.length === 0) close(event.points);
  }

  const done = round >= ROUNDS.length;
  const active = turn % state.sides.length;
  const thrower = memberOn(state.sides[active] || state.sides[0], visits[active] || 0);
  const best = Math.max(...scores.map((score) => score.total));
  const leaders = scores.map((score, index) => (score.total === best ? state.sides[index].name : null)).filter(Boolean);
  return shell({
    phase: done ? "done" : "live",
    title: "Halve-It",
    kicker: done ? "Nine rounds complete" : `Round ${round + 1} of 9 · ${ROUNDS[round].label}`,
    note: "A round with no qualifying dart halves the total, rounding down.",
    headline: done ? String(best) : String(scores[active].total),
    headlineLabel: done ? "winning total" : "total",
    subhead: done ? leaders.join(" & ") : `${thrower.name} · ${ROUNDS[round].label}`,
    colour: state.sides[active]?.swatch || "#2E9BDB",
    players: state.sides.map((side, index) => ({
      name: side.name,
      primary: String(scores[index].total),
      secondary: `${scores[index].success} hit · ${scores[index].halves} halved`,
      active: !done && index === active,
      out: false,
      swatch: side.swatch,
      detail: "",
    })),
    darts: pending.map((dart) => ({ label: labelOf(dart) })),
    dartsThisVisit: pending.length,
    lastText,
    canThrow: !done,
    canType: !done && pending.length === 0,
    canUndo: state.events.length > 0,
    botTurn: !done && !!thrower.bot,
    botLevel: thrower.bot,
    bot: thrower.bot ? { level: thrower.bot } : null,
    end: done ? {
      title: leaders.length === 1 ? `${leaders[0]} wins` : "Shared win",
      subtitle: "Halve-It · nine rounds from 0",
      rows: [],
      players: state.sides.map((side, index) => ({
        name: side.name,
        rows: [
          { label: "Total", value: String(scores[index].total) },
          { label: "Rounds hit", value: String(scores[index].success) },
          { label: "Rounds missed", value: String(scores[index].failed) },
          { label: "Halvings", value: String(scores[index].halves) },
          { label: "Best round", value: String(scores[index].best) },
        ],
      })),
    } : null,
    rulesBrief: rulesText(),
    raw: { round, scores, target: done ? null : ROUNDS[round] },
  });

  function close(points) {
    const index = turn % state.sides.length;
    const score = scores[index];
    if (points > 0) {
      score.total += points;
      score.success += 1;
      if (points > score.best) score.best = points;
      lastText = `${state.sides[index].name} scores ${points}`;
    } else {
      score.total = Math.floor(score.total / 2);
      score.failed += 1;
      score.halves += 1;
      lastText = `${state.sides[index].name} halves to ${score.total}`;
    }
    visits[index] += 1;
    pending = [];
    turn += 1;
    if (turn % state.sides.length === 0) round += 1;
  }
}

export function qualifying(round, darts) {
  let total = 0;
  for (const dart of darts) {
    const clean = normaliseDart(dart);
    if (round.kind === "number" && clean.type === "number" && clean.value === round.n) total += dartPoints(clean);
    if (round.kind === "double" && isDouble(clean)) total += dartPoints(clean);
    if (round.kind === "treble" && isTreble(clean)) total += dartPoints(clean);
    if (round.kind === "bull" && (clean.type === "outer" || clean.type === "inner")) total += dartPoints(clean);
  }
  return total;
}

export function addDart(state, dart) {
  if (project(state).phase !== "live") throw new Error("Halve-It is over");
  return { ...state, events: [...state.events, { type: "dart", dart: normaliseDart(dart) }] };
}

export function addTyped(state, payload) {
  const view = project(state);
  if (!view.canType) throw new Error("A round total cannot be entered now");
  const points = Number(payload.total ?? payload.points ?? 0);
  if (!POSSIBLE.get(view.raw.target.label).has(points)) throw new Error("That is not a qualifying total for this round");
  return { ...state, events: [...state.events, { type: "total", points }] };
}

export function undo(state) {
  if (!state.events.length) return state;
  return { ...state, events: state.events.slice(0, -1) };
}

export function act() {
  throw new Error("Nothing to continue");
}

export function aim(view, rand) {
  const round = view.raw.target;
  const level = view.botLevel || 1;
  if (!round) return { type: "number", multiplier: 1, value: 20 };
  if (round.kind === "bull") return { type: level >= 8 && rand() < 0.6 ? "inner" : "outer" };
  if (round.kind === "double") return { type: "number", multiplier: 2, value: level >= 8 ? 20 : 16 };
  if (round.kind === "treble") return { type: "number", multiplier: 3, value: 20 };
  return { type: "number", multiplier: level >= 6 ? 3 : 1, value: round.n };
}

export function schema(view) {
  return {
    fields: [{ id: "hint", type: "note", label: `Qualifying points at ${view.raw.target?.label || "this round"}. Enter 0 for a miss.` }],
    common: false,
    miss: true,
    bust: false,
    placeholder: "Qualifying points",
  };
}

export function rulesText() {
  return "Nine shared rounds: 15, 16, any double, 17, 18, any treble, 19, 20, bull. You start on 0. One qualifying dart keeps the total and adds the qualifying points. Three misses halve it, rounding down. Highest total wins.";
}

export function step(state) {
  return state.events.length;
}

function labelOf(dart) {
  const clean = normaliseDart(dart);
  if (clean.type === "miss") return "Miss";
  if (clean.type === "outer") return "25";
  if (clean.type === "inner") return "Bull";
  return `${clean.multiplier === 1 ? "S" : clean.multiplier === 2 ? "D" : "T"}${clean.value}`;
}

function sums(round) {
  const faces = [0];
  if (round.kind === "number") faces.push(round.n, round.n * 2, round.n * 3);
  if (round.kind === "double") {
    for (let n = 1; n <= 20; n += 1) faces.push(n * 2);
    faces.push(50);
  }
  if (round.kind === "treble") for (let n = 1; n <= 20; n += 1) faces.push(n * 3);
  if (round.kind === "bull") faces.push(25, 50);
  let layer = new Set([0]);
  for (let dart = 0; dart < 3; dart += 1) {
    const next = new Set();
    for (const total of layer) for (const face of faces) next.add(total + face);
    layer = next;
  }
  return layer;
}
