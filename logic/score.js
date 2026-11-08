/** Count-up. No double-out and no bust. */

import { dartPoints, isPossibleVisit, normaliseDart } from "./darts.js";
import { makeSeed } from "./bot.js";
import { makeSides, memberOn } from "./roster.js";
import { shell } from "./shell.js";

export function create(config = {}) {
  const sides = makeSides(config, { min: 1, max: 4, allowTeams: true });
  const visits = Number.isInteger(config.visits) ? config.visits : 10;
  if (visits < 1 || visits > 50) throw new Error("Choose between 1 and 50 visits");
  return { v: 1, mode: "score", rngSeed: makeSeed(config), sides, config: { visits }, events: [] };
}

export function project(state) {
  const rows = state.sides.map(() => ({ total: 0, darts: 0, visits: 0, best: 0, tons: 0, oneEighty: 0 }));
  let pending = [];
  let turn = 0;
  const needed = state.config.visits;

  for (const event of state.events) {
    if (rows.every((row) => row.visits >= needed)) break;
    const index = turn % state.sides.length;
    if (rows[index].visits >= needed) {
      turn += 1;
      continue;
    }
    if (event.type === "dart") {
      pending.push(event.dart);
      if (pending.length === 3) bank(index, pending.reduce((sum, dart) => sum + dartPoints(dart), 0), 3);
    } else if (event.type === "total" && pending.length === 0) bank(index, event.points, event.dartsUsed || 3);
  }

  const done = rows.every((row) => row.visits >= needed);
  const active = nextIndex();
  const thrower = memberOn(state.sides[active], rows[active].visits);
  const best = Math.max(...rows.map((row) => row.total));
  const leaders = rows.map((row, index) => (row.total === best ? state.sides[index].name : null)).filter(Boolean);

  return shell({
    phase: done ? "done" : "live",
    title: "Score training",
    kicker: `${needed} visits · count-up`,
    note: "Every dart scores. There is no bust and no checkout.",
    headline: String(rows[active].total),
    headlineLabel: "total",
    subhead: thrower.name,
    colour: state.sides[active].swatch,
    players: state.sides.map((side, index) => ({
      name: side.name,
      primary: String(rows[index].total),
      secondary: `${rows[index].visits}/${needed}`,
      active: !done && index === active,
      out: false,
      swatch: side.swatch,
      detail: rows[index].oneEighty ? `${rows[index].oneEighty} × 180` : "",
    })),
    darts: pending.map((dart) => ({ label: String(dartPoints(dart) || "Miss") })),
    dartsThisVisit: pending.length,
    canThrow: !done,
    canType: !done && pending.length === 0,
    canUndo: state.events.length > 0,
    botTurn: !done && !!thrower.bot,
    botLevel: thrower.bot,
    end: done ? {
      title: leaders.length === 1 ? `${leaders[0]} wins` : "Shared total",
      subtitle: "Score training",
      rows: [],
      players: state.sides.map((side, index) => ({
        name: side.name,
        rows: [
          { label: "Total", value: String(rows[index].total) },
          { label: "3-dart average", value: rows[index].darts ? ((3 * rows[index].total) / rows[index].darts).toFixed(2) : "—" },
          { label: "Best visit", value: String(rows[index].best) },
          { label: "180s", value: String(rows[index].oneEighty) },
          { label: "100+", value: String(rows[index].tons) },
        ],
      })),
    } : null,
    rulesBrief: "Add the ordinary board score for each visit. Nothing has to finish on a double, and nothing busts. Highest total wins.",
    raw: { rows, needed },
  });

  function bank(index, points, darts) {
    const row = rows[index];
    row.total += points;
    row.darts += darts;
    row.visits += 1;
    if (points > row.best) row.best = points;
    if (points === 180) row.oneEighty += 1;
    else if (points >= 100) row.tons += 1;
    pending = [];
    turn += 1;
  }

  function nextIndex() {
    for (let step = 0; step < state.sides.length; step += 1) {
      const index = (turn + step) % state.sides.length;
      if (rows[index].visits < needed) return index;
    }
    return 0;
  }
}

export function addDart(state, dart) {
  if (!project(state).canThrow) throw new Error("Score training is over");
  return { ...state, events: [...state.events, { type: "dart", dart: normaliseDart(dart) }] };
}

export function addTyped(state, payload) {
  const view = project(state);
  if (!view.canType) throw new Error("That visit is closed");
  const points = Number(payload.total ?? 0);
  const dartsUsed = payload.dartsUsed || 3;
  if (!isPossibleVisit(points, dartsUsed)) throw new Error("That total is impossible");
  return { ...state, events: [...state.events, { type: "total", points, dartsUsed }] };
}

export function undo(state) {
  if (!state.events.length) return state;
  return { ...state, events: state.events.slice(0, -1) };
}

export function act() {
  throw new Error("Nothing to continue");
}

export function aim(view) {
  return { type: "number", multiplier: (view.botLevel || 1) >= 7 ? 3 : 1, value: 20 };
}

export function schema() {
  return { fields: [], common: [26, 41, 45, 60, 81, 85, 100, 140, 180], miss: true, bust: false, placeholder: "Visit total" };
}

export function step(state) {
  return state.events.length;
}
