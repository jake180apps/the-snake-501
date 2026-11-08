/** Single-elimination X01. Byes do not create scoring stats. */

import { makeRand, makeSeed, throwAimed } from "./bot.js";
import { preparePlayers } from "./roster.js";
import { PLAYER_COLOURS } from "./darts.js";
import { shell } from "./shell.js";
import { blankStats, mergeStats, x01Rows } from "./stats.js";
import { aim as aimX01, createX01, project as projectX01, schema as schemaX01, throwDart, typedVisit, undo as undoX01 } from "./x01.js";

export function bracketSlots(size) {
  let slots = [1, 2];
  while (slots.length < size) {
    const next = [];
    const sum = slots.length * 2 + 1;
    for (const seed of slots) next.push(seed, sum - seed);
    slots = next;
  }
  return slots;
}

export function create(config = {}) {
  const entrants = buildEntrants(config);
  const rngSeed = makeSeed(config);
  const ordered = config.seeding === "manual" ? entrants : shuffle(entrants, rngSeed);
  const rounds = [firstRound(ordered)];
  return {
    v: 1,
    mode: "tournament",
    rngSeed,
    config: normal(config),
    entrants: ordered,
    source: entrants,
    rounds,
    cursor: null,
    x01: null,
    began: false,
    history: [],
    records: ordered.map(() => blankStats()),
    champion: null,
    finalists: null,
  };
}

export function project(state) {
  if (!state.began) {
    return shell({
      phase: "confirm",
      title: "The draw",
      kicker: `${state.entrants.length} entrants · single elimination`,
      headline: "Draw",
      headlineLabel: state.config.seeding === "manual" ? "manual seeding" : "random seeding",
      subhead: "Confirm before the first dart",
      players: state.entrants.map((entrant) => ({ name: entrant.name, primary: "In", secondary: "", active: false, out: false, swatch: entrant.swatch, detail: "" })),
      actions: [
        { id: "begin", label: "Start tournament", tone: "primary" },
        ...(state.config.seeding === "manual" ? [] : [{ id: "reroll", label: "Redraw", tone: "ghost" }]),
      ],
      banner: { title: "Check the draw", body: roundText(state.rounds[0]) },
      rulesBrief: "Byes go through without a match and do not add to the averages.",
      raw: { rounds: state.rounds, entrants: state.entrants.map((entrant) => entrant.name) },
    });
  }
  if (state.champion != null) return championView(state);
  const live = state.x01 ? projectX01(state.x01) : null;
  const match = state.rounds[state.cursor.r].matches[state.cursor.m];
  const between = live?.phase === "done";
  return shell({
    phase: between ? "between" : "live",
    title: state.rounds[state.cursor.r].name,
    kicker: `${state.entrants[match.a].name} v ${state.entrants[match.b].name}`,
    note: live?.note || "",
    headline: between ? state.entrants[match[live.raw.winner === 0 ? "a" : "b"]].name : live.headline,
    headlineLabel: between ? "wins the match" : "remaining",
    subhead: between ? "Match complete" : live.subhead,
    colour: live.colour,
    players: live.players,
    darts: live.darts,
    dartsThisVisit: live.dartsThisVisit,
    suggestions: between ? [] : live.suggestions,
    log: live.log,
    canThrow: !!live?.canThrow,
    canType: !!live?.canType,
    canUndo: true,
    botTurn: !!live?.botTurn,
    botLevel: live?.botLevel ?? null,
    bot: live?.bot || null,
    actions: between ? [{ id: "next", label: "Next match", tone: "primary" }, { id: "simulate", label: "Simulate if both are bots", tone: "ghost" }] : [{ id: "simulate", label: "Simulate bots", tone: "ghost" }],
    banner: between ? { title: `${state.entrants[match[live.raw.winner === 0 ? "a" : "b"]].name} goes through`, body: state.rounds[state.cursor.r].name } : null,
    rulesBrief: "Each match uses the X01 rules for its round. A bye is not a match.",
    raw: { ...(live?.raw || {}), match, round: state.cursor.r },
  });
}

export function addDart(state, dart) {
  if (!state.x01) throw new Error("The match has not started");
  return { ...state, x01: throwDart(state.x01, dart) };
}

export function addTyped(state, payload) {
  if (!state.x01) throw new Error("The match has not started");
  return { ...state, x01: typedVisit(state.x01, payload) };
}

export function undo(state) {
  if (state.x01?.events?.length) return { ...state, x01: undoX01(state.x01) };
  if (!state.history.length) return state;
  const previous = state.history.at(-1);
  return { ...previous, history: state.history.slice(0, -1) };
}

export function act(state, id) {
  if (id === "reroll") {
    if (state.began) throw new Error("The draw is already under way");
    return create({ ...state.config, players: state.source.flatMap((entrant) => entrant.players), entrants: state.source, seeding: "random", rngSeed: state.rngSeed + 17, teams: state.config.teams });
  }
  if (id === "begin") {
    if (state.began) return state;
    const history = [...state.history, snap(state)];
    return startMatch({ ...state, history, began: true });
  }
  if (id === "next") return advance(state);
  if (id === "simulate") return simulate(state);
  throw new Error("Nothing to continue");
}

export function aim(view, rand) {
  return aimX01(view, rand);
}

export function schema(view, draft) {
  return schemaX01(view, draft);
}

export function step(state) {
  return state.history.length * 10000 + (state.x01?.events.length || 0);
}

function advance(state) {
  const live = projectX01(state.x01);
  if (live.phase !== "done") throw new Error("The match is still going");
  const history = [...state.history, snap(state)];
  const rounds = structuredClone(state.rounds);
  const match = rounds[state.cursor.r].matches[state.cursor.m];
  match.winner = live.raw.winner === 0 ? match.a : match.b;
  match.legs = live.raw.legsWon.slice();
  const records = state.records.map((row) => ({ ...row, winningLegDarts: [...row.winningLegDarts] }));
  mergeStats(records[match.a], live.raw.stats[0]);
  mergeStats(records[match.b], live.raw.stats[1]);
  let finalists = state.finalists;
  let champion = null;
  const round = rounds[state.cursor.r];
  if (round.matches.every((item) => item.winner != null)) {
    const winners = round.matches.map((item) => item.winner);
    if (round.kind === "final" || winners.length === 1) champion = winners[0];
    else if (round.kind === "semi" && state.config.third) {
      const losers = round.matches.map((item) => (item.winner === item.a ? item.b : item.a)).filter((id) => id != null);
      finalists = winners;
      if (losers.length === 2) rounds.push({ name: "Third place", kind: "third", matches: [{ a: losers[0], b: losers[1], bye: false, winner: null }] });
      else rounds.push(pairRound("Final", "final", winners));
    } else if (round.kind === "third") rounds.push(pairRound("Final", "final", finalists));
    else rounds.push(pairRound(winners.length === 2 ? "Final" : winners.length === 4 ? "Semi-final" : `Last ${winners.length}`, winners.length === 2 ? "final" : winners.length === 4 ? "semi" : "early", winners));
  }
  const next = { ...state, history, rounds, records, finalists, champion, x01: null, cursor: null };
  if (champion != null) return next;
  return startMatch(next);
}

function startMatch(state) {
  const cursor = findOpen(state.rounds);
  if (!cursor) return { ...state, champion: state.champion ?? state.rounds.at(-1).matches[0].winner };
  const match = state.rounds[cursor.r].matches[cursor.m];
  const kind = state.rounds[cursor.r].kind;
  const preset = state.config.lengths[kind] || state.config.lengths.early;
  const left = state.entrants[match.a];
  const right = state.entrants[match.b];
  const x01 = createX01({
    teams: !!state.config.teams,
    players: [...left.players, ...right.players],
    teamNames: [left.name, right.name],
    start: state.config.start,
    inRule: state.config.inRule,
    outRule: state.config.outRule,
    ...preset,
    starter: 0,
    alternate: true,
    rngSeed: ((state.rngSeed + cursor.r * 100 + cursor.m + state.history.length * 13) >>> 0) || 1,
  });
  return { ...state, cursor, x01 };
}

function simulate(state) {
  let next = state;
  let guard = 0;
  while (guard < 5000) {
    const view = project(next);
    if (view.phase === "done" || view.phase === "confirm") return next;
    if (view.phase === "between") {
      next = advance(next);
      continue;
    }
    if (!view.botTurn) return next;
    const rand = makeRand(next.rngSeed, step(next));
    next = addDart(next, throwAimed(aim(view, rand), view.botLevel || 1, rand));
    guard += 1;
  }
  return next;
}

function championView(state) {
  const name = state.entrants[state.champion].name;
  return shell({
    phase: "done",
    title: "Tournament",
    headline: name,
    headlineLabel: "champion",
    subhead: "Single elimination",
    end: {
      title: `${name} is the champion`,
      subtitle: "Byes are left out of the averages",
      rows: [],
      players: state.entrants.map((entrant, index) => ({
        name: entrant.name,
        rows: x01Rows(state.records[index], { showSets: state.config.lengths.final.setsMode !== "off" }),
      })),
    },
    raw: { rounds: state.rounds, champion: state.champion, records: state.records },
    rulesBrief: "Byes are excluded from throwing averages.",
  });
}

function findOpen(rounds) {
  for (let r = 0; r < rounds.length; r += 1) {
    for (let m = 0; m < rounds[r].matches.length; m += 1) {
      if (rounds[r].matches[m].winner == null) return { r, m };
    }
  }
  return null;
}

function firstRound(entrants) {
  const size = nextPow2(entrants.length);
  const slots = bracketSlots(size);
  const matches = [];
  for (let index = 0; index < slots.length; index += 2) {
    const a = slots[index] <= entrants.length ? slots[index] - 1 : null;
    const b = slots[index + 1] <= entrants.length ? slots[index + 1] - 1 : null;
    const bye = a == null || b == null;
    matches.push({ a, b, bye, winner: bye ? a ?? b : null, legs: null });
  }
  const kind = size === 2 ? "final" : size === 4 ? "semi" : "early";
  return { name: size === 2 ? "Final" : size === 4 ? "Semi-final" : `Last ${size}`, kind, matches };
}

function pairRound(name, kind, winners) {
  const matches = [];
  for (let index = 0; index < winners.length; index += 2) {
    matches.push({ a: winners[index], b: winners[index + 1], bye: false, winner: null, legs: null });
  }
  return { name, kind, matches };
}

function buildEntrants(config) {
  if (config.teams) {
    const list = config.entrants || [];
    if (list.length < 2 || list.length > 32) throw new Error("A tournament needs 2 to 32 teams");
    return list.map((team, index) => {
      const players = preparePlayers(team.players, { min: 2, max: 2 });
      return { name: team.name || `${players[0].name} & ${players[1].name}`, players, swatch: PLAYER_COLOURS[index % 4] };
    });
  }
  const players = preparePlayers(config.players, { min: 2, max: 32 });
  return players.map((player, index) => ({ name: player.name, players: [player], swatch: PLAYER_COLOURS[index % 4] }));
}

function normal(config) {
  const single = { legsMode: "single", legs: 1, setsMode: "off", sets: 1, setLegsMode: "first", setLegs: 3 };
  return {
    start: config.start ?? 501,
    inRule: config.inRule ?? "straight",
    outRule: config.outRule ?? "double",
    teams: !!config.teams,
    seeding: config.seeding === "manual" ? "manual" : "random",
    third: !!config.third,
    lengths: {
      early: { ...single, ...(config.early || {}) },
      semi: { ...single, ...(config.semi || config.early || {}) },
      final: { ...single, ...(config.final || config.semi || config.early || {}) },
      third: { ...single, ...(config.semi || config.early || {}) },
    },
  };
}

function nextPow2(count) {
  let size = 2;
  while (size < count) size *= 2;
  return size;
}

function shuffle(list, seed) {
  const copy = list.map((item) => ({ ...item, players: item.players.map((player) => ({ ...player })) }));
  let value = seed >>> 0;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    value = (Math.imul(value ^ (value >>> 15), 0x6c078965) + index) >>> 0;
    const swap = value % (index + 1);
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function snap(state) {
  const copy = structuredClone({ ...state, history: [] });
  copy.history = state.history;
  return copy;
}

function roundText(round) {
  return round.matches.map((match) => (match.bye ? `Bye` : `${match.a + 1} v ${match.b + 1}`)).join(" · ");
}
