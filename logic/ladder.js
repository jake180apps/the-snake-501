/** 121. Climb checkout targets. The safehouse is the last finish in three darts or fewer. */

import { normaliseDart } from "./darts.js";
import { makeSeed } from "./bot.js";
import { preparePlayers } from "./roster.js";
import { PLAYER_COLOURS } from "./darts.js";
import { shell } from "./shell.js";
import { planTotal, scoreSequence } from "./sequence.js";
import { suggestCheckout } from "./checkout.js";

export function create(config = {}) {
  const people = preparePlayers(config.players, { min: 1, max: 4 });
  const attempts = Number.isInteger(config.attempts) ? config.attempts : 8;
  if (attempts < 1 || attempts > 30) throw new Error("Choose how many attempts");
  return {
    v: 1,
    mode: "ladder",
    rngSeed: makeSeed(config),
    players: people.map((player, index) => ({ ...player, swatch: PLAYER_COLOURS[index] })),
    config: { attempts },
    events: [],
  };
}

export function project(state) {
  const rows = state.players.map(() => fresh());
  let turn = 0;
  let pending = [];

  for (const event of state.events) {
    if (rows.every((row) => row.done)) break;
    const index = nextUp(turn);
    if (index == null) break;
    const row = rows[index];
    ensure(row);
    if (event.type === "dart") {
      pending.push(event.dart);
      const seq = scoreSequence(row.visitRemaining, true, pending, "straight", "double");
      if (seq.bust || seq.checkout || pending.length === 3) {
        commit(row, seq, state.config.attempts);
        pending = [];
        turn = index + 1;
      }
    } else if (event.type === "total" && pending.length === 0) {
      const seq = planTotal({
        remaining: row.remaining,
        opened: true,
        inRule: "straight",
        outRule: "double",
        total: event.total,
        dartsUsed: event.dartsUsed || 3,
        finish: event.finish,
        bust: event.bust,
        miss: event.miss,
        doubleAttempts: event.doubleAttempts,
      });
      commit(row, seq, state.config.attempts);
      turn = index + 1;
    }
  }

  const done = rows.every((row) => row.done);
  const active = nextUp(turn) ?? 0;
  const current = state.players[active];
  const row = rows[active];
  return shell({
    phase: done ? "done" : "live",
    title: "121",
    kicker: `${state.config.attempts} attempts · 9 darts · double out`,
    note: row ? `Safehouse ${row.safe ?? "121"} · ${row.used} darts used` : "",
    headline: String(row?.target ?? 121),
    headlineLabel: "target",
    subhead: current.name,
    colour: current.swatch,
    players: state.players.map((player, index) => ({
      name: player.name,
      primary: String(rows[index].completed || "—"),
      secondary: `Now ${rows[index].target}`,
      active: !done && index === active,
      out: rows[index].done,
      swatch: player.swatch,
      detail: rows[index].safe ? `Safe ${rows[index].safe}` : "No safehouse",
    })),
    darts: pending.map((dart) => ({ label: dart.type })),
    dartsThisVisit: pending.length,
    suggestions: suggestCheckout(row.remaining, Math.max(1, Math.min(3, 9 - row.used)), "double").map((route) => ({ text: route.text })),
    canThrow: !done,
    canType: !done && pending.length === 0,
    canUndo: state.events.length > 0,
    botTurn: !done && !!current.bot,
    botLevel: current.bot,
    bot: current.bot ? { level: current.bot, role: "score", remaining: row.remaining, opened: true, dartsLeft: Math.max(1, 3 - pending.length), inRule: "straight", outRule: "double" } : null,
    end: done ? rank(state, rows) : null,
    rulesBrief: "Start at 121 and check out on a double within nine darts. A bust cancels the visit but still uses its three-dart allowance. Success raises the next target by one. Failure drops you to the last target you finished in three darts or fewer, or back to 121. The climb stops at 170.",
    raw: { rows, active, remaining: row.remaining, opened: true, inRule: "straight", outRule: "double" },
  });

  function nextUp(from) {
    for (let step = 0; step < state.players.length; step += 1) {
      const index = (from + step) % state.players.length;
      if (!rows[index].done) return index;
    }
    return null;
  }

  function commit(row, seq, limit) {
    row.doubleAttempts += seq.attempts || 0;
    row.doubleHits += seq.hits || 0;
    if (seq.tracked) row.tracked = true;
    if (seq.bust) {
      row.used = row.visitUsed + Math.min(3, 9 - row.visitUsed);
      row.remaining = row.visitRemaining;
    } else if (seq.checkout) {
      row.used = row.visitUsed + seq.dartsUsed;
      succeed(row, limit);
      return;
    } else {
      row.used = row.visitUsed + (seq.dartsUsed || 3);
      row.remaining = seq.remaining;
    }
    if (row.used >= 9) fail(row, limit);
    else arm(row);
  }
}

function fresh() {
  return {
    target: 121,
    remaining: 121,
    safe: null,
    completed: 0,
    finishes: 0,
    finishDarts: 0,
    streak: 0,
    bestStreak: 0,
    success: 0,
    attemptsUsed: 0,
    used: 0,
    visitUsed: 0,
    visitRemaining: 121,
    done: false,
    doubleAttempts: 0,
    doubleHits: 0,
    tracked: false,
  };
}

function ensure(row) {
  if (row.used === 0 && row.remaining === row.target && row.visitRemaining === row.remaining) return;
  if (row.visitRemaining == null) arm(row);
}

function arm(row) {
  row.visitRemaining = row.remaining;
  row.visitUsed = row.used;
}

function succeed(row, limit) {
  row.finishes += 1;
  row.success += 1;
  row.finishDarts += row.used;
  row.streak += 1;
  if (row.streak > row.bestStreak) row.bestStreak = row.streak;
  if (row.used <= 3) row.safe = row.target;
  if (row.target > row.completed) row.completed = row.target;
  const capped = row.target >= 170;
  row.attemptsUsed += 1;
  row.target = capped ? 170 : row.target + 1;
  if (capped || row.attemptsUsed >= limit) row.done = true;
  resetAttempt(row);
}

function fail(row, limit) {
  row.streak = 0;
  row.attemptsUsed += 1;
  row.target = row.safe ?? 121;
  if (row.attemptsUsed >= limit) row.done = true;
  resetAttempt(row);
}

function resetAttempt(row) {
  row.used = 0;
  row.remaining = row.target;
  row.visitUsed = 0;
  row.visitRemaining = row.target;
}

function rank(state, rows) {
  const order = rows.map((row, index) => ({ index, ...row })).sort((a, b) => b.completed - a.completed || b.finishes - a.finishes || a.finishDarts - b.finishDarts);
  const top = order[0];
  const tied = order.filter((row) => row.completed === top.completed && row.finishes === top.finishes && row.finishDarts === top.finishDarts);
  return {
    title: tied.length === 1 ? `${state.players[top.index].name} climbs highest` : "Shared ladder",
    subtitle: "Highest completed target, then more finishes, then fewer darts",
    rows: [],
    players: order.map((row) => ({
      name: state.players[row.index].name,
      rows: [
        { label: "Highest completed", value: row.completed ? String(row.completed) : "—" },
        { label: "Finishes", value: String(row.finishes) },
        { label: "Success", value: row.attemptsUsed ? `${Math.round((row.success / row.attemptsUsed) * 100)}%` : "—" },
        { label: "Best streak", value: String(row.bestStreak) },
        { label: "Darts on finishes", value: row.finishes ? String(row.finishDarts) : "—" },
        { label: "Doubles", value: row.tracked && row.doubleAttempts ? `${Math.round((row.doubleHits / row.doubleAttempts) * 100)}%` : "—" },
      ],
    })),
  };
}

export function addDart(state, dart) {
  if (!project(state).canThrow) throw new Error("121 is over");
  return { ...state, events: [...state.events, { type: "dart", dart: normaliseDart(dart) }] };
}

export function addTyped(state, payload) {
  const view = project(state);
  if (!view.canType) throw new Error("This attempt is closed");
  const row = view.raw.rows[view.raw.active];
  planTotal({
    remaining: row.remaining,
    opened: true,
    inRule: "straight",
    outRule: "double",
    total: payload.miss ? 0 : Number(payload.total),
    dartsUsed: payload.dartsUsed || 3,
    finish: payload.finish || null,
    bust: !!payload.bust,
    miss: !!payload.miss,
    doubleAttempts: payload.doubles == null || payload.doubles === "na" ? null : Number(payload.doubles),
  });
  return {
    ...state,
    events: [...state.events, {
      type: "total",
      total: payload.miss ? 0 : Number(payload.total),
      dartsUsed: payload.dartsUsed || 3,
      finish: payload.finish || null,
      bust: !!payload.bust,
      miss: !!payload.miss,
      doubleAttempts: payload.doubles == null || payload.doubles === "na" ? null : Number(payload.doubles),
    }],
  };
}

export function undo(state) {
  if (!state.events.length) return state;
  return { ...state, events: state.events.slice(0, -1) };
}

export function act() {
  throw new Error("Nothing to continue");
}

export function aim(view, rand) {
  const bot = view.bot;
  if (!bot) return { type: "number", multiplier: 2, value: 20 };
  const route = suggestCheckout(bot.remaining, bot.dartsLeft, "double", 1)[0];
  if (route && (bot.level >= 4 || rand() < 0.3)) return route.darts[0];
  return { type: "number", multiplier: bot.level >= 8 ? 3 : 1, value: 20 };
}

export function schema(view, draft) {
  const row = view.raw.rows[view.raw.active];
  const fields = [{ id: "dartsUsed", type: "step", label: "Darts thrown", min: 1, max: 3 }];
  if (Number(draft?.total) === row.remaining) {
    fields.push({
      id: "finish",
      type: "select",
      label: "Finishing double",
      options: [20, 16, 10, 8, 4].filter((n) => n * 2 <= row.remaining).map((n) => ({ id: `D${n}`, label: `D${n}`, dart: { type: "number", multiplier: 2, value: n } })).concat([{ id: "Bull", label: "Bull", dart: { type: "inner" } }]),
    });
  }
  return { fields, common: [26, 41, 45, 60, 81, 85, 100, 140], miss: true, bust: true, placeholder: "Points that count" };
}

export function step(state) {
  return state.events.length;
}
