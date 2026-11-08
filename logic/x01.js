/** X01 with independent in/out rules, legs, sets, teams, and typed visits. */

import { dartLabel, dartPoints, normaliseDart } from "./darts.js";
import { finishChoices, suggestCheckout } from "./checkout.js";
import { makeSeed } from "./bot.js";
import { makeSides, memberOn } from "./roster.js";
import { planTotal, scoreSequence } from "./sequence.js";
import { addVisitBand, blankStats, winsNeeded, x01Rows } from "./stats.js";

const IN_OUT = new Set(["straight", "double", "master"]);

export function createX01(config = {}) {
  const sides = makeSides(config, { min: 1, max: 4, allowTeams: true });
  const start = config.start ?? 501;
  if (!Number.isInteger(start) || start < 101 || start > 2001 || start % 100 !== 1) {
    throw new Error("Start on an 01 score from 101 to 2001");
  }
  const inRule = config.inRule ?? "straight";
  const outRule = config.outRule ?? "double";
  if (!IN_OUT.has(inRule) || !IN_OUT.has(outRule)) throw new Error("In and out must be straight, double, or master");
  const setsMode = config.setsMode ?? "off";
  const legsMode = config.legsMode ?? (setsMode === "off" ? "single" : "first");
  const setLegsMode = config.setLegsMode ?? "first";
  if (!["off", "first", "best"].includes(setsMode)) throw new Error("Unknown sets");
  if (!["single", "first", "best"].includes(legsMode)) throw new Error("Unknown legs");
  if (!["first", "best"].includes(setLegsMode)) throw new Error("Unknown legs per set");
  assertLength(legsMode, config.legs ?? 1, "legs");
  assertLength(setsMode, config.sets ?? 1, "sets");
  assertLength(setLegsMode, config.setLegs ?? 3, "legs in a set");

  const rngSeed = makeSeed(config);
  let starter = Number.isInteger(config.starter) ? config.starter : 0;
  if (config.starter === "random" || config.randomStarter) {
    starter = Math.floor(seededUnit(rngSeed, 3) * sides.length);
  }
  if (starter < 0 || starter >= sides.length) starter = 0;

  return {
    v: 1,
    mode: "x01",
    rngSeed,
    sides,
    config: {
      start,
      inRule,
      outRule,
      legsMode,
      legs: config.legs ?? 1,
      setsMode,
      sets: config.sets ?? 1,
      setLegsMode,
      setLegs: config.setLegs ?? 3,
      alternate: config.alternate !== false,
      starter,
      bullOff: !!config.bullOff,
      teams: !!config.teams,
    },
    events: [],
  };
}

export function project(state) {
  const { config, sides } = state;
  const setsOn = config.setsMode !== "off";
  const legMode = setsOn ? config.setLegsMode : config.legsMode;
  const legCount = setsOn ? config.setLegs : config.legs;
  const legTarget = winsNeeded(legMode === "single" ? "single" : legMode, legCount);
  const setTarget = winsNeeded(config.setsMode, config.sets);

  let phase = config.bullOff ? "bull" : "live";
  let baseStarter = config.starter;
  let starter0 = config.starter;
  let legIndex = 0;
  let turn = 0;
  let remaining = sides.map(() => config.start);
  let opened = sides.map(() => config.inRule === "straight");
  let legsWon = sides.map(() => 0);
  let setsWon = sides.map(() => 0);
  let legDarts = sides.map(() => 0);
  let nineDarts = sides.map(() => 0);
  let memberVisits = sides.map(() => 0);
  const stats = sides.map(() => blankStats());
  const members = sides.map((side) => side.players.map(() => blankMember()));
  let pending = [];
  let lock = null;
  let notice = null;
  let lastText = "";
  const log = [];
  let bullScores = [];
  let bullRounds = 0;

  for (const event of state.events) {
    if (event.type === "next") {
      if (phase === "between") startNextLeg();
      continue;
    }
    if (event.type === "dart") {
      if (phase === "bull") applyBull(event.dart);
      else if (phase === "live") applyDart(event.dart);
      continue;
    }
    if (event.type === "visit" && phase === "live" && pending.length === 0) applyTyped(event);
  }

  const sideIndex = phase === "bull" ? bullScores.length % sides.length : activeIndex();
  const live = phase === "live" ? liveSequence(sideIndex) : null;
  const running = live ? live.remaining : remaining[sideIndex] ?? config.start;
  const runningOpen = live ? live.opened : !!opened[sideIndex];
  const thrower = currentThrower(sideIndex);
  const suggestions = phase === "live" ? suggestionLines(sideIndex, running, runningOpen) : [];

  return {
    mode: "x01",
    phase: phase === "between" ? "between" : phase,
    title: `${config.start}`,
    kicker: kicker(),
    note: noteLine(sideIndex),
    headline: String(phase === "bull" ? "Bull" : running),
    headlineLabel: phase === "bull" ? "bull-off" : "remaining",
    subhead: phase === "bull" ? `${thrower?.name || sides[sideIndex].name} for the bull` : thrower?.name || sides[sideIndex]?.name || "",
    colour: sides[sideIndex]?.swatch || "#2E9BDB",
    players: sides.map((side, index) => ({
      name: side.name,
      primary: String(index === sideIndex ? running : remaining[index]),
      secondary: secondary(index),
      active: index === sideIndex && (phase === "live" || phase === "bull"),
      out: false,
      swatch: side.swatch,
      detail: side.players.length > 1 && index === sideIndex ? thrower.name : "",
    })),
    darts: (phase === "live" ? pending : []).map((dart) => ({ label: dartLabel(dart) })),
    dartsThisVisit: phase === "live" ? pending.length : 0,
    lastText,
    suggestions,
    log: log.slice(-8),
    canThrow: phase === "live" || phase === "bull",
    canType: phase === "live" && pending.length === 0,
    canUndo: state.events.length > 0,
    botTurn: !!thrower?.bot && (phase === "live" || phase === "bull"),
    botLevel: thrower?.bot ?? null,
    actions: actions(),
    banner: banner(),
    end: phase === "done" ? endScreen() : null,
    rulesBrief: rulesText(config),
    bot: thrower?.bot
      ? {
          level: thrower.bot,
          role: phase === "bull" ? "bull" : "score",
          remaining: running,
          opened: runningOpen,
          dartsLeft: Math.max(1, 3 - pending.length),
          inRule: config.inRule,
          outRule: config.outRule,
        }
      : null,
    raw: {
      inRule: config.inRule,
      outRule: config.outRule,
      opened: pending.length ? runningOpen : opened[sideIndex],
      remaining: remaining[sideIndex],
      running,
      runningOpen,
      start: config.start,
      stats,
      members,
      legsWon: legsWon.slice(),
      setsWon: setsWon.slice(),
      winner: notice?.kind === "match" ? notice.winner : null,
      active: sideIndex,
      sides: sides.map((side) => side.name),
    },
  };

  function activeIndex() {
    return (starter0 + turn) % sides.length;
  }

  function currentThrower(index) {
    if (!sides[index]) return null;
    return memberOn(sides[index], memberVisits[index]);
  }

  function liveSequence(index) {
    if (!pending.length || !lock || lock.side !== index) return null;
    return scoreSequence(lock.remaining, lock.opened, pending, config.inRule, config.outRule);
  }

  function applyDart(dart) {
    if (!pending.length) lockVisit(activeIndex());
    pending.push(dart);
    const seq = scoreSequence(lock.remaining, lock.opened, pending, config.inRule, config.outRule);
    if (seq.bust || seq.checkout || pending.length === 3) closeVisit(seq, pending.map((item) => dartLabel(item)));
  }

  function applyTyped(event) {
    lockVisit(activeIndex());
    const seq = planTotal({
      remaining: lock.remaining,
      opened: lock.opened,
      inRule: config.inRule,
      outRule: config.outRule,
      total: event.total ?? 0,
      dartsUsed: event.dartsUsed ?? 3,
      didOpen: !!event.didOpen,
      finish: event.finish || null,
      bust: !!event.bust,
      miss: !!event.miss,
      doubleAttempts: event.doubleAttempts,
    });
    const label = event.bust ? "Bust" : event.miss || event.total === 0 ? "Miss" : String(event.total);
    closeVisit(seq, [label]);
  }

  function lockVisit(side) {
    lock = {
      side,
      remaining: remaining[side],
      opened: opened[side],
      member: memberVisits[side] % sides[side].players.length,
    };
    pending = [];
  }

  function closeVisit(seq, labels) {
    const side = lock.side;
    const member = members[side][lock.member];
    const name = sides[side].players[lock.member].name;
    stats[side].points += seq.points;
    stats[side].darts += seq.dartsUsed;
    stats[side].visits += 1;
    member.points += seq.points;
    member.darts += seq.dartsUsed;
    member.visits += 1;
    if (seq.tracked) {
      stats[side].doubleTracked = true;
      stats[side].doubleAttempts += seq.attempts;
      stats[side].doubleHits += seq.hits;
      member.doubleTracked = true;
      member.doubleAttempts += seq.attempts;
      member.doubleHits += seq.hits;
    }
    addVisitBand(stats[side], seq.points, seq);
    addVisitBand(member, seq.points, seq);
    takeFirstNine(side, seq.credited);
    legDarts[side] += seq.dartsUsed;
    if (!seq.bust) {
      remaining[side] = seq.remaining;
      opened[side] = seq.opened;
    }
    memberVisits[side] += 1;
    const text = seq.bust
      ? `${name} busts`
      : seq.checkout
        ? `${name} checks out ${seq.points}`
        : `${name} scores ${seq.points}`;
    lastText = `${text} · ${labels.join(" ")}`;
    log.push({ text: lastText });
    pending = [];
    lock = null;
    if (seq.checkout) onLegWon(side);
    else turn += 1;
  }

  function takeFirstNine(side, credited) {
    for (const points of credited) {
      if (nineDarts[side] < 9) {
        stats[side].firstNinePoints += points;
        stats[side].firstNineDarts += 1;
      }
      nineDarts[side] += 1;
    }
  }

  function onLegWon(side) {
    legsWon[side] += 1;
    stats[side].legsWon += 1;
    stats[side].winningLegDarts.push(legDarts[side]);
    if (legsWon[side] >= legTarget) {
      if (setsOn) {
        const legsSnapshot = legsWon.slice();
        setsWon[side] += 1;
        stats[side].setsWon += 1;
        legsWon = sides.map(() => 0);
        if (setsWon[side] >= setTarget) {
          phase = "done";
          notice = { kind: "match", winner: side, legs: legsSnapshot, sets: setsWon.slice() };
          return;
        }
        phase = "between";
        notice = { kind: "set", winner: side, legs: legsSnapshot, sets: setsWon.slice() };
        return;
      }
      phase = "done";
      notice = { kind: "match", winner: side, legs: legsWon.slice(), sets: setsWon.slice() };
      return;
    }
    phase = "between";
    notice = { kind: "leg", winner: side, legs: legsWon.slice(), sets: setsWon.slice() };
  }

  function startNextLeg() {
    legIndex += 1;
    remaining = sides.map(() => config.start);
    opened = sides.map(() => config.inRule === "straight");
    pending = [];
    lock = null;
    turn = 0;
    legDarts = sides.map(() => 0);
    nineDarts = sides.map(() => 0);
    if (config.alternate) starter0 = (baseStarter + legIndex) % sides.length;
    phase = "live";
    notice = null;
  }

  function applyBull(dart) {
    bullScores.push(dartPoints(dart));
    if (bullScores.length < sides.length) return;
    bullRounds += 1;
    const best = Math.max(...bullScores);
    const leaders = bullScores.map((score, index) => (score === best ? index : -1)).filter((index) => index >= 0);
    bullScores = [];
    if (leaders.length === 1 || bullRounds >= 8) {
      if (leaders.length === 1) baseStarter = leaders[0];
      starter0 = baseStarter;
      phase = "live";
    }
  }

  function suggestionLines(index, score, isOpen) {
    if (!isOpen && config.inRule !== "straight") {
      return [{ text: "D20 to open" }, { text: "D16 to open" }, { text: "D10 to open" }];
    }
    const left = Math.max(1, 3 - pending.length);
    return suggestCheckout(score, left, config.outRule, 3).map((route) => ({ text: route.text }));
  }

  function secondary(index) {
    if (setsOn) return `Sets ${setsWon[index]} · Legs ${legsWon[index]}`;
    if (legMode !== "single") return `Legs ${legsWon[index]}`;
    return sides.length === 1 ? "Solo" : "";
  }

  function kicker() {
    const legLabel = legMode === "single" ? "Single leg" : legMode === "best" ? `Best of ${legCount} legs` : `First to ${legCount} legs`;
    const setLabel = !setsOn ? "" : config.setsMode === "best" ? ` · best of ${config.sets} sets` : ` · first to ${config.sets} sets`;
    const rule = `${spell(config.inRule)} in · ${spell(config.outRule)} out`;
    return `${config.start} · ${rule} · ${legLabel}${setLabel}`;
  }

  function noteLine(index) {
    if (phase === "bull") return "Highest bull starts. Inner bull beats outer bull. A tie throws again.";
    if (lastText && phase === "live") return lastText;
    if (!runningOpen && config.inRule !== "straight" && phase === "live") {
      return config.inRule === "double" ? "Double in — score starts on a double." : "Master in — score starts on a double or treble.";
    }
    return "";
  }

  function actions() {
    if (phase === "between") return [{ id: "next", label: notice?.kind === "set" ? "Next set" : "Next leg", tone: "primary" }];
    return [];
  }

  function banner() {
    if (!notice || phase === "live") return null;
    const name = sides[notice.winner].name;
    if (notice.kind === "match") return { title: `${name} wins`, body: scoreLine(notice) };
    if (notice.kind === "set") return { title: `${name} takes the set`, body: scoreLine(notice) };
    return { title: `${name} takes the leg`, body: scoreLine(notice) };
  }

  function scoreLine(item) {
    if (setsOn) return `Sets ${item.sets.join("–")} · legs ${item.legs.join("–")}`;
    return `Legs ${item.legs.join("–")}`;
  }

  function endScreen() {
    const winner = notice ? sides[notice.winner] : null;
    const showSets = setsOn;
    return {
      title: winner ? `${winner.name} wins` : "Match over",
      subtitle: kicker(),
      rows: [],
      players: sides.map((side, index) => ({
        name: side.name,
        rows: x01Rows(stats[index], { showSets }),
        members: side.players.length > 1
          ? side.players.map((player, member) => ({
              name: player.name,
              rows: [
                { label: "3-dart average", value: members[index][member].darts ? (3 * members[index][member].points / members[index][member].darts).toFixed(2) : "—" },
                { label: "Darts", value: String(members[index][member].darts) },
                { label: "180s", value: String(members[index][member].oneEighties) },
                { label: "Checkout", value: members[index][member].doubleTracked && members[index][member].doubleAttempts ? `${((members[index][member].doubleHits / members[index][member].doubleAttempts) * 100).toFixed(1)}%` : "—" },
              ],
            }))
          : [],
      })),
    };
  }
}

export function throwDart(state, dart) {
  const view = project(state);
  if (!view.canThrow) throw new Error("No dart can be thrown now");
  return { ...state, events: [...state.events, { type: "dart", dart: normaliseDart(dart) }] };
}

export function typedVisit(state, payload) {
  const view = project(state);
  if (!view.canType) throw new Error("A visit total cannot be entered now");
  const event = {
    type: "visit",
    total: payload.miss ? 0 : Number(payload.total),
    dartsUsed: payload.dartsUsed ?? 3,
    didOpen: !!payload.didOpen,
    finish: payload.finish || null,
    bust: !!payload.bust,
    miss: !!payload.miss,
    doubleAttempts: payload.doubles == null || payload.doubles === "na" || payload.doubles === "" ? null : Number(payload.doubles),
  };
  planTotal({
    remaining: view.raw.remaining,
    opened: view.raw.opened,
    inRule: view.raw.inRule,
    outRule: view.raw.outRule,
    total: event.total,
    dartsUsed: event.dartsUsed,
    didOpen: event.didOpen,
    finish: event.finish,
    bust: event.bust,
    miss: event.miss,
    doubleAttempts: event.doubleAttempts,
  });
  return { ...state, events: [...state.events, event] };
}

export function undo(state) {
  if (!state.events.length) return state;
  return { ...state, events: state.events.slice(0, -1) };
}

export function nextLeg(state) {
  const view = project(state);
  if (view.phase !== "between") throw new Error("The next leg has not started");
  return { ...state, events: [...state.events, { type: "next" }] };
}

export function aim(view, rand) {
  const bot = view.bot;
  if (!bot) return { type: "number", multiplier: 1, value: 20 };
  if (bot.role === "bull") return { type: "inner" };
  if (!bot.opened) {
    if (bot.level < 4 && rand() < 0.65) return { type: "number", multiplier: 1, value: 20 };
    const choices = bot.level >= 10 ? [20, 20, 16] : [20, 16, 10, 8];
    return { type: "number", multiplier: 2, value: choices[Math.floor(rand() * choices.length)] };
  }
  const route = suggestCheckout(bot.remaining, bot.dartsLeft, bot.outRule, 1)[0];
  if (route && (bot.level >= 5 || rand() < 0.4)) return route.darts[0];
  if (bot.level >= 9) return { type: "number", multiplier: 3, value: rand() < 0.82 ? 20 : 19 };
  if (bot.level >= 5) return { type: "number", multiplier: rand() < 0.55 ? 3 : 1, value: 20 };
  const singles = [20, 19, 18, 5, 1];
  return { type: "number", multiplier: 1, value: singles[Math.floor(rand() * singles.length)] };
}

export function schema(view, draft) {
  const fields = [];
  if (!view.raw.opened && view.raw.inRule !== "straight") {
    fields.push({
      id: "didOpen",
      type: "toggle",
      label: view.raw.inRule === "double" ? "Hit a double to get in" : "Hit a double or treble to get in",
    });
  }
  fields.push({ id: "dartsUsed", type: "step", label: "Darts thrown", min: 1, max: 3 });
  const total = Number(draft?.total);
  const openedNow = view.raw.opened || draft?.didOpen || view.raw.inRule === "straight";
  if (Number.isInteger(total) && openedNow && total === view.raw.remaining && total > 0 && view.raw.outRule !== "straight") {
    fields.push({
      id: "finish",
      type: "select",
      label: "Finishing dart",
      options: finishChoices(view.raw.outRule, total, draft?.dartsUsed || 3),
    });
  }
  if (view.raw.outRule === "double") {
    fields.push({
      id: "doubles",
      type: "select",
      label: "Winning doubles aimed at",
      options: [
        { id: "na", label: "Not tracked" },
        { id: "0", label: "0" },
        { id: "1", label: "1" },
        { id: "2", label: "2" },
        { id: "3", label: "3" },
      ],
    });
  }
  return {
    fields,
    common: [26, 41, 45, 60, 81, 85, 100, 140, 180],
    miss: true,
    bust: true,
    placeholder: "Points that count",
  };
}

export function rulesText(config) {
  const start = config.start ?? 501;
  const setsOn = (config.setsMode ?? "off") !== "off";
  const legMode = setsOn ? config.setLegsMode ?? "first" : config.legsMode ?? "single";
  const legCount = setsOn ? config.setLegs ?? 3 : config.legs ?? 1;
  const length = !setsOn && legMode === "single"
    ? "Single leg"
    : legMode === "best"
      ? `Best of ${legCount} legs`
      : `First to ${legCount} ${legCount === 1 ? "leg" : "legs"}`;
  const sets = !setsOn ? "" : config.setsMode === "best" ? ` Best of ${config.sets} sets.` : ` First to ${config.sets} sets.`;
  const starter = config.bullOff ? "Bull-off starts the match." : config.alternate === false ? "The same player starts every leg." : "The start alternates each leg.";
  return `${start}, ${spell(config.inRule ?? "straight")} in and ${spell(config.outRule ?? "double")} out. ${length}.${sets} ${starter} A bust, or a finish on the wrong segment, puts the score back. Double out also busts on 1.`;
}

function spell(rule) {
  if (rule === "double") return "double";
  if (rule === "master") return "master";
  return "straight";
}

function assertLength(mode, count, label) {
  if (mode === "off" || mode === "single") return;
  if (!Number.isInteger(count) || count < 1 || count > 15) throw new Error(`Choose how many ${label}`);
  if (mode === "best" && (count < 3 || count % 2 === 0)) throw new Error(`Best of needs an odd number of ${label}`);
}

function blankMember() {
  return blankStats();
}

function seededUnit(seed, step) {
  let value = (Math.imul(seed ^ 0x9e3779b9, step + 1) + 0x6d2b79f5) >>> 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  return ((value ^ (value >>> 13)) >>> 0) / 4294967296;
}

export { createX01 as create, throwDart as addDart, typedVisit as addTyped, nextLeg as act };

export function step(state) {
  return state.events.length;
}
