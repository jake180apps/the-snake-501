/** English Cricket, skinned for The Snake 501. Rules come from Wickets & Runs unchanged. */

import { makeSeed } from "./bot.js";
import { clipName } from "./darts.js";
import { shell } from "./shell.js";
import {
  beginSecondInnings,
  createMatch,
  declareInnings,
  finishMatch,
  project as projectMatch,
  recordTypedVisit,
  throwDart,
  undo as undoMatch,
} from "./english.js";

export function create(config = {}) {
  const teams = !!config.teams;
  const players = (config.players || []).map((player, index) => ({
    name: clipName(player?.name, `Player ${index + 1}`),
    bot: player?.bot || null,
  }));
  if (teams && players.length !== 4) throw new Error("English Cricket teams need four names");
  if (!teams && players.length !== 2) throw new Error("English Cricket needs two sides");
  const botOf = {};
  if (teams) {
    botOf[`0:${players[0].name}`] = players[0].bot;
    botOf[`0:${players[1].name}`] = players[1].bot;
    botOf[`1:${players[2].name}`] = players[2].bot;
    botOf[`1:${players[3].name}`] = players[3].bot;
  } else {
    botOf[`0:${players[0].name}`] = players[0].bot;
    botOf[`1:${players[1].name}`] = players[1].bot;
  }
  const match = createMatch({
    format: teams ? "teams" : "singles",
    sides: teams ? [clipName(config.teamNames?.[0], ""), clipName(config.teamNames?.[1], "")] : [players[0].name, players[1].name],
    players: teams ? [[players[0].name, players[1].name], [players[2].name, players[3].name]] : null,
    wickets: config.wickets === 11 ? 11 : 10,
    battingFirst: config.battingFirst === 1 ? 1 : 0,
    inningsEach: config.inningsEach === 2 ? 2 : 1,
    battingInput: "darts",
  });
  return { v: 1, mode: "english", rngSeed: makeSeed(config), match, botOf };
}

export function project(state) {
  const view = projectMatch(state.match);
  const level = state.botOf[`${view.throwingSide}:${view.throwingName}`] || null;
  const batting = view.sides[view.battingSide];
  const score = `${view.runs[view.battingSide]}`;
  return shell({
    phase: view.phase === "break" ? "break" : view.phase === "done" ? "done" : "live",
    title: "English Cricket",
    kicker: `Innings ${view.innings}${view.inningsEach === 2 ? ` of ${view.inningsEach * 2}` : ""} · ${view.wicketsSetting} wickets`,
    note: view.visitRole === "bowler" ? "Bowler: only bulls take wickets." : "Batter: only the points above 40 are runs. Bulls are wickets.",
    headline: view.phase === "done" ? `${view.runs[0]} – ${view.runs[1]}` : score,
    headlineLabel: view.phase === "done" ? "runs" : `${view.wicketsDown}/${view.wicketsSetting}`,
    subhead: view.throwingName,
    colour: view.battingSide === 0 ? "#2E9BDB" : "#F4F7FB",
    players: [0, 1].map((index) => ({
      name: view.sides[index],
      primary: String(view.runs[index]),
      secondary: index === view.battingSide ? `${view.wicketsDown} down` : "bowling",
      active: view.phase === "live" && view.throwingSide === index,
      out: false,
      swatch: index === 0 ? "#2E9BDB" : "#F4F7FB",
      detail: index === view.battingSide ? view.batterName : view.bowlerName,
    })),
    darts: (view.visit || []).map((dart) => ({ label: dart.label })),
    dartsThisVisit: view.dartsThrown,
    lastText: view.lastVisit ? `${view.lastVisit.role} ${view.lastVisit.runs} runs` : "",
    canThrow: view.canThrow,
    canType: view.canTypeVisit,
    canUndo: view.canUndo,
    botTurn: view.canThrow && !!level,
    botLevel: level,
    bot: level ? { level, role: view.visitRole } : null,
    actions: [
      ...(view.phase === "break" ? [{ id: "next", label: "Next innings", tone: "primary" }] : []),
      ...(view.canDeclare ? [{ id: "declare", label: "Declare", tone: "ghost" }] : []),
      ...(view.canFinishEarly ? [{ id: "finish", label: "End match", tone: "ghost" }] : []),
    ],
    banner: view.phase === "break" ? { title: "Innings closed", body: `${batting} made ${view.inningsRuns}.` } : null,
    end: view.phase === "done" ? englishEnd(view) : null,
    rulesBrief: "Two sides. The batter scores runs only above 40. Outer bull is one wicket, inner bull is two, and bulls add no runs. The bowler takes wickets only with bulls. Declare, or end the match once the chase is won.",
    raw: view,
  });
}

function englishEnd(view) {
  const result = view.result?.type === "draw"
    ? "Match drawn"
    : `${view.sides[view.result.side]} win by ${view.result.margin}`;
  return {
    title: result,
    subtitle: "English Cricket",
    rows: [
      { label: view.sides[0], value: String(view.runs[0]) },
      { label: view.sides[1], value: String(view.runs[1]) },
    ],
    players: view.averages.players.flat().map((player) => ({
      name: player.name,
      rows: [
        { label: "Runs", value: String(player.runs) },
        { label: "Runs per visit", value: player.runsPerVisit == null ? "—" : player.runsPerVisit.toFixed(2) },
        { label: "Wickets", value: String(player.wickets) },
        { label: "Wickets per visit", value: player.wicketsPerVisit == null ? "—" : player.wicketsPerVisit.toFixed(2) },
      ],
    })),
  };
}

export function addDart(state, dart) {
  return { ...state, match: throwDart(state.match, dart) };
}

export function addTyped(state, payload) {
  return {
    ...state,
    match: recordTypedVisit(state.match, { points: Number(payload.total ?? payload.points ?? 0), wickets: Number(payload.wickets ?? 0) }),
  };
}

export function undo(state) {
  return { ...state, match: undoMatch(state.match) };
}

export function act(state, id) {
  if (id === "declare") return { ...state, match: declareInnings(state.match) };
  if (id === "finish") return { ...state, match: finishMatch(state.match) };
  if (id === "next") return { ...state, match: beginSecondInnings(state.match) };
  throw new Error("That is not available");
}

export function aim(view) {
  if (view.bot?.role === "bowler" || view.raw?.visitRole === "bowler") return { type: "inner" };
  return { type: "number", multiplier: (view.botLevel || 1) >= 7 ? 3 : 1, value: 20 };
}

export function schema() {
  return {
    fields: [{ id: "wickets", type: "step", label: "Wickets lost to bulls", min: 0, max: 6 }],
    common: [26, 41, 45, 60, 81, 85, 100, 140, 180],
    miss: true,
    bust: false,
    placeholder: "Visit total",
  };
}

export function step(state) {
  return state.match.events.length;
}

export function rulesText(config = {}) {
  const wickets = config.wickets === 11 || config.wickets === "11" ? 11 : 10;
  const innings = config.inningsEach === 2 || config.inningsEach === "2" ? "two innings each" : "one innings each";
  return `English cricket, not the 15–20 game. ${wickets} wickets and ${innings}. Only points above 40 are runs. Outer bull is one wicket, inner bull is two, and bulls score no runs. The bowler takes wickets only with bulls. You may declare, and end the match once the chase is won.`;
}
