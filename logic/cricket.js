/** Standard cricket, with cut-throat and Tactics on the same mode. */

import { dartLabel, normaliseDart } from "./darts.js";
import { makeSeed } from "./bot.js";
import { makeSides, memberOn } from "./roster.js";
import { shell } from "./shell.js";

const STANDARD = [20, 19, 18, 17, 16, 15, "bull"];
const TACTICS = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, "bull"];

export function create(config = {}) {
  const sides = makeSides(config, { min: 1, max: 4, allowTeams: true });
  const legs = config.legsMode === "first" ? config.legs || 2 : 1;
  if (!Number.isInteger(legs) || legs < 1 || legs > 11) throw new Error("Choose how many legs");
  return {
    v: 1,
    mode: "cricket",
    rngSeed: makeSeed(config),
    sides,
    config: {
      tactics: !!config.tactics,
      cutThroat: !!config.cutThroat,
      legs,
    },
    events: [],
  };
}

export function project(state) {
  const targets = state.config.tactics ? TACTICS : STANDARD;
  const cut = state.config.cutThroat;
  const sides = state.sides.map(() => emptySide(targets));
  let leg = 0;
  const legsWon = state.sides.map(() => 0);
  let turn = 0;
  const visits = state.sides.map(() => 0);
  let pending = [];
  let phase = "live";
  let notice = null;
  let lastText = "";
  const log = [];

  for (const event of state.events) {
    if (event.type === "next" && phase === "between") {
      reset(sides, targets);
      pending = [];
      turn = 0;
      phase = "live";
      notice = null;
      leg += 1;
      continue;
    }
    if (phase !== "live") continue;
    if (event.type === "dart") {
      pending.push(event.dart);
      const hit = describe(event.dart, targets);
      const ended = applyDart(sides, turn, hit, cut, targets, true);
      if (ended || pending.length === 3) finishVisit(ended, pending.map((dart) => dartLabel(dart)));
    } else if (event.type === "marks" && pending.length === 0) {
      const ended = applyMarkMap(sides, turn, event.marks || {}, cut, targets, event.dartsUsed || 3);
      finishVisit(ended, ["Marks"]);
    }
  }

  const active = turn % state.sides.length;
  const thrower = memberOn(state.sides[active], visits[active]);
  const leader = phase === "done" && notice ? state.sides[notice.winner].name : "";
  return shell({
    phase,
    title: state.config.tactics ? "Tactics" : "Cricket",
    kicker: `${cut ? "Cut-throat" : "Standard"} · ${state.config.tactics ? "10–20 and bull" : "15–20 and bull"}${state.config.legs > 1 ? ` · first to ${state.config.legs}` : ""}`,
    note: lastText,
    headline: String(sides[active].points),
    headlineLabel: cut ? "penalty" : "points",
    subhead: thrower.name,
    colour: state.sides[active].swatch,
    players: state.sides.map((side, index) => ({
      name: side.name,
      primary: String(sides[index].points),
      secondary: `${targets.filter((target) => sides[index].marks[target] >= 3).length}/${targets.length} closed`,
      active: index === active && phase === "live",
      out: false,
      swatch: side.swatch,
      detail: side.players.length > 1 && index === active ? thrower.name : legsWon[index] ? `Legs ${legsWon[index]}` : "",
    })),
    darts: pending.map((dart) => ({ label: dartLabel(dart) })),
    dartsThisVisit: pending.length,
    lastText,
    suggestions: [],
    log: log.slice(-8),
    canThrow: phase === "live",
    canType: phase === "live" && pending.length === 0,
    canUndo: state.events.length > 0,
    botTurn: !!thrower.bot && phase === "live",
    botLevel: thrower.bot,
    bot: thrower.bot ? { level: thrower.bot, role: "cricket" } : null,
    actions: phase === "between" ? [{ id: "next", label: "Next leg", tone: "primary" }] : [],
    banner: notice && phase !== "live" ? { title: `${state.sides[notice.winner].name} wins the leg`, body: `Legs ${legsWon.join("–")}` } : null,
    end: phase === "done" ? {
      title: `${leader} wins`,
      subtitle: state.config.cutThroat ? "Cut-throat cricket" : "Standard cricket",
      rows: [],
      players: state.sides.map((side, index) => ({
        name: side.name,
        rows: [
          { label: "MPR", value: rate(sides[index].mprMarks, sides[index].mprDarts) },
          { label: "First nine MPR", value: rate(sides[index].nineMarks, sides[index].nineDarts) },
          { label: cut ? "Penalty" : "Points", value: String(sides[index].points) },
          { label: "Legs", value: String(legsWon[index]) },
          { label: "Hit rate", value: sides[index].mprDarts ? `${Math.round((sides[index].hits / sides[index].mprDarts) * 100)}%` : "—" },
        ],
      })),
    } : null,
    rulesBrief: rulesText(state.config),
    raw: { targets, cutThroat: cut, points: sides.map((side) => side.points), marks: sides.map((side) => ({ ...side.marks })), mpr: sides.map((side) => ({ marks: side.mprMarks, darts: side.mprDarts })), winner: notice?.winner ?? null, active },
  });

  function finishVisit(ended, labels) {
    const index = turn % state.sides.length;
    const name = memberOn(state.sides[index], visits[index]).name;
    visits[index] += 1;
    lastText = `${name} · ${labels.join(" ")}`;
    log.push({ text: lastText });
    pending = [];
    if (ended) {
      legsWon[index] += 1;
      if (legsWon[index] >= state.config.legs) {
        phase = "done";
        notice = { winner: index };
      } else {
        phase = "between";
        notice = { winner: index };
      }
      return;
    }
    turn += 1;
  }
}

function applyDart(sides, turn, hit, cut, targets, countMpr) {
  const index = turn % sides.length;
  const me = sides[index];
  const others = sides.filter((_, other) => other !== index);
  if (countMpr) countMark(me, hit, sides);
  if (hit) applyLump(me, others, hit.key, hit.marks, hit.face, cut);
  return winner(me, sides, targets, cut);
}

function applyMarkMap(sides, turn, marks, cut, targets, dartsUsed) {
  const index = turn % sides.length;
  const me = sides[index];
  const others = sides.filter((_, other) => other !== index);
  let markSum = 0;
  for (const target of targets) {
    const count = marks[target] || 0;
    if (!count) continue;
    if (!realisable(marks, targets)) throw new Error("Those marks cannot be thrown in three darts");
    markSum += count;
    applyLump(me, others, target, count, target === "bull" ? 25 : target, cut);
  }
  me.mprDarts += dartsUsed;
  me.mprMarks += markSum;
  me.hits += markSum > 0 ? Math.min(dartsUsed, markSum) : 0;
  const room = Math.max(0, 9 - me.nineSeen);
  const take = Math.min(room, dartsUsed);
  me.nineDarts += take;
  me.nineMarks += take ? Math.round((markSum * take) / dartsUsed) : 0;
  me.nineSeen += dartsUsed;
  return winner(me, sides, targets, cut);
}

function realisable(marks) {
  let darts = 0;
  for (const [key, count] of Object.entries(marks)) {
    if (!count) continue;
    darts += key === "bull" ? Math.ceil(count / 2) : Math.ceil(count / 3);
  }
  return darts <= 3;
}

function countMark(me, hit, sides) {
  if (hit && sides.every((side) => (side.marks[hit.key] || 0) >= 3)) return;
  me.mprDarts += 1;
  const marks = hit ? hit.marks : 0;
  me.mprMarks += marks;
  if (marks > 0) me.hits += 1;
  if (me.nineSeen < 9) {
    me.nineDarts += 1;
    me.nineMarks += marks;
  }
  me.nineSeen += 1;
}

function applyLump(side, opponents, key, addMarks, face, cut) {
  const before = side.marks[key] || 0;
  const scoring = Math.max(0, addMarks - Math.max(0, 3 - before));
  side.marks[key] = Math.min(3, before + addMarks);
  if (!scoring || !opponents.some((other) => (other.marks[key] || 0) < 3)) return;
  const points = scoring * face;
  if (cut) {
    for (const other of opponents) if ((other.marks[key] || 0) < 3) other.points += points;
  } else side.points += points;
}

function winner(side, sides, targets, cut) {
  if (!targets.every((target) => (side.marks[target] || 0) >= 3)) return false;
  if (sides.length === 1) return true;
  if (cut) return sides.every((other) => other === side || side.points <= other.points);
  return sides.every((other) => other === side || side.points >= other.points);
}

function describe(dart, targets) {
  const clean = normaliseDart(dart);
  if (clean.type === "outer" && targets.includes("bull")) return { key: "bull", marks: 1, face: 25 };
  if (clean.type === "inner" && targets.includes("bull")) return { key: "bull", marks: 2, face: 25 };
  if (clean.type === "number" && targets.includes(clean.value)) {
    return { key: clean.value, marks: clean.multiplier, face: clean.value };
  }
  return null;
}

function emptySide(targets) {
  const marks = {};
  for (const target of targets) marks[target] = 0;
  return { marks, points: 0, mprMarks: 0, mprDarts: 0, nineMarks: 0, nineDarts: 0, nineSeen: 0, hits: 0 };
}

function reset(sides, targets) {
  for (const side of sides) {
    for (const target of targets) side.marks[target] = 0;
    side.points = 0;
  }
}

function marksLine(side, targets) {
  return targets.map((target) => `${target === "bull" ? "B" : target}:${side.marks[target]}`).join(" ");
}

function rate(marks, darts) {
  if (!darts) return "—";
  return ((marks / darts) * 3).toFixed(2);
}

export function addDart(state, dart) {
  const view = project(state);
  if (!view.canThrow) throw new Error("No dart can be thrown now");
  return { ...state, events: [...state.events, { type: "dart", dart: normaliseDart(dart) }] };
}

export function addTyped(state, payload) {
  const view = project(state);
  if (!view.canType) throw new Error("Marks cannot be entered now");
  const marks = {};
  for (const target of view.raw.targets) marks[target] = Number(payload.marks?.[target] || 0);
  if (!realisable(marks)) throw new Error("Those marks cannot be thrown in three darts");
  return { ...state, events: [...state.events, { type: "marks", marks, dartsUsed: payload.dartsUsed || 3 }] };
}

export function undo(state) {
  if (!state.events.length) return state;
  return { ...state, events: state.events.slice(0, -1) };
}

export function act(state, id) {
  if (id !== "next") throw new Error("The next leg has not started");
  if (project(state).phase !== "between") throw new Error("The next leg has not started");
  return { ...state, events: [...state.events, { type: "next" }] };
}

export function aim(view, rand) {
  const level = view.botLevel || 1;
  const open = view.raw.targets.filter((target) => view.raw.marks[view.raw.active][target] < 3);
  const target = open[0] || view.raw.targets[0];
  if (target === "bull") return { type: level >= 8 && rand() < 0.7 ? "inner" : "outer" };
  const multiplier = level >= 8 ? 3 : level >= 4 && rand() < 0.5 ? 3 : 1;
  return { type: "number", multiplier, value: target };
}

export function schema(view) {
  return {
    fields: [
      { id: "marks", type: "marks", label: "Marks this visit", targets: view.raw.targets },
      { id: "dartsUsed", type: "step", label: "Darts thrown", min: 1, max: 3 },
    ],
    common: false,
    miss: false,
    bust: false,
    placeholder: "",
  };
}

export function rulesText(config = {}) {
  const targets = config.tactics ? "10 to 20 and bull" : "15 to 20 and bull";
  const scoring = config.cutThroat
    ? "Cut-throat gives the points to every opponent who still has that number open. Close everything with the lowest score to win."
    : "Three marks close a number. Extra marks score while an opponent still has it open, including the dart that closes it. Close everything and finish level or ahead.";
  return `${scoring} Targets are ${targets}. Singles, doubles and trebles are 1, 2 and 3 marks. Outer bull is 1, inner bull is 2.`;
}

export function step(state) {
  return state.events.length;
}
