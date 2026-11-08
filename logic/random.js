/** Random checkout. Shared targets by default. Bogeys stay out of a 3-dart double draw. */

import { normaliseDart } from "./darts.js";
import { canCheckout, isBogey, suggestCheckout } from "./checkout.js";
import { makeRand, makeSeed } from "./bot.js";
import { preparePlayers } from "./roster.js";
import { PLAYER_COLOURS } from "./darts.js";
import { shell } from "./shell.js";
import { planTotal, scoreSequence } from "./sequence.js";

const BRACKETS = [
  { min: 2, max: 40, points: 1, label: "2–40" },
  { min: 41, max: 60, points: 2, label: "41–60" },
  { min: 61, max: 80, points: 3, label: "61–80" },
  { min: 81, max: 90, points: 4, label: "81–90" },
  { min: 91, max: 100, points: 5, label: "91–100" },
  { min: 101, max: 130, points: 8, label: "101–130" },
  { min: 131, max: 170, points: 10, label: "131+" },
];

export function create(config = {}) {
  const people = preparePlayers(config.players, { min: 1, max: 4 });
  const budget = [3, 6, 9].includes(config.budget) ? config.budget : 3;
  const outRule = ["straight", "double", "master"].includes(config.outRule) ? config.outRule : "double";
  const rounds = Number.isInteger(config.rounds) ? config.rounds : 8;
  if (rounds < 1 || rounds > 30) throw new Error("Choose how many rounds");
  return {
    v: 1,
    mode: "random",
    rngSeed: makeSeed(config),
    players: people.map((player, index) => ({ ...player, swatch: PLAYER_COLOURS[index] })),
    config: {
      budget,
      outRule,
      rounds,
      preset: config.preset === "bracket" ? "bracket" : "random",
      shared: config.shared !== false && config.preset !== "bracket",
      min: config.min ?? 2,
      max: config.max ?? 170,
    },
    events: [],
  };
}

export function legalTargets(config) {
  const list = [];
  const min = config.preset === "bracket" ? 2 : config.min;
  const max = config.preset === "bracket" ? 170 : config.max;
  for (let score = min; score <= max; score += 1) {
    if (config.budget <= 3 && config.outRule === "double" && (score > 170 || isBogey(score))) continue;
    if (canCheckout(score, config.budget, config.outRule)) list.push(score);
  }
  return list;
}

export function project(state) {
  const rows = state.players.map(() => ({
    points: 0,
    success: 0,
    attempts: 0,
    highest: 0,
    darts: 0,
    successes: 0,
    bracket: 0,
    doubleAttempts: 0,
    doubleHits: 0,
    tracked: false,
  }));
  let round = 0;
  let turn = 0;
  let pending = [];
  let target = draw(state, 0, 0);
  const perTarget = state.players.map(() => target);

  for (const event of state.events) {
    if (round >= state.config.rounds) break;
    const index = turn % state.players.length;
    const activeTarget = state.config.shared ? target : perTarget[index];
    if (!rows[index].live) arm(rows[index], activeTarget);
    if (event.type === "dart") {
      pending.push(event.dart);
      const seq = scoreSequence(rows[index].visitRemaining, true, pending, "straight", state.config.outRule);
      if (seq.bust || seq.checkout || pending.length === 3) {
        finishVisit(index, seq);
        pending = [];
      }
    } else if (event.type === "total" && pending.length === 0) {
      const seq = planTotal({
        remaining: rows[index].remaining,
        opened: true,
        inRule: "straight",
        outRule: state.config.outRule,
        total: event.total,
        dartsUsed: event.dartsUsed || 3,
        finish: event.finish,
        bust: event.bust,
        miss: event.miss,
        doubleAttempts: event.doubleAttempts,
      });
      finishVisit(index, seq);
    }
  }

  const done = round >= state.config.rounds;
  const active = turn % state.players.length;
  const current = state.players[active];
  const showTarget = state.config.shared ? target : perTarget[active];
  return shell({
    phase: done ? "done" : "live",
    title: state.config.preset === "bracket" ? "Checkout ladder" : "Random checkout",
    kicker: state.config.shared ? "Same target for everyone" : "Each player draws their own finish",
    note: `${state.config.budget} darts · ${state.config.outRule} out`,
    headline: String(showTarget ?? "—"),
    headlineLabel: "finish",
    subhead: current.name,
    colour: current.swatch,
    players: state.players.map((player, index) => ({
      name: player.name,
      primary: String(rows[index].points),
      secondary: `${rows[index].success}/${rows[index].attempts || 0}`,
      active: !done && index === active,
      out: false,
      swatch: player.swatch,
      detail: state.config.preset === "bracket" ? BRACKETS[rows[index].bracket].label : "",
    })),
    darts: pending.map((dart) => ({ label: dart.type })),
    dartsThisVisit: pending.length,
    suggestions: suggestCheckout(rows[active].remaining || showTarget, Math.max(1, Math.min(3, state.config.budget - (rows[active].used || 0))), state.config.outRule).map((item) => ({ text: item.text })),
    canThrow: !done,
    canType: !done && pending.length === 0,
    canUndo: state.events.length > 0,
    botTurn: !done && !!current.bot,
    botLevel: current.bot,
    bot: current.bot ? { level: current.bot, role: "score", remaining: rows[active].remaining || showTarget, opened: true, dartsLeft: Math.max(1, 3 - pending.length), inRule: "straight", outRule: state.config.outRule } : null,
    end: done ? finishBoard(state, rows) : null,
    rulesBrief: rulesText(state.config),
    raw: { rows, target: showTarget, remaining: rows[active].remaining || showTarget, opened: true, inRule: "straight", outRule: state.config.outRule, round },
  });

  function arm(row, score) {
    row.live = true;
    row.remaining = score;
    row.used = 0;
    row.visitRemaining = score;
    row.visitUsed = 0;
    row.target = score;
  }

  function finishVisit(index, seq) {
    const row = rows[index];
    row.doubleAttempts += seq.attempts || 0;
    row.doubleHits += seq.hits || 0;
    if (seq.tracked) row.tracked = true;
    if (seq.checkout) {
      row.used += seq.dartsUsed;
      row.success += 1;
      row.attempts += 1;
      row.darts += row.used;
      row.successes += 1;
      if (row.target > row.highest) row.highest = row.target;
      row.points += state.config.preset === "bracket" ? BRACKETS[row.bracket].points : 1;
      if (state.config.preset === "bracket") row.bracket = Math.min(BRACKETS.length - 1, row.bracket + 1);
      row.live = false;
      advance(index);
      return;
    }
    if (seq.bust) {
      row.used = row.visitUsed + Math.min(3, state.config.budget - row.visitUsed);
      row.remaining = row.visitRemaining;
    } else {
      row.used = row.visitUsed + (seq.dartsUsed || 3);
      row.remaining = seq.remaining;
    }
    if (row.used >= state.config.budget) {
      row.attempts += 1;
      row.darts += row.used;
      if (state.config.preset === "bracket") row.bracket = Math.max(0, row.bracket - 1);
      row.live = false;
      advance(index);
      return;
    }
    row.visitRemaining = row.remaining;
    row.visitUsed = row.used;
    turn = index + 1;
  }

  function advance(index) {
    turn = index + 1;
    if (turn % state.players.length === 0) {
      round += 1;
      if (state.config.shared) target = draw(state, round, 0);
    }
    if (!state.config.shared) perTarget[index] = draw(state, round, index + 1);
  }
}

function draw(state, round, salt) {
  if (state.config.preset === "bracket") {
    const bracket = BRACKETS[0];
    const options = [];
    for (let score = bracket.min; score <= bracket.max; score += 1) {
      if (canCheckout(score, state.config.budget, state.config.outRule)) options.push(score);
    }
    const rand = makeRand(state.rngSeed, 8000 + round * 20 + salt);
    return options[Math.floor(rand() * options.length)];
  }
  const options = legalTargets(state.config);
  const rand = makeRand(state.rngSeed, 5000 + round * 13 + salt);
  return options[Math.floor(rand() * options.length)];
}

function finishBoard(state, rows) {
  const best = Math.max(...rows.map((row) => row.points));
  const names = rows.map((row, index) => (row.points === best ? state.players[index].name : null)).filter(Boolean);
  return {
    title: names.length === 1 ? `${names[0]} wins` : "Shared result",
    subtitle: state.config.preset === "bracket" ? "Bracket points" : "Random finishes",
    rows: [],
    players: state.players.map((player, index) => ({
      name: player.name,
      rows: [
        { label: state.config.preset === "bracket" ? "Bracket points" : "Checkouts", value: String(rows[index].points) },
        { label: "Success", value: rows[index].attempts ? `${Math.round((rows[index].success / rows[index].attempts) * 100)}%` : "—" },
        { label: "Highest finish", value: rows[index].highest ? String(rows[index].highest) : "—" },
        { label: "Darts on success", value: rows[index].success ? String(rows[index].darts) : "—" },
        { label: "Doubles", value: rows[index].tracked && rows[index].doubleAttempts ? `${Math.round((rows[index].doubleHits / rows[index].doubleAttempts) * 100)}%` : "—" },
      ],
    })),
  };
}

export function addDart(state, dart) {
  if (!project(state).canThrow) throw new Error("Random checkout is over");
  return { ...state, events: [...state.events, { type: "dart", dart: normaliseDart(dart) }] };
}

export function addTyped(state, payload) {
  const view = project(state);
  if (!view.canType) throw new Error("This finish is closed");
  planTotal({
    remaining: view.raw.remaining,
    opened: true,
    inRule: "straight",
    outRule: view.raw.outRule,
    total: payload.miss ? 0 : Number(payload.total),
    dartsUsed: payload.dartsUsed || 3,
    finish: payload.finish || null,
    bust: !!payload.bust,
    miss: !!payload.miss,
    doubleAttempts: payload.doubles == null || payload.doubles === "na" ? null : Number(payload.doubles),
  });
  return { ...state, events: [...state.events, { type: "total", total: payload.miss ? 0 : Number(payload.total), dartsUsed: payload.dartsUsed || 3, finish: payload.finish || null, bust: !!payload.bust, miss: !!payload.miss, doubleAttempts: payload.doubles == null || payload.doubles === "na" ? null : Number(payload.doubles) }] };
}

export function undo(state) {
  if (!state.events.length) return state;
  return { ...state, events: state.events.slice(0, -1) };
}

export function act() {
  throw new Error("Nothing to continue");
}

export function aim(view, rand) {
  const route = suggestCheckout(view.bot.remaining, view.bot.dartsLeft, view.bot.outRule, 1)[0];
  if (route && ((view.botLevel || 1) >= 4 || rand() < 0.25)) return route.darts[0];
  return { type: "number", multiplier: (view.botLevel || 1) >= 8 ? 3 : 1, value: 20 };
}

export function schema(view, draft) {
  const fields = [{ id: "dartsUsed", type: "step", label: "Darts thrown", min: 1, max: 3 }];
  if (Number(draft?.total) === view.raw.remaining && view.raw.outRule !== "straight") {
    fields.unshift({ id: "finish", type: "select", label: "Finishing dart", options: [{ id: "D20", label: "D20", dart: { type: "number", multiplier: 2, value: 20 } }, { id: "Bull", label: "Bull", dart: { type: "inner" } }] });
  }
  return { fields, common: false, miss: true, bust: true, placeholder: "Points scored" };
}

export function rulesText(config = {}) {
  const shared = config.preset === "bracket"
    ? "Bracket points move you up after a checkout and down after a miss. Each player draws inside their own bracket."
    : config.shared === false
      ? "Each player draws a separate finish."
      : "Everyone faces the same finish each round.";
  return `Finish the drawn score, ${config.outRule || "double"} out, within ${config.budget || 3} darts. A 3-dart double draw skips anything above 170 and the bogey numbers. ${shared}`;
}

export function step(state) {
  return state.events.length;
}
