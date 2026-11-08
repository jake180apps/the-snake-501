/** Stay on a double until it is hit. The hit ends the turn. */

import { isDouble, normaliseDart } from "./darts.js";
import { makeSeed } from "./bot.js";
import { makeSides, memberOn } from "./roster.js";
import { shell } from "./shell.js";

export function create(config = {}) {
  const sides = makeSides(config, { min: 1, max: 4, allowTeams: false });
  return {
    v: 1,
    mode: "doubles",
    rngSeed: makeSeed(config),
    sides,
    config: { bull: config.bull !== false },
    events: [],
  };
}

export function project(state) {
  const length = state.config.bull ? 21 : 20;
  const rows = state.sides.map(() => ({ at: 0, darts: 0, hits: 0, attempts: 0, done: false, per: Array.from({ length }, () => ({ darts: 0, hits: 0 })) }));
  let turn = 0;
  let pending = [];

  for (const event of state.events) {
    if (rows.every((row) => row.done)) break;
    const index = skipDone(turn);
    if (index == null) break;
    if (event.type === "dart") {
      pending.push(event.dart);
      const hit = isCurrentDouble(rows[index].at, event.dart, state.config.bull);
      rows[index].attempts += 1;
      rows[index].darts += 1;
      rows[index].per[rows[index].at].darts += 1;
      if (hit) {
        rows[index].hits += 1;
        rows[index].per[rows[index].at].hits += 1;
        rows[index].at += 1;
        if (rows[index].at >= length) rows[index].done = true;
        pending = [];
        turn = index + 1;
      } else if (pending.length === 3) {
        pending = [];
        turn = index + 1;
      }
    } else if (event.type === "total" && pending.length === 0) {
      const thrown = event.hit ? event.dartNumber || 1 : 3;
      rows[index].attempts += thrown;
      rows[index].darts += thrown;
      rows[index].per[rows[index].at].darts += thrown;
      if (event.hit) {
        rows[index].hits += 1;
        rows[index].per[rows[index].at].hits += 1;
        rows[index].at += 1;
        if (rows[index].at >= length) rows[index].done = true;
      }
      turn = index + 1;
    }
  }

  const done = rows.every((row) => row.done);
  const active = skipDone(turn) ?? 0;
  const thrower = memberOn(state.sides[active], 0);
  const ranked = rows.map((row, index) => ({ index, darts: row.done ? row.darts : Infinity })).sort((a, b) => a.darts - b.darts);
  return shell({
    phase: done ? "done" : "live",
    title: "Doubles training",
    kicker: state.config.bull ? "D1–D20 then bull" : "D1–D20",
    note: "Hit the double to move on. Three misses and you stay.",
    headline: done ? String(ranked[0].darts) : targetLabel(rows[active].at, state.config.bull),
    headlineLabel: done ? "fewest darts" : "double",
    subhead: thrower.name,
    colour: state.sides[active].swatch,
    players: state.sides.map((side, index) => ({
      name: side.name,
      primary: rows[index].done ? "Done" : targetLabel(rows[index].at, state.config.bull),
      secondary: `${rows[index].darts} darts`,
      active: !done && index === active,
      out: false,
      swatch: side.swatch,
      detail: "",
    })),
    darts: pending.map((dart) => ({ label: dart.type || "dart" })),
    dartsThisVisit: pending.length,
    canThrow: !done,
    canType: !done && pending.length === 0,
    canUndo: state.events.length > 0,
    botTurn: !done && !!thrower.bot,
    botLevel: thrower.bot,
    bot: thrower.bot ? { level: thrower.bot, at: rows[active].at, bull: state.config.bull } : null,
    end: done ? endOf(state, rows) : null,
    rulesBrief: "Stay on each double until you hit it. The hit scores one and ends the turn. Three misses leave you there. Everyone plays through to the end.",
    raw: { rows, active, at: rows[active].at },
  });

  function skipDone(start) {
    for (let step = 0; step < state.sides.length; step += 1) {
      const index = (start + step) % state.sides.length;
      if (!rows[index].done) return index;
    }
    return null;
  }
}

function endOf(state, rows) {
  const fewest = Math.min(...rows.map((row) => row.darts));
  const names = rows.map((row, index) => (row.darts === fewest ? state.sides[index].name : null)).filter(Boolean);
  return {
    title: names.length === 1 ? `${names[0]} uses fewest darts` : "Shared finish",
    subtitle: "Doubles training",
    rows: [],
    players: state.sides.map((side, index) => {
      const worst = rows[index].per.reduce((best, item, at) => (item.darts > best.darts ? { at, darts: item.darts } : best), { at: 0, darts: -1 });
      const best = rows[index].per.reduce((bestRow, item, at) => (item.darts < bestRow.darts ? { at, darts: item.darts } : bestRow), { at: 0, darts: 99 });
      return {
        name: side.name,
        rows: [
          { label: "Doubles hit", value: `${rows[index].hits}/${rows[index].attempts}` },
          { label: "Hit rate", value: rows[index].attempts ? `${Math.round((rows[index].hits / rows[index].attempts) * 100)}%` : "—" },
          { label: "Darts to complete", value: String(rows[index].darts) },
          { label: "Best double", value: targetLabel(best.at, state.config.bull) },
          { label: "Worst double", value: targetLabel(worst.at, state.config.bull) },
        ],
      };
    }),
  };
}

export function isCurrentDouble(at, dart, bull) {
  const clean = normaliseDart(dart);
  if (at >= 20) return bull && clean.type === "inner";
  return isDouble(clean) && clean.type === "number" && clean.value === at + 1;
}

function targetLabel(at, bull) {
  if (at >= 20) return bull ? "Bull" : "Done";
  return `D${at + 1}`;
}

export function addDart(state, dart) {
  if (!project(state).canThrow) throw new Error("Doubles training is over");
  return { ...state, events: [...state.events, { type: "dart", dart: normaliseDart(dart) }] };
}

export function addTyped(state, payload) {
  if (!project(state).canType) throw new Error("This double is closed");
  return { ...state, events: [...state.events, { type: "total", hit: !!payload.hit, dartNumber: payload.dartNumber || payload.dartsUsed || 1 }] };
}

export function undo(state) {
  if (!state.events.length) return state;
  return { ...state, events: state.events.slice(0, -1) };
}

export function act() {
  throw new Error("Nothing to continue");
}

export function aim(view) {
  const at = view.bot?.at ?? view.raw.at ?? 0;
  if (at >= 20) return { type: "inner" };
  return { type: "number", multiplier: 2, value: at + 1 };
}

export function schema() {
  return {
    fields: [
      { id: "hit", type: "toggle", label: "Hit the double" },
      { id: "dartNumber", type: "step", label: "Dart it fell on", min: 1, max: 3 },
    ],
    common: false,
    miss: false,
    bust: false,
    placeholder: "",
  };
}

export function step(state) {
  return state.events.length;
}
