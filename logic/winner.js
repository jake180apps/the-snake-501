/** Winner stays on. 501 straight/double, or 301 double/double. */

import { makeSeed } from "./bot.js";
import { preparePlayers } from "./roster.js";
import { shell } from "./shell.js";
import { blankStats, checkoutRate, firstNine, fmtAvg, fmtPct, mergeStats, threeDart, x01Rows } from "./stats.js";
import { aim as aimX01, createX01, project as projectX01, schema as schemaX01, throwDart, typedVisit, undo as undoX01 } from "./x01.js";

export function create(config = {}) {
  if (config.variant !== "501" && config.variant !== "301") {
    throw new Error("Choose 501 straight in, double out — or 301 double in, double out");
  }
  const people = preparePlayers(config.players, { min: 2, max: 16 });
  const rngSeed = makeSeed(config);
  const players = config.random === false ? people : shuffle(people, rngSeed);
  return {
    v: 1,
    mode: "winner",
    variant: config.variant,
    rngSeed,
    players,
    on: [0, 1],
    waiting: players.map((_, index) => index).slice(2),
    x01: makeLeg(players, [0, 1], config.variant, rngSeed, 0),
    history: [],
    records: players.map(() => blankStats()),
    ended: false,
  };
}

export function project(state) {
  const live = projectX01(state.x01);
  const totals = combined(state, live);
  if (state.ended) {
    const ranked = totals
      .map((stats, index) => ({ index, stats, legs: stats.legsWon }))
      .sort((a, b) => b.legs - a.legs || b.stats.points - a.stats.points);
    const top = ranked[0]?.legs || 0;
    const leaders = ranked.filter((row) => row.legs === top && top > 0).map((row) => state.players[row.index].name);
    return shell({
      phase: "done",
      title: "Winner stays on",
      kicker: variantLabel(state.variant),
      headline: leaders.length ? leaders.join(" & ") : "Session over",
      headlineLabel: leaders.length > 1 ? "most legs" : "most legs",
      subhead: "Session closed",
      canUndo: true,
      end: {
        title: leaders.length === 1 ? `${leaders[0]} won the most legs` : leaders.length ? "The lead is shared" : "No legs finished",
        subtitle: variantLabel(state.variant),
        rows: [{ label: "Legs played", value: String(state.history.length + (live.phase === "done" ? 1 : 0)) }],
        players: state.players.map((player, index) => ({
          name: player.name,
          rows: [
            { label: "Legs won", value: String(totals[index].legsWon) },
            { label: "3-dart average", value: fmtAvg(threeDart(totals[index])) },
            { label: "First nine", value: fmtAvg(firstNine(totals[index])) },
            { label: "Checkout", value: fmtPct(checkoutRate(totals[index])) },
            { label: "Darts", value: String(totals[index].darts) },
          ],
        })),
      },
      raw: { totals },
    });
  }

  const names = state.on.map((index) => state.players[index].name);
  const queue = state.waiting.map((index) => state.players[index].name);
  const between = live.phase === "done";
  const winnerName = between ? names[live.raw.winner] : live.subhead;
  return shell({
    phase: between ? "between" : live.phase,
    title: "Winner stays on",
    kicker: `${variantLabel(state.variant)} · next ${queue[0] || "—"}`,
    note: queue.length ? `Waiting: ${queue.join(", ")}` : "These two close the session.",
    headline: between ? winnerName : live.headline,
    headlineLabel: between ? "stays on" : "remaining",
    subhead: between ? `${names[1 - live.raw.winner]} steps off` : live.subhead,
    colour: live.colour,
    players: live.players.map((card, seat) => ({
      ...card,
      name: names[seat],
      secondary: `Legs ${state.records[state.on[seat]].legsWon}`,
    })),
    darts: live.darts,
    dartsThisVisit: live.dartsThisVisit,
    lastText: live.lastText,
    suggestions: between ? [] : live.suggestions,
    log: live.log,
    canThrow: live.canThrow,
    canType: live.canType,
    canUndo: state.x01.events.length > 0 || state.history.length > 0,
    botTurn: live.botTurn,
    botLevel: live.botLevel,
    bot: live.bot,
    actions: [
      ...(between ? [{ id: "next", label: "Next player", tone: "primary" }] : []),
      { id: "end-session", label: "End session", tone: "ghost" },
    ],
    banner: between ? { title: `${winnerName} stays on`, body: `${queue[0] || "Nobody"} comes on next.` } : null,
    rulesBrief: rulesText(state.variant),
    raw: { ...live.raw, on: state.on.slice(), waiting: state.waiting.slice(), variant: state.variant },
  });
}

export function addDart(state, dart) {
  if (state.ended) throw new Error("The session has ended");
  return { ...state, x01: throwDart(state.x01, dart) };
}

export function addTyped(state, payload) {
  if (state.ended) throw new Error("The session has ended");
  return { ...state, x01: typedVisit(state.x01, payload) };
}

export function undo(state) {
  if (state.ended) return { ...state, ended: false };
  if (state.x01.events.length) return { ...state, x01: undoX01(state.x01) };
  if (!state.history.length) return state;
  const previous = state.history.at(-1);
  return { ...state, ...previous, history: state.history.slice(0, -1), ended: false };
}

export function act(state, id) {
  if (id === "end-session") return { ...state, ended: true };
  if (id !== "next") throw new Error("Nothing to continue");
  const live = projectX01(state.x01);
  if (live.phase !== "done") throw new Error("The leg is still going");
  const records = state.records.map((row) => ({ ...row, winningLegDarts: [...row.winningLegDarts] }));
  mergeStats(records[state.on[0]], live.raw.stats[0]);
  mergeStats(records[state.on[1]], live.raw.stats[1]);
  const winnerId = state.on[live.raw.winner];
  const loserId = state.on[1 - live.raw.winner];
  const waiting = [...state.waiting, loserId];
  const nextId = waiting.shift();
  const on = [winnerId, nextId];
  const history = [...state.history, { x01: state.x01, on: state.on, waiting: state.waiting, records: state.records }];
  return {
    ...state,
    history,
    records,
    on,
    waiting,
    x01: makeLeg(state.players, on, state.variant, state.rngSeed, history.length),
  };
}

export function aim(view, rand) {
  return aimX01(view, rand);
}

export function schema(view, draft) {
  return schemaX01(view, draft);
}

export function step(state) {
  return state.history.length * 10000 + state.x01.events.length;
}

export function rulesText(config = "501") {
  const variant = typeof config === "string" ? config : config?.variant;
  return variant === "301"
    ? "301, double in and double out. The winner stays. The loser goes to the back and the next player comes on. End the session when you have had enough."
    : "501, straight in and double out. The winner stays. The loser goes to the back and the next player comes on. End the session when you have had enough.";
}

function combined(state, live) {
  const totals = state.records.map((row) => ({ ...row, winningLegDarts: [...row.winningLegDarts] }));
  if (!state.ended || live.raw?.stats) {
    mergeStats(totals[state.on[0]], live.raw.stats[0]);
    mergeStats(totals[state.on[1]], live.raw.stats[1]);
  }
  return totals;
}

function makeLeg(players, on, variant, seed, index) {
  const rules = variant === "301"
    ? { start: 301, inRule: "double", outRule: "double" }
    : { start: 501, inRule: "straight", outRule: "double" };
  return createX01({
    players: on.map((id) => players[id]),
    ...rules,
    legsMode: "single",
    starter: 0,
    alternate: false,
    bullOff: false,
    rngSeed: ((seed + (index + 1) * 9973) >>> 0) || 1,
  });
}

function variantLabel(variant) {
  return variant === "301" ? "301 · double in · double out" : "501 · straight in · double out";
}

function shuffle(list, seed) {
  const copy = [...list];
  let value = seed >>> 0;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    value = (Math.imul(value ^ (value >>> 15), 0x6c078965) + index) >>> 0;
    const swap = value % (index + 1);
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

void x01Rows;
