/** Classic pub Killer. Three lives, own double to become a killer. */

import { isDouble, normaliseDart } from "./darts.js";
import { makeSeed } from "./bot.js";
import { preparePlayers } from "./roster.js";
import { PLAYER_COLOURS } from "./darts.js";
import { shell } from "./shell.js";

export function create(config = {}) {
  const people = preparePlayers(config.players, { min: 2, max: 4 });
  const numbers = assignNumbers(people, config, makeSeed(config));
  return {
    v: 1,
    mode: "killer",
    rngSeed: makeSeed(config),
    players: people.map((player, index) => ({ ...player, number: numbers[index], swatch: PLAYER_COLOURS[index] })),
    events: [],
  };
}

export function project(state) {
  const players = state.players.map((player) => ({
    lives: 3,
    killer: false,
    out: false,
    eliminations: 0,
    taken: 0,
    lost: 0,
    selfHits: 0,
    doubles: 0,
    darts: 0,
  }));
  let turn = 0;
  let pending = [];
  let winner = null;

  const nextAlive = (from) => {
    for (let step = 0; step < state.players.length; step += 1) {
      const index = (((from % state.players.length) + state.players.length) % state.players.length + step) % state.players.length;
      if (!players[index].out) return index;
    }
    return null;
  };

  for (const event of state.events) {
    if (winner != null) break;
    const index = nextAlive(turn);
    if (index == null) break;
    const darts = event.type === "dart" ? [event.dart] : event.darts || [];
    if (event.type === "dart") pending.push(event.dart);
    const list = event.type === "dart" ? [event.dart] : darts;
    for (const dart of list) {
      players[index].darts += 1;
      apply(players, index, dart, state.players);
      if (alive(players).length <= 1) {
        winner = alive(players)[0] ?? null;
        break;
      }
    }
    if (event.type !== "dart" || winner != null || pending.length === 3) {
      pending = [];
      turn = index + 1;
    }
  }

  const active = nextAlive(turn);
  const current = active == null ? null : state.players[active];
  return shell({
    phase: winner != null || active == null ? "done" : "live",
    title: "Killer",
    kicker: "Classic · 3 lives",
    note: "Hit your own double to become a killer. Then an opponent’s double costs them a life. Your own double after that costs you one.",
    headline: current ? `D${current.number}` : "Over",
    headlineLabel: current?.name || "",
    subhead: current ? (players[active].killer ? "Killer" : "Not a killer yet") : "",
    colour: current?.swatch || "#2E9BDB",
    players: state.players.map((player, index) => ({
      name: player.name,
      primary: players[index].out ? "Out" : `${players[index].lives}`,
      secondary: `No. ${player.number}`,
      active: index === active,
      out: players[index].out,
      swatch: player.swatch,
      detail: players[index].killer ? "Killer" : "",
    })),
    darts: pending.map((dart) => ({ label: dart.type === "number" ? `×${dart.multiplier} ${dart.value}` : dart.type })),
    dartsThisVisit: pending.length,
    canThrow: winner == null && active != null,
    canType: winner == null && active != null && pending.length === 0,
    canUndo: state.events.length > 0,
    botTurn: !!(current && current.bot) && winner == null,
    botLevel: current?.bot ?? null,
    bot: current?.bot ? { level: current.bot, self: current.number, killer: players[active].killer, foes: foeNumbers(state, players, active) } : null,
    end: winner == null && active != null ? null : {
      title: winner == null ? "No survivor" : `${state.players[winner].name} wins`,
      subtitle: "Classic Killer",
      rows: [],
      players: state.players.map((player, index) => ({
        name: player.name,
        rows: [
          { label: "Number", value: String(player.number) },
          { label: "Lives left", value: players[index].out ? "0" : String(players[index].lives) },
          { label: "Eliminations", value: String(players[index].eliminations) },
          { label: "Lives taken", value: String(players[index].taken) },
          { label: "Lives lost", value: String(players[index].lost) },
          { label: "Self hits", value: String(players[index].selfHits) },
        ],
      })),
    },
    rulesBrief: "Each player has a number and three lives. Hit your own double to become a killer. A killer’s dart in an opponent’s double removes a life. Hitting your own double once you are a killer costs you a life. Last player standing wins.",
    raw: { players, active, numbers: state.players.map((player) => player.number) },
  });
}

function apply(players, index, dart, roster) {
  const clean = normaliseDart(dart);
  if (!isDouble(clean) || clean.type !== "number") return;
  const me = players[index];
  me.doubles += 1;
  if (clean.value === roster[index].number) {
    if (!me.killer) me.killer = true;
    else {
      me.selfHits += 1;
      me.lives -= 1;
      me.lost += 1;
      if (me.lives <= 0) me.out = true;
    }
    return;
  }
  if (!me.killer) return;
  const foe = roster.findIndex((player, foeIndex) => foeIndex !== index && player.number === clean.value && !players[foeIndex].out);
  if (foe < 0) return;
  players[foe].lives -= 1;
  players[foe].lost += 1;
  me.taken += 1;
  if (players[foe].lives <= 0) {
    players[foe].out = true;
    me.eliminations += 1;
  }
}

function alive(players) {
  return players.map((player, index) => (player.out ? -1 : index)).filter((index) => index >= 0);
}

function foeNumbers(state, players, active) {
  return state.players
    .map((player, index) => ({ index, number: player.number, out: players[index].out }))
    .filter((player) => player.index !== active && !player.out);
}

export function addDart(state, dart) {
  if (!project(state).canThrow) throw new Error("Killer is over");
  return { ...state, events: [...state.events, { type: "dart", dart: normaliseDart(dart) }] };
}

export function addTyped(state, payload) {
  const view = project(state);
  if (!view.canType) throw new Error("This visit is closed");
  const choices = payload.killer || [];
  const darts = [0, 1, 2].map((index) => choiceToDart(choices[index], view));
  return { ...state, events: [...state.events, { type: "visit", darts }] };
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
  if (!bot?.killer) return { type: "number", multiplier: 2, value: bot.self };
  const foes = bot.foes || [];
  if (!foes.length) return { type: "number", multiplier: 1, value: 20 };
  const foe = foes[Math.floor(rand() * foes.length)];
  return { type: "number", multiplier: 2, value: foe.number };
}

export function schema(view) {
  const options = [{ id: "none", label: "No effect" }, { id: "own", label: "Own double" }];
  for (const foe of view.bot?.foes || []) options.push({ id: `p${foe.index}`, label: `${foe.number}` });
  const names = view.players
    .map((player, index) => ({ index, player }))
    .filter((item) => !item.player.out && item.index !== view.raw.active);
  const full = [{ id: "none", label: "No effect" }, { id: "own", label: "Own double" }];
  for (const item of names) full.push({ id: `p${item.index}`, label: `${item.player.name}'s double` });
  return {
    fields: [0, 1, 2].map((index) => ({ id: `killer${index}`, type: "select", label: `Dart ${index + 1}`, options: full.length ? full : options })),
    common: false,
    miss: false,
    bust: false,
    placeholder: "",
  };
}

export function step(state) {
  return state.events.length;
}

function choiceToDart(choice, view) {
  if (choice === "own") return { type: "number", multiplier: 2, value: view.raw.numbers[view.raw.active] };
  if (typeof choice === "string" && choice.startsWith("p")) {
    const index = Number(choice.slice(1));
    return { type: "number", multiplier: 2, value: view.raw.numbers[index] };
  }
  return { type: "miss" };
}

function assignNumbers(players, config, seed) {
  if (Array.isArray(config.numbers) && config.numbers.length === players.length) {
    const unique = new Set(config.numbers);
    if (unique.size !== players.length || config.numbers.some((number) => !Number.isInteger(number) || number < 1 || number > 20)) {
      throw new Error("Each player needs a different number from 1 to 20");
    }
    return config.numbers;
  }
  const bag = Array.from({ length: 20 }, (_, index) => index + 1);
  let value = seed >>> 0;
  for (let index = bag.length - 1; index > 0; index -= 1) {
    value = (Math.imul(value ^ (value >>> 13), 0x5bd1e995) + index) >>> 0;
    const swap = value % (index + 1);
    [bag[index], bag[swap]] = [bag[swap], bag[index]];
  }
  return bag.slice(0, players.length);
}
