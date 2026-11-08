/** Higher than the upper bar, or lower than the lower bar. Jake's rules. */

import { dartPoints, isPossibleVisit, normaliseDart } from "./darts.js";
import { makeSeed } from "./bot.js";
import { preparePlayers } from "./roster.js";
import { PLAYER_COLOURS } from "./darts.js";
import { shell } from "./shell.js";

export function create(config = {}) {
  const people = preparePlayers(config.players, { min: 2, max: 4 });
  return {
    v: 1,
    mode: "higher",
    rngSeed: makeSeed(config),
    players: people.map((player, index) => ({ ...player, swatch: PLAYER_COLOURS[index] })),
    events: [],
  };
}

export function project(state) {
  let high = 41;
  let low = 26;
  const rows = state.players.map(() => ({ out: false, visits: 0, highs: 0, lows: 0, best: null, worst: null }));
  let turn = 0;
  let pending = [];
  let lastText = "";

  for (const event of state.events) {
    if (rows.filter((row) => !row.out).length <= 1) break;
    const index = nextIn(turn);
    if (event.type === "dart") {
      pending.push(event.dart);
      if (pending.length === 3 || pending.some((dart) => normaliseDart(dart).type === "miss")) closeDartVisit(index);
    } else if (event.type === "total" && pending.length === 0) closeTotal(index, event);
  }

  const alive = rows.filter((row) => !row.out).length;
  const active = nextIn(turn);
  const current = state.players[active] || state.players[0];
  const champion = alive === 1 ? state.players[rows.findIndex((row) => !row.out)] : null;
  return shell({
    phase: alive <= 1 ? "done" : "live",
    title: "Higher / lower",
    kicker: "One life",
    note: "Every dart must score. Treble 1 counts as 0 and is allowed. A miss eliminates you. Exactly on a bar eliminates you.",
    headline: `${high}`,
    headlineLabel: `or under ${low}`,
    subhead: current.name,
    colour: current.swatch,
    players: state.players.map((player, index) => ({
      name: player.name,
      primary: rows[index].out ? "Out" : "In",
      secondary: `${rows[index].visits} survived`,
      active: alive > 1 && index === active,
      out: rows[index].out,
      swatch: player.swatch,
      detail: "",
    })),
    darts: pending.map((dart) => ({ label: normaliseDart(dart).type === "miss" ? "Miss" : String(dartPoints(dart)) })),
    dartsThisVisit: pending.length,
    lastText,
    canThrow: alive > 1,
    canType: alive > 1 && pending.length === 0,
    canUndo: state.events.length > 0,
    botTurn: alive > 1 && !!current.bot,
    botLevel: current.bot,
    bot: current.bot ? { level: current.bot, high, low } : null,
    end: alive > 1 ? null : {
      title: champion ? `${champion.name} wins` : "No survivor",
      subtitle: "Higher than 41, lower than 26",
      rows: [{ label: "Final bars", value: `${high} / ${low}` }],
      players: state.players.map((player, index) => ({
        name: player.name,
        rows: [
          { label: "Survived visits", value: String(rows[index].visits) },
          { label: "High escapes", value: String(rows[index].highs) },
          { label: "Low escapes", value: String(rows[index].lows) },
          { label: "Highest visit", value: rows[index].best == null ? "—" : String(rows[index].best) },
          { label: "Lowest visit", value: rows[index].worst == null ? "—" : String(rows[index].worst) },
        ],
      })),
    },
    rulesBrief: rulesText(),
    raw: { high, low, rows, active },
  });

  function closeDartVisit(index) {
    const missed = pending.some((dart) => normaliseDart(dart).type === "miss");
    const total = pending.reduce((sum, dart) => sum + (normaliseDart(dart).type === "miss" ? 0 : dartPoints(dart)), 0);
    settle(index, total, missed);
    pending = [];
    turn = index + 1;
  }

  function closeTotal(index, event) {
    settle(index, Number(event.total) || 0, !!event.miss);
    turn = index + 1;
  }

  function settle(index, total, missed) {
    const row = rows[index];
    if (missed || !(total > high || total < low)) {
      row.out = true;
      lastText = `${state.players[index].name} is out${missed ? " — a dart missed" : ` on ${total}`}`;
      return;
    }
    row.visits += 1;
    if (total > high) {
      row.highs += 1;
      high = total;
      lastText = `${state.players[index].name} sets the high bar to ${total}`;
    } else {
      row.lows += 1;
      low = total;
      lastText = `${state.players[index].name} sets the low bar to ${total}`;
    }
    if (row.best == null || total > row.best) row.best = total;
    if (row.worst == null || total < row.worst) row.worst = total;
  }

  function nextIn(from) {
    for (let step = 0; step < state.players.length; step += 1) {
      const index = (from + step) % state.players.length;
      if (!rows[index].out) return index;
    }
    return 0;
  }
}

export function addDart(state, dart) {
  if (!project(state).canThrow) throw new Error("The game is over");
  return { ...state, events: [...state.events, { type: "dart", dart: normaliseDart(dart) }] };
}

export function addTyped(state, payload) {
  const view = project(state);
  if (!view.canType) throw new Error("This turn is closed");
  if (payload.miss) return { ...state, events: [...state.events, { type: "total", total: Number(payload.total) || 0, miss: true }] };
  const total = Number(payload.total);
  if (!isPossibleVisit(total, 3)) throw new Error("That total is impossible with three scoring darts");
  return { ...state, events: [...state.events, { type: "total", total, miss: false }] };
}

export function undo(state) {
  if (!state.events.length) return state;
  return { ...state, events: state.events.slice(0, -1) };
}

export function act() {
  throw new Error("Nothing to continue");
}

export function aim(view, rand) {
  const { high, low } = view.bot || view.raw;
  const level = view.botLevel || 1;
  const wantHigh = high <= 120 || low <= 8;
  if (wantHigh && high < 180) return { type: "number", multiplier: level >= 6 ? 3 : 1, value: 20 };
  const lowFace = low > 15 ? 1 : 5;
  return { type: "number", multiplier: 1, value: rand() < 0.8 ? lowFace : 1 };
}

export function schema() {
  return {
    fields: [{ id: "miss", type: "toggle", label: "A dart missed the board" }],
    common: [26, 41, 45, 60, 81, 85, 100, 140, 180],
    miss: true,
    bust: false,
    placeholder: "Three-dart total",
  };
}

export function rulesText() {
  return "Start with an upper bar of 41 and a lower bar of 26. The three-dart total must be strictly higher than the upper bar or strictly lower than the lower bar. Every dart must score. Treble 1 counts as 0 and does not eliminate you; a miss does. A knocked-out visit does not move the bars. Last player in wins.";
}

export function step(state) {
  return state.events.length;
}
