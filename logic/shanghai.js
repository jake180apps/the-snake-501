/** Shanghai. A single, double and treble of the round number wins at once. */

import { normaliseDart } from "./darts.js";
import { makeSeed } from "./bot.js";
import { makeSides, memberOn } from "./roster.js";
import { shell } from "./shell.js";

export function create(config = {}) {
  const sides = makeSides(config, { min: 1, max: 4, allowTeams: true });
  const last = config.length === 20 ? 20 : 7;
  return {
    v: 1,
    mode: "shanghai",
    rngSeed: makeSeed(config),
    sides,
    config: {
      last,
      requireNumber: !!config.requireNumber,
      requireTreble: !!config.requireTreble,
    },
    events: [],
  };
}

export function project(state) {
  const scores = state.sides.map(() => ({ total: 0, hits: 0, darts: 0, singles: 0, doubles: 0, trebles: 0, shanghais: 0 }));
  const visits = state.sides.map(() => 0);
  let round = 1;
  let turn = 0;
  let pending = [];
  let winner = null;

  for (const event of state.events) {
    if (winner != null || round > state.config.last) break;
    if (event.type === "dart") {
      pending.push(event.dart);
      const instant = isShanghai(round, pending);
      if (instant || pending.length === 3) close(scoreOf(round, pending), instant);
    } else if (event.type === "total" && pending.length === 0) close(event.points, !!event.shanghai);
  }

  const done = winner != null || round > state.config.last;
  const active = turn % state.sides.length;
  const thrower = memberOn(state.sides[active] || state.sides[0], visits[active] || 0);
  const best = Math.max(...scores.map((score) => score.total));
  const leaders = winner != null
    ? [state.sides[winner].name]
    : scores.map((score, index) => (score.total === best ? state.sides[index].name : null)).filter(Boolean);
  return shell({
    phase: done ? "done" : "live",
    title: "Shanghai",
    kicker: done ? "Game over" : `Round ${round} · number ${round}`,
    note: "Only this number scores. Single, double and treble in one visit wins outright.",
    headline: done ? (winner != null ? "Shanghai" : String(best)) : String(round),
    headlineLabel: done ? (winner != null ? "instant win" : "best total") : "target",
    subhead: done ? leaders.join(" & ") : thrower.name,
    colour: state.sides[active]?.swatch || "#2E9BDB",
    players: state.sides.map((side, index) => ({
      name: side.name,
      primary: String(scores[index].total),
      secondary: `${scores[index].hits} hits`,
      active: !done && index === active,
      out: false,
      swatch: side.swatch,
      detail: scores[index].shanghais ? "Shanghai" : "",
    })),
    darts: pending.map((dart) => ({ label: text(dart) })),
    dartsThisVisit: pending.length,
    canThrow: !done,
    canType: !done && pending.length === 0,
    canUndo: state.events.length > 0,
    botTurn: !done && !!thrower.bot,
    botLevel: thrower.bot,
    bot: thrower.bot ? { level: thrower.bot, have: haveRings(round, pending) } : null,
    end: done ? {
      title: winner != null ? `${state.sides[winner].name} hits Shanghai` : leaders.length === 1 ? `${leaders[0]} wins` : "Shared win",
      subtitle: `Shanghai 1–${state.config.last}`,
      rows: [],
      players: state.sides.map((side, index) => ({
        name: side.name,
        rows: [
          { label: "Total", value: String(scores[index].total) },
          { label: "Hit rate", value: scores[index].darts ? `${Math.round((scores[index].hits / scores[index].darts) * 100)}%` : "—" },
          { label: "Singles", value: String(scores[index].singles) },
          { label: "Doubles", value: String(scores[index].doubles) },
          { label: "Trebles", value: String(scores[index].trebles) },
          { label: "Shanghais", value: String(scores[index].shanghais) },
        ],
      })),
    } : null,
    rulesBrief: rulesText(state.config),
    raw: { round, scores, number: round, winner },
  });

  function close(points, shanghai) {
    const index = turn % state.sides.length;
    const row = scores[index];
    const darts = pending.length || 3;
    row.darts += darts;
    for (const dart of pending) {
      const clean = normaliseDart(dart);
      if (clean.type === "number" && clean.value === round) {
        row.hits += 1;
        if (clean.multiplier === 1) row.singles += 1;
        if (clean.multiplier === 2) row.doubles += 1;
        if (clean.multiplier === 3) row.trebles += 1;
      }
    }
    if (!pending.length && points > 0) row.hits += 1;
    if (shanghai) {
      row.total += points;
      row.shanghais += 1;
      winner = index;
    } else if (state.config.requireTreble && !pendingHasTreble(round, pending) && !points) {
      row.total = 0;
    } else if (points > 0) row.total += points;
    else if (state.config.requireNumber) row.total = Math.floor(row.total / 2);
    visits[index] += 1;
    pending = [];
    turn += 1;
    if (winner == null && turn % state.sides.length === 0) round += 1;
  }
}

export function isShanghai(number, darts) {
  if (darts.length < 3) return false;
  const rings = new Set();
  for (const dart of darts) {
    const clean = normaliseDart(dart);
    if (clean.type === "number" && clean.value === number) rings.add(clean.multiplier);
  }
  return rings.has(1) && rings.has(2) && rings.has(3);
}

function scoreOf(number, darts) {
  let total = 0;
  for (const dart of darts) {
    const clean = normaliseDart(dart);
    if (clean.type === "number" && clean.value === number) total += clean.multiplier * number;
  }
  return total;
}

function pendingHasTreble(number, darts) {
  return darts.some((dart) => {
    const clean = normaliseDart(dart);
    return clean.type === "number" && clean.value === number && clean.multiplier === 3;
  });
}

function haveRings(number, darts) {
  const rings = new Set();
  for (const dart of darts) {
    const clean = normaliseDart(dart);
    if (clean.type === "number" && clean.value === number) rings.add(clean.multiplier);
  }
  return rings;
}

function text(dart) {
  const clean = normaliseDart(dart);
  if (clean.type !== "number") return clean.type === "miss" ? "Miss" : clean.type === "inner" ? "Bull" : "25";
  return `${" SDT"[clean.multiplier]}${clean.value}`;
}

export function addDart(state, dart) {
  if (project(state).phase !== "live") throw new Error("Shanghai is over");
  return { ...state, events: [...state.events, { type: "dart", dart: normaliseDart(dart) }] };
}

export function addTyped(state, payload) {
  const view = project(state);
  if (!view.canType) throw new Error("This round is closed");
  const points = Number(payload.total ?? 0);
  const number = view.raw.number;
  if (!possible(number, points)) throw new Error("That score is not on this number");
  if (payload.shanghai && points !== number * 6) throw new Error("Shanghai is a single, double and treble");
  return { ...state, events: [...state.events, { type: "total", points, shanghai: !!payload.shanghai }] };
}

export function undo(state) {
  if (!state.events.length) return state;
  return { ...state, events: state.events.slice(0, -1) };
}

export function act() {
  throw new Error("Nothing to continue");
}

export function aim(view, rand) {
  const number = view.raw.number;
  const have = view.bot?.have || new Set();
  const level = view.botLevel || 1;
  if (level >= 8 && view.dartsThisVisit === 2) {
    for (const ring of [1, 2, 3]) if (!have.has(ring)) return { type: "number", multiplier: ring, value: number };
  }
  return { type: "number", multiplier: level >= 6 && rand() < 0.75 ? 3 : 1, value: number };
}

export function schema(view) {
  return {
    fields: [{ id: "shanghai", type: "toggle", label: `Single, double and treble of ${view.raw.number}` }],
    common: false,
    miss: true,
    bust: false,
    placeholder: `Points on ${view.raw.number}`,
  };
}

export function rulesText(config = {}) {
  const last = config.length === 20 ? 20 : config.last || 7;
  const extra = config.requireNumber || config.requireTreble
    ? " Penalties are on."
    : " Require-number and require-treble penalties are off.";
  return `Rounds 1 to ${last}. Only that number scores. Single, double and treble of it, in any order, wins at once. Otherwise the highest total wins.${extra}`;
}

export function step(state) {
  return state.events.length;
}

function possible(number, points) {
  if (!Number.isInteger(points) || points < 0) return false;
  const faces = [0, number, number * 2, number * 3];
  let layer = new Set([0]);
  for (let dart = 0; dart < 3; dart += 1) {
    const next = new Set();
    for (const total of layer) for (const face of faces) next.add(total + face);
    layer = next;
  }
  return layer.has(points);
}
