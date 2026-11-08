/** One front door for every mode. */

import { makeRand, throwAimed } from "./bot.js";
import * as clock from "./clock.js";
import * as cricket from "./cricket.js";
import * as doubles from "./doubles.js";
import * as english from "./english-mode.js";
import * as halve from "./halve.js";
import * as higher from "./higher.js";
import * as killer from "./killer.js";
import * as ladder from "./ladder.js";
import * as random from "./random.js";
import * as score from "./score.js";
import * as shanghai from "./shanghai.js";
import * as singles from "./singles.js";
import * as tournament from "./tournament.js";
import * as winner from "./winner.js";
import * as x01 from "./x01.js";

export const MODES = {
  x01,
  winner,
  tournament,
  cricket,
  english,
  halve,
  shanghai,
  clock,
  ladder,
  score,
  singles,
  doubles,
  random,
  killer,
  higher,
};

export function create(mode, config) {
  const mod = MODES[mode];
  if (!mod) throw new Error("Unknown game");
  return mod.create(config);
}

export function project(state) {
  return MODES[state.mode].project(state);
}

export function addDart(state, dart) {
  return MODES[state.mode].addDart(state, dart);
}

export function addDarts(state, darts) {
  let next = state;
  for (const dart of darts) {
    const before = project(next);
    if (!before.canThrow) break;
    next = addDart(next, dart);
    const after = project(next);
    if (!after.canThrow || after.dartsThisVisit === 0) break;
  }
  return next;
}

export function addTyped(state, payload) {
  return MODES[state.mode].addTyped(state, payload);
}

export function undo(state) {
  return MODES[state.mode].undo(state);
}

export function act(state, id) {
  const mod = MODES[state.mode];
  if (!mod.act) throw new Error("Nothing to continue");
  return mod.act(state, id);
}

export function schema(state, draft) {
  const mod = MODES[state.mode];
  if (!mod.schema) return { fields: [], common: false, miss: false, bust: false, placeholder: "" };
  return mod.schema(project(state), draft || {});
}

export function botThrow(state) {
  const mod = MODES[state.mode];
  const view = mod.project(state);
  if (!view.botTurn) throw new Error("It is not the bot's turn");
  const rand = makeRand(state.rngSeed, mod.step ? mod.step(state) : state.events?.length || 0);
  const aimed = mod.aim(view, rand);
  const dart = throwAimed(aimed, view.botLevel || 1, rand);
  return mod.addDart(state, dart);
}

export function rulesText(mode, config) {
  const mod = MODES[mode];
  if (!mod?.rulesText) return "";
  return mod.rulesText(config);
}
