/** Around the clock. A hit moves the target before the next dart. */

import { normaliseDart } from "./darts.js";
import { makeSeed } from "./bot.js";
import { makeSides, memberOn } from "./roster.js";
import { shell } from "./shell.js";

export function create(config = {}) {
  const sides = makeSides(config, { min: 1, max: 4, allowTeams: false });
  const filter = ["any", "single", "double", "treble"].includes(config.filter) ? config.filter : "any";
  const bull = ["off", "either", "inner"].includes(config.bull) ? config.bull : "off";
  return {
    v: 1,
    mode: "clock",
    rngSeed: makeSeed(config),
    sides,
    config: {
      filter,
      bull,
      skip: !!config.skip,
      equalTurn: !!config.equalTurn,
      descending: !!config.descending,
    },
    events: [],
  };
}

export function project(state) {
  const order = sequence(state.config);
  const rows = state.sides.map(() => ({ at: 0, darts: 0, hits: 0, streak: 0, worst: 0, done: false, finishDarts: null }));
  let turn = 0;
  let pending = [];
  let winner = null;
  let visitsThisRound = 0;

  for (const event of state.events) {
    if (winner != null) break;
    const index = turn % state.sides.length;
    if (rows[index].done) {
      turn += 1;
      continue;
    }
    if (event.type === "dart") {
      pending.push(event.dart);
      const step = takeDart(rows[index], order, event.dart, state.config);
      rows[index].darts += 1;
      if (step.hit) {
        rows[index].hits += 1;
        rows[index].streak = 0;
        rows[index].at += step.advance;
      } else {
        rows[index].streak += 1;
        if (rows[index].streak > rows[index].worst) rows[index].worst = rows[index].streak;
      }
      if (rows[index].at >= order.length) {
        rows[index].done = true;
        rows[index].finishDarts = rows[index].darts;
        if (!state.config.equalTurn) winner = index;
      }
      if (rows[index].done || pending.length === 3) {
        pending = [];
        turn += 1;
        visitsThisRound += 1;
        if (state.config.equalTurn && rows.some((row) => row.done) && visitsThisRound >= state.sides.length) {
          const finished = rows.map((row, id) => (row.done ? id : -1)).filter((id) => id >= 0);
          if (finished.length) winner = finished.sort((a, b) => rows[a].finishDarts - rows[b].finishDarts)[0];
        }
        if (turn % state.sides.length === 0) visitsThisRound = 0;
      }
    } else if (event.type === "summary" && pending.length === 0) {
      const gained = Math.max(0, event.advanced | 0);
      const thrown = event.dartsUsed || 3;
      const scoring = event.hits == null ? Math.min(gained, thrown) : event.hits;
      rows[index].darts += thrown;
      rows[index].hits += scoring;
      rows[index].at += gained;
      if (scoring === 0) {
        rows[index].streak += thrown;
        if (rows[index].streak > rows[index].worst) rows[index].worst = rows[index].streak;
      } else rows[index].streak = 0;
      if (rows[index].at >= order.length) {
        rows[index].done = true;
        rows[index].finishDarts = rows[index].darts;
        if (!state.config.equalTurn) winner = index;
      }
      turn += 1;
    }
  }

  const active = turn % state.sides.length;
  const thrower = memberOn(state.sides[active], 0);
  const target = order[Math.min(rows[active].at, order.length - 1)];
  return shell({
    phase: winner == null ? "live" : "done",
    title: "Around the clock",
    kicker: `${filterLabel(state.config.filter)} · ${state.config.skip ? "multiplier skip on" : "no skip"} · ${bullLabel(state.config.bull)}`,
    note: winner == null ? `Next target ${labelTarget(target)}` : "",
    headline: labelTarget(order[rows[active].at] || "Done"),
    headlineLabel: "target",
    subhead: thrower.name,
    colour: state.sides[active].swatch,
    players: state.sides.map((side, index) => ({
      name: side.name,
      primary: rows[index].done ? "Done" : labelTarget(order[rows[index].at]),
      secondary: `${rows[index].darts} darts`,
      active: winner == null && index === active,
      out: false,
      swatch: side.swatch,
      detail: rows[index].done ? `${rows[index].finishDarts} darts` : "",
    })),
    darts: pending.map((dart) => ({ label: dart.type === "number" ? `${dart.multiplier === 2 ? "D" : dart.multiplier === 3 ? "T" : "S"}${dart.value}` : dart.type })),
    dartsThisVisit: pending.length,
    canThrow: winner == null && !rows[active].done,
    canType: winner == null && pending.length === 0 && !rows[active].done,
    canUndo: state.events.length > 0,
    botTurn: winner == null && !!thrower.bot && !rows[active].done,
    botLevel: thrower.bot,
    bot: thrower.bot ? { level: thrower.bot, target, filter: state.config.filter, bull: state.config.bull } : null,
    end: winner == null ? null : {
      title: `${state.sides[winner].name} finishes`,
      subtitle: "Around the clock",
      rows: [],
      players: state.sides.map((side, index) => ({
        name: side.name,
        rows: [
          { label: "Darts", value: String(rows[index].finishDarts ?? rows[index].darts) },
          { label: "Hit rate", value: rows[index].darts ? `${Math.round((rows[index].hits / rows[index].darts) * 100)}%` : "—" },
          { label: "Longest miss streak", value: String(rows[index].worst) },
        ],
      })),
    },
    rulesBrief: rulesText(state.config),
    raw: { order, rows, target: order[rows[active].at] || null, active, filter: state.config.filter },
  });
}

export function takeDart(row, order, dart, config) {
  const target = order[row.at];
  if (!target) return { hit: false, advance: 0 };
  const clean = normaliseDart(dart);
  if (!hits(clean, target, config)) return { hit: false, advance: 0 };
  let advance = 1;
  if (config.skip && target !== "bull" && clean.type === "number") {
    if (clean.multiplier === 2) advance = 2;
    if (clean.multiplier === 3) advance = 3;
  }
  return { hit: true, advance: Math.min(advance, order.length - row.at) };
}

function hits(dart, target, config) {
  if (target === "bull") {
    if (config.bull === "inner") return dart.type === "inner";
    return dart.type === "inner" || dart.type === "outer";
  }
  if (dart.type !== "number" || dart.value !== target) return false;
  if (config.filter === "single") return dart.multiplier === 1;
  if (config.filter === "double") return dart.multiplier === 2;
  if (config.filter === "treble") return dart.multiplier === 3;
  return true;
}

function sequence(config) {
  const numbers = config.descending
    ? Array.from({ length: 20 }, (_, index) => 20 - index)
    : Array.from({ length: 20 }, (_, index) => index + 1);
  if (config.bull === "off") return numbers;
  return [...numbers, "bull"];
}

function labelTarget(target) {
  if (target == null || target === "Done") return "Done";
  if (target === "bull") return "Bull";
  return String(target);
}

function filterLabel(filter) {
  if (filter === "single") return "Singles only";
  if (filter === "double") return "Doubles only";
  if (filter === "treble") return "Trebles only";
  return "Any segment";
}

function bullLabel(bull) {
  if (bull === "inner") return "inner bull to finish";
  if (bull === "either") return "either bull to finish";
  return "no bull";
}

export function addDart(state, dart) {
  const view = project(state);
  if (!view.canThrow) throw new Error("That clock is finished");
  return { ...state, events: [...state.events, { type: "dart", dart: normaliseDart(dart) }] };
}

export function addTyped(state, payload) {
  const view = project(state);
  if (!view.canType) throw new Error("Enter the darts one at a time from here");
  const dartsUsed = payload.dartsUsed || 3;
  const advanced = Number(payload.advanced ?? payload.hits ?? 0);
  if (!Number.isInteger(advanced) || advanced < 0 || advanced > (state.config.skip ? 9 : dartsUsed)) {
    throw new Error("Say how many targets were gained");
  }
  return { ...state, events: [...state.events, { type: "summary", advanced, dartsUsed, hits: payload.hits ?? null }] };
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
  const filter = view.raw.filter || "any";
  if (target === "bull") return { type: view.bot?.bull === "inner" ? "inner" : "inner" };
  const multiplier = filter === "double" ? 2 : filter === "treble" ? 3 : filter === "single" ? 1 : view.botLevel >= 8 ? 3 : 1;
  return { type: "number", multiplier, value: target };
}

export function schema() {
  return {
    fields: [
      { id: "dartsUsed", type: "step", label: "Darts thrown", min: 1, max: 3 },
      { id: "advanced", type: "step", label: "Targets gained", min: 0, max: 9 },
    ],
    common: false,
    miss: false,
    bust: false,
    placeholder: "",
  };
}

export function rulesText(config = {}) {
  const skip = config.skip ? " Doubles and trebles skip ahead." : " Doubles and trebles do not skip.";
  const race = config.equalTurn ? " Everyone finishes the round of visits." : " First to finish wins at once.";
  return `Hit 1 through 20${config.bull && config.bull !== "off" ? ", then bull" : ""}. A hit changes the target for the next dart. A miss stays put.${skip}${race}`;
}

export function step(state) {
  return state.events.length;
}
