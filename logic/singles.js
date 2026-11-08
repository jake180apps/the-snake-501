/** Three darts at each number, then bull. Training points, not a match average. */

import { normaliseDart } from "./darts.js";
import { makeSeed } from "./bot.js";
import { makeSides, memberOn } from "./roster.js";
import { shell } from "./shell.js";

const TARGETS = [...Array.from({ length: 20 }, (_, index) => index + 1), "bull"];

export function create(config = {}) {
  const sides = makeSides(config, { min: 1, max: 4, allowTeams: false });
  return { v: 1, mode: "singles", rngSeed: makeSeed(config), sides, events: [] };
}

export function project(state) {
  const rows = state.sides.map(() => ({ points: 0, darts: 0, hits: 0, singles: 0, doubles: 0, trebles: 0 }));
  let target = 0;
  let turn = 0;
  let pending = [];

  for (const event of state.events) {
    if (target >= TARGETS.length) break;
    if (event.type === "dart") {
      pending.push(event.dart);
      if (pending.length === 3) bank(scoreVisit(TARGETS[target], pending), 3, pending);
    } else if (event.type === "total" && pending.length === 0) bank({ points: event.points, hits: event.hits || (event.points > 0 ? 1 : 0), singles: 0, doubles: 0, trebles: 0 }, 3, []);
  }

  const done = target >= TARGETS.length;
  const active = turn % state.sides.length;
  const thrower = memberOn(state.sides[active], 0);
  const best = Math.max(...rows.map((row) => row.points));
  return shell({
    phase: done ? "done" : "live",
    title: "Singles training",
    kicker: done ? "63 darts complete" : `Target ${label(TARGETS[target])} · ${target + 1}/21`,
    note: "Single 1, double 2, treble 3 training points on the target only. You move on after three darts.",
    headline: done ? String(best) : label(TARGETS[target]),
    headlineLabel: done ? "training points" : "target",
    subhead: thrower.name,
    colour: state.sides[active].swatch,
    players: state.sides.map((side, index) => ({
      name: side.name,
      primary: String(rows[index].points),
      secondary: "training points",
      active: !done && index === active,
      out: false,
      swatch: side.swatch,
      detail: "",
    })),
    darts: pending.map((dart) => ({ label: dart.type === "number" ? `${dart.value}` : dart.type })),
    dartsThisVisit: pending.length,
    canThrow: !done,
    canType: !done && pending.length === 0,
    canUndo: state.events.length > 0,
    botTurn: !done && !!thrower.bot,
    botLevel: thrower.bot,
    bot: thrower.bot ? { level: thrower.bot, target: TARGETS[target] } : null,
    end: done ? {
      title: rows.filter((row) => row.points === best).length === 1
        ? `${state.sides[rows.findIndex((row) => row.points === best)].name} wins`
        : "Shared total",
      subtitle: "Training points · maximum 186",
      rows: [{ label: "Maximum", value: "186" }],
      players: state.sides.map((side, index) => ({
        name: side.name,
        rows: [
          { label: "Training points", value: String(rows[index].points) },
          { label: "Hits", value: `${rows[index].hits}/63` },
          { label: "Hit rate", value: `${Math.round((rows[index].hits / 63) * 100)}%` },
        ],
      })),
    } : null,
    rulesBrief: "Three darts at 1, then 2, and so on through 20, then bull. You advance even if you miss. On the live number a single is 1 training point, a double 2 and a treble 3. Outer bull is 1, inner bull is 2.",
    raw: { target: TARGETS[target] || null, rows },
  });

  function bank(scored, darts, dartsThrown) {
    const index = turn % state.sides.length;
    const row = rows[index];
    row.points += scored.points;
    row.darts += darts;
    row.hits += scored.hits;
    row.singles += scored.singles || 0;
    row.doubles += scored.doubles || 0;
    row.trebles += scored.trebles || 0;
    void dartsThrown;
    pending = [];
    turn += 1;
    if (turn % state.sides.length === 0) target += 1;
  }
}

export function scoreVisit(target, darts) {
  let points = 0;
  let hits = 0;
  let singles = 0;
  let doubles = 0;
  let trebles = 0;
  for (const dart of darts) {
    const clean = normaliseDart(dart);
    if (target === "bull") {
      if (clean.type === "outer") { points += 1; hits += 1; singles += 1; }
      if (clean.type === "inner") { points += 2; hits += 1; doubles += 1; }
      continue;
    }
    if (clean.type === "number" && clean.value === target) {
      points += clean.multiplier;
      hits += 1;
      if (clean.multiplier === 1) singles += 1;
      if (clean.multiplier === 2) doubles += 1;
      if (clean.multiplier === 3) trebles += 1;
    }
  }
  return { points, hits, singles, doubles, trebles };
}

export function addDart(state, dart) {
  if (!project(state).canThrow) throw new Error("Singles training is over");
  return { ...state, events: [...state.events, { type: "dart", dart: normaliseDart(dart) }] };
}

export function addTyped(state, payload) {
  const view = project(state);
  if (!view.canType) throw new Error("This target is closed");
  const points = Number(payload.total ?? payload.points ?? 0);
  const max = view.raw.target === "bull" ? 6 : 9;
  if (!Number.isInteger(points) || points < 0 || points > max) throw new Error(`Training points must be from 0 to ${max}`);
  return { ...state, events: [...state.events, { type: "total", points, hits: Number(payload.hits ?? (points > 0 ? 1 : 0)) }] };
}

export function undo(state) {
  if (!state.events.length) return state;
  return { ...state, events: state.events.slice(0, -1) };
}

export function act() {
  throw new Error("Nothing to continue");
}

export function aim(view) {
  const target = view.bot?.target || view.raw.target;
  if (target === "bull") return { type: (view.botLevel || 1) >= 8 ? "inner" : "outer" };
  return { type: "number", multiplier: (view.botLevel || 1) >= 6 ? 3 : 1, value: target };
}

export function schema(view) {
  const max = view.raw.target === "bull" ? 6 : 9;
  return {
    fields: [{ id: "hint", type: "note", label: `Training points this visit (0–${max}).` }],
    common: false,
    miss: true,
    bust: false,
    placeholder: "Training points",
  };
}

function label(target) {
  return target === "bull" ? "Bull" : String(target ?? "");
}

export function step(state) {
  return state.events.length;
}
