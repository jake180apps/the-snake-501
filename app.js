import { act, addDarts, addTyped, botThrow, create, project, schema, undo } from "./logic/index.js";
import { rulesText } from "./logic/index.js";

const PREFIX = "snake501.";
const BOARD = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const COMMON = [26, 41, 45, 60, 81, 85, 100, 140, 180];

const CATALOGUE = [
  { id: "x01", group: "Match", name: "X01", blurb: "Count down from 501. Straight in and double out, or set your own.", players: { min: 1, max: 4, teams: true }, defaults: { start: "501", inRule: "straight", outRule: "double", legsMode: "single", legs: "3", setsMode: "off", sets: "3", setLegsMode: "first", setLegs: "3", bullOff: false, alternate: true, starter: "0" } },
  { id: "winner", group: "Match", name: "Winner stays on", blurb: "Play a leg, the winner stays, and the next player walks on.", players: { min: 2, max: 16, teams: false }, defaults: { variant: "501", random: true } },
  { id: "cricket", group: "Match", name: "Cricket", blurb: "Close 15 to 20 and bull. Cut-throat and Tactics sit on the same game.", players: { min: 1, max: 4, teams: true }, defaults: { cutThroat: false, tactics: false, legsMode: "single", legs: "2" } },
  { id: "tournament", group: "Tournament", name: "X01 tournament", blurb: "A local single-elimination bracket. Byes do not invent averages.", players: { min: 2, max: 32, teams: true, entrants: true }, defaults: { start: "501", inRule: "straight", outRule: "double", seeding: "random", third: false, legsMode: "single", legs: "1", semiMode: "single", semiLegs: "1", finalMode: "single", finalLegs: "1" } },
  { id: "english", group: "English Cricket", name: "English Cricket", blurb: "Wickets and runs. Two sides, bat and bowl, one or two innings.", players: { min: 2, max: 2, teams: true, english: true }, defaults: { wickets: "10", inningsEach: "1", battingFirst: "0" } },
  { id: "score", group: "Training", name: "Score training", blurb: "Count up for a set number of visits. Nothing busts.", players: { min: 1, max: 4, teams: true }, defaults: { visits: "10" } },
  { id: "singles", group: "Training", name: "Singles training", blurb: "Three darts at each number, then bull. Points are training points.", players: { min: 1, max: 4, teams: false }, defaults: {} },
  { id: "doubles", group: "Training", name: "Doubles training", blurb: "Stay on a double until you hit it. That hit ends the turn.", players: { min: 1, max: 4, teams: false }, defaults: { bull: true } },
  { id: "random", group: "Training", name: "Random checkout", blurb: "Draw a finish and take it out. Three-dart doubles skip the bogeys.", players: { min: 1, max: 4, teams: false }, defaults: { budget: "3", outRule: "double", rounds: "8", preset: "random", shared: true } },
  { id: "clock", group: "Training", name: "Around the clock", blurb: "Hit 1, then 2, and onwards. A hit moves the target straight away.", players: { min: 1, max: 4, teams: false }, defaults: { filter: "any", bull: "off", skip: false, equalTurn: false, descending: false } },
  { id: "ladder", group: "Training", name: "121", blurb: "Check out 121 in nine darts, then climb. Three-dart finishes are the safehouse.", players: { min: 1, max: 4, teams: false }, defaults: { attempts: "8" } },
  { id: "halve", group: "Party", name: "Halve-It", blurb: "Nine rounds from 15 to bull. Miss the round and the total is halved.", players: { min: 1, max: 4, teams: true }, defaults: {} },
  { id: "shanghai", group: "Party", name: "Shanghai", blurb: "Only the round number scores. Single, double and treble wins at once.", players: { min: 1, max: 4, teams: true }, defaults: { length: "7", requireNumber: false, requireTreble: false } },
  { id: "killer", group: "Party", name: "Killer", blurb: "Own double makes you a killer. An opponent’s double costs a life.", players: { min: 2, max: 4, teams: false }, defaults: { numbersText: "" } },
  { id: "higher", group: "Party", name: "Higher than 41", blurb: "Beat the upper bar or duck under the lower one. A miss puts you out.", players: { min: 2, max: 4, teams: false }, defaults: {} },
];

const GROUPS = ["Match", "Tournament", "English Cricket", "Training", "Party"];

const ui = {
  screen: "home",
  mode: null,
  draft: null,
  match: null,
  pending: [],
  mult: 1,
  typed: "",
  extras: {},
  input: "darts",
  modal: null,
  toast: "",
  holdBot: false,
  pace: "fast",
  timer: 0,
};

const app = document.querySelector("#app");
const liveRegion = document.querySelector("#live-region");

boot();

function boot() {
  ui.pace = localStorage.getItem(PREFIX + "pace") || "fast";
  const saved = read(PREFIX + "match");
  if (saved?.match) {
    ui.saved = saved;
  }
  app.addEventListener("click", onClick);
  app.addEventListener("input", onInput);
  app.addEventListener("change", onInput);
  window.addEventListener("keydown", onKey);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  render();
}

function onClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  try {
    run(action, button.dataset);
  } catch (error) {
    toast(error.message || "That did not work");
  }
}

function run(action, data) {
  if (action === "mode") openSetup(data.mode);
  if (action === "quick") quick(data.mode);
  if (action === "resume") resume();
  if (action === "home") askHome();
  if (action === "abandon") abandon();
  if (action === "close-modal") { ui.modal = null; render(); queueBot(); }
  if (action === "start") startMatch();
  if (action === "count") setCount(Number(data.dir));
  if (action === "bot") toggleBot(Number(data.index));
  if (action === "teams") { ui.draft.teams = !ui.draft.teams; fitPlayers(); render(); }
  if (action === "toggle") { ui.draft[data.id] = !ui.draft[data.id]; render(); }
  if (action === "input") { ui.input = data.mode; render(); }
  if (action === "mult") { ui.mult = Number(data.value); render(); }
  if (action === "number") addPending({ type: "number", multiplier: ui.mult, value: Number(data.value) });
  if (action === "face") addPending(data.face === "outer" ? { type: "outer" } : data.face === "inner" ? { type: "inner" } : { type: "miss" });
  if (action === "segment") addPending(segmentFrom(data));
  if (action === "undo") doUndo();
  if (action === "confirm-darts") confirmDarts();
  if (action === "digit") typeDigit(data.value);
  if (action === "backspace") { ui.typed = ui.typed.slice(0, -1); render(); }
  if (action === "clear-typed") { ui.typed = ""; render(); }
  if (action === "common") { ui.typed = data.value; render(); }
  if (action === "extra-step") stepExtra(data.id, Number(data.dir), data.target);
  if (action === "extra-toggle") { ui.extras[data.id] = !ui.extras[data.id]; render(); }
  if (action === "commit-typed") commitTyped(false, false);
  if (action === "miss-typed") commitTyped(true, false);
  if (action === "bust-typed") commitTyped(false, true);
  if (action === "game-action") gameAction(data.id);
  if (action === "bot-go") { ui.holdBot = false; queueBot(); }
  if (action === "pace") { ui.pace = ui.pace === "fast" ? "real" : "fast"; localStorage.setItem(PREFIX + "pace", ui.pace); render(); }
  if (action === "rematch") rematch();
  if (action === "setup-return") { ui.screen = "setup"; ui.match = null; render(); }
}

function onInput(event) {
  const input = event.target;
  if (input.dataset.player != null) {
    ui.draft.players[Number(input.dataset.player)].name = input.value;
    return;
  }
  if (input.dataset.level != null) {
    ui.draft.players[Number(input.dataset.level)].level = input.value;
    return;
  }
  if (input.dataset.team != null) {
    ui.draft.teamNames[Number(input.dataset.team)] = input.value;
    return;
  }
  if (input.dataset.field) {
    ui.draft[input.dataset.field] = input.value;
    if (input.dataset.render === "yes") render();
  }
  if (input.dataset.extra) {
    ui.extras[input.dataset.extra] = input.value;
    render();
  }
}

function onKey(event) {
  if (ui.screen !== "live" || ui.input !== "total") return;
  if (event.key >= "0" && event.key <= "9") { typeDigit(event.key); event.preventDefault(); }
  if (event.key === "Backspace") { ui.typed = ui.typed.slice(0, -1); render(); }
  if (event.key === "Enter") commitTyped(false, false);
}

function openSetup(mode) {
  ui.mode = mode;
  ui.draft = loadDraft(mode);
  fitPlayers();
  ui.screen = "setup";
  render();
}

function quick(mode) {
  ui.mode = mode;
  ui.draft = loadDraft(mode);
  fitPlayers();
  try {
    startMatch();
  } catch (error) {
    ui.screen = "setup";
    toast(error.message);
  }
}

function startMatch() {
  const config = configFrom(ui.mode, ui.draft);
  ui.match = create(ui.mode, config);
  ui.pending = [];
  ui.typed = "";
  ui.extras = {};
  ui.holdBot = false;
  ui.screen = "live";
  rememberNames(config);
  write(PREFIX + "settings." + ui.mode, { ...ui.draft, input: ui.input });
  saveMatch();
  wake();
  render();
  queueBot();
}

function configFrom(mode, draft) {
  const count = draft.teams && mode !== "tournament" ? (mode === "english" ? 4 : 4) : draft.count;
  const players = draft.players.slice(0, mode === "tournament" && draft.teams ? draft.count * 2 : count).map((player) => ({
    name: player.name,
    bot: player.bot ? Number(player.level) : null,
  }));
  const config = {
    rngSeed: Math.floor(Math.random() * 1_000_000_000) + 1,
    players,
    teams: !!draft.teams && mode !== "winner" && mode !== "clock",
    teamNames: draft.teamNames,
  };
  for (const [key, value] of Object.entries(draft)) {
    if (["players", "count", "teams", "teamNames"].includes(key)) continue;
    config[key] = cast(key, value);
  }
  if (mode === "x01") {
    config.start = draft.start === "custom" ? Number(draft.customStart) : Number(draft.start);
    config.legs = Number(draft.legs);
    config.sets = Number(draft.sets);
    config.setLegs = Number(draft.setLegs);
    config.starter = draft.starter === "random" ? "random" : Number(draft.starter);
    config.bullOff = !!draft.bullOff;
    config.alternate = draft.alternate !== false;
  }
  if (mode === "cricket") config.legs = Number(draft.legs);
  if (mode === "score") config.visits = Number(draft.visits);
  if (mode === "ladder") config.attempts = Number(draft.attempts);
  if (mode === "random") {
    config.budget = Number(draft.budget);
    config.rounds = Number(draft.rounds);
    config.shared = draft.preset === "bracket" ? false : !!draft.shared;
  }
  if (mode === "shanghai") config.length = Number(draft.length);
  if (mode === "english") {
    config.wickets = Number(draft.wickets);
    config.inningsEach = Number(draft.inningsEach);
    config.battingFirst = Number(draft.battingFirst);
    config.teams = !!draft.teams;
  }
  if (mode === "tournament") {
    config.start = Number(draft.start);
    config.seeding = draft.seeding;
    config.third = !!draft.third;
    config.teams = !!draft.teams;
    config.early = { legsMode: draft.legsMode, legs: Number(draft.legs), setsMode: "off" };
    config.semi = { legsMode: draft.semiMode, legs: Number(draft.semiLegs), setsMode: "off" };
    config.final = { legsMode: draft.finalMode, legs: Number(draft.finalLegs), setsMode: "off" };
    if (draft.teams) {
      config.entrants = [];
      for (let index = 0; index < draft.count; index += 1) {
        config.entrants.push({
          name: draft.teamNames[index] || "",
          players: [players[index * 2], players[index * 2 + 1]],
        });
      }
    }
  }
  if (mode === "killer" && String(draft.numbersText || "").trim()) {
    config.numbers = String(draft.numbersText).split(/[^0-9]+/).map(Number).filter((number) => number >= 1 && number <= 20);
  }
  if (mode === "winner") config.random = draft.random !== false;
  return config;
}

function cast(key, value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

function resume() {
  if (!ui.saved?.match) return;
  ui.match = ui.saved.match;
  ui.mode = ui.saved.mode;
  ui.input = ui.saved.input || loadDraft(ui.mode).input || "darts";
  ui.pending = [];
  ui.screen = "live";
  ui.holdBot = false;
  wake();
  render();
  queueBot();
}

function askHome() {
  clearTimeout(ui.timer);
  if (!ui.match) { ui.screen = "home"; render(); return; }
  const view = project(ui.match);
  if (view.phase === "done") { ui.screen = "home"; render(); return; }
  ui.modal = "abandon";
  render();
}

function abandon() {
  clearTimeout(ui.timer);
  localStorage.removeItem(PREFIX + "match");
  ui.saved = null;
  ui.match = null;
  ui.modal = null;
  ui.screen = "home";
  render();
}

function rematch() {
  ui.screen = "setup";
  ui.match = null;
  render();
}

function gameAction(id) {
  clearTimeout(ui.timer);
  ui.match = act(ui.match, id);
  ui.pending = [];
  ui.holdBot = false;
  saveMatch();
  render();
  queueBot();
}

function addPending(dart) {
  const view = project(ui.match);
  if (!view.canThrow) return;
  if (ui.pending.length >= 3) return;
  ui.pending.push(dart);
  render();
}

function confirmDarts() {
  if (!ui.pending.length) return;
  ui.match = addDarts(ui.match, ui.pending);
  ui.pending = [];
  ui.holdBot = false;
  afterCommit();
}

function commitTyped(miss, bust) {
  const view = project(ui.match);
  const form = schema(ui.match, { ...ui.extras, total: ui.typed });
  const payload = {
    ...ui.extras,
    total: ui.typed === "" ? 0 : Number(ui.typed),
    miss,
    bust,
    finish: finishDart(form, ui.extras.finish),
    marks: ui.extras.marks || {},
    killer: [ui.extras.killer0, ui.extras.killer1, ui.extras.killer2],
    wickets: Number(ui.extras.wickets || 0),
    advanced: Number(ui.extras.advanced || 0),
    dartsUsed: Number(ui.extras.dartsUsed || 3),
    hits: ui.extras.hits,
    hit: !!ui.extras.hit,
    dartNumber: Number(ui.extras.dartNumber || ui.extras.dartsUsed || 1),
    shanghai: !!ui.extras.shanghai,
    didOpen: !!ui.extras.didOpen,
    doubles: ui.extras.doubles || "na",
  };
  if (!view.canType) throw new Error("A total cannot be entered now");
  ui.match = addTyped(ui.match, payload);
  ui.typed = "";
  ui.extras = {};
  ui.pending = [];
  ui.holdBot = false;
  afterCommit();
}

function finishDart(form, id) {
  for (const field of form.fields || []) {
    if (field.id !== "finish" || !field.options) continue;
    return field.options.find((option) => option.id === id)?.dart || null;
  }
  return null;
}

function afterCommit() {
  saveMatch();
  render();
  queueBot();
}

function doUndo() {
  clearTimeout(ui.timer);
  if (ui.pending.length) {
    ui.pending.pop();
    render();
    return;
  }
  if (!ui.match || !project(ui.match).canUndo) return;
  ui.match = undo(ui.match);
  let view = project(ui.match);
  let guard = 0;
  while (view.dartsThisVisit > 0 && view.canUndo && guard < 3) {
    ui.match = undo(ui.match);
    view = project(ui.match);
    guard += 1;
  }
  if (view.botTurn && view.canUndo) {
    ui.match = undo(ui.match);
    view = project(ui.match);
    guard = 0;
    while (view.dartsThisVisit > 0 && view.canUndo && guard < 3) {
      ui.match = undo(ui.match);
      view = project(ui.match);
      guard += 1;
    }
  }
  ui.holdBot = true;
  ui.pending = [];
  saveMatch();
  render();
}

function queueBot() {
  clearTimeout(ui.timer);
  if (!ui.match || ui.holdBot || ui.screen !== "live") return;
  const view = project(ui.match);
  if (!view.botTurn || !view.canThrow) return;
  ui.timer = setTimeout(() => {
    try {
      ui.match = botThrow(ui.match);
      saveMatch();
      render();
      queueBot();
    } catch (error) {
      toast(error.message);
    }
  }, ui.pace === "real" ? 700 : 90);
}

function stepExtra(id, dir, target) {
  if (target) {
    ui.extras.marks = ui.extras.marks || {};
    const next = Math.max(0, Math.min(9, Number(ui.extras.marks[target] || 0) + dir));
    ui.extras.marks[target] = next;
  } else {
    const current = Number(ui.extras[id] || 0);
    ui.extras[id] = Math.max(0, current + dir);
  }
  render();
}

function typeDigit(digit) {
  if (ui.typed.length >= 3) return;
  ui.typed = String(Number(ui.typed + digit));
  render();
}

function setCount(dir) {
  const meta = metaOf(ui.mode);
  const next = ui.draft.count + dir;
  const max = ui.draft.teams && ui.mode === "tournament" ? 16 : meta.players.max;
  if (next < meta.players.min || next > max) return;
  ui.draft.count = next;
  fitPlayers();
  render();
}

function fitPlayers() {
  const meta = metaOf(ui.mode);
  const needed = ui.draft.teams && ui.mode === "tournament"
    ? ui.draft.count * 2
    : ui.draft.teams ? 4 : ui.draft.count;
  while (ui.draft.players.length < needed) {
    ui.draft.players.push({ name: `Player ${ui.draft.players.length + 1}`, bot: false, level: "8" });
  }
  if (ui.mode === "english") ui.draft.count = ui.draft.teams ? 4 : 2;
  void meta;
}

function toggleBot(index) {
  ui.draft.players[index].bot = !ui.draft.players[index].bot;
  render();
}

function loadDraft(mode) {
  const meta = metaOf(mode);
  const saved = read(PREFIX + "settings." + mode) || {};
  const count = saved.count || meta.players.min;
  const players = saved.players || Array.from({ length: Math.max(count, 4) }, (_, index) => ({ name: `Player ${index + 1}`, bot: false, level: "8" }));
  ui.input = saved.input || "darts";
  return {
    ...meta.defaults,
    count,
    teams: !!saved.teams,
    teamNames: saved.teamNames || ["", ""],
    players,
    customStart: saved.customStart || "401",
    ...saved,
    players,
  };
}

function metaOf(id) {
  return CATALOGUE.find((mode) => mode.id === id);
}

function render() {
  const body = ui.screen === "home" ? renderHome()
    : ui.screen === "setup" ? renderSetup()
      : renderMatch();
  app.innerHTML = body + (ui.modal ? renderModal() : "") + (ui.toast ? `<p class="toast" role="status">${esc(ui.toast)}</p>` : "");
  if (ui.toast) {
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => { ui.toast = ""; const node = app.querySelector(".toast"); if (node) node.remove(); }, 2400);
  }
  const view = ui.match && ui.screen === "live" ? project(ui.match) : null;
  if (view && liveRegion) liveRegion.textContent = `${view.subhead || ""} ${view.headline || ""} ${view.headlineLabel || ""}`;
}

function renderHome() {
  const saved = ui.saved;
  return `<section class="screen screen-home">
    ${topbar("The Snake", "501")}
    <div class="home-scroll">
      <figure class="hero"><img src="./icons/home-art.jpg" alt="Jake the Snake cobra and wordmark"></figure>
      ${saved ? `<div class="resume"><div><strong>Match in progress</strong><p class="muted">${esc(metaOf(saved.mode)?.name || "Game")}</p></div><button class="primary" data-action="resume">Resume</button></div>` : ""}
      ${GROUPS.map((group) => `<section class="group"><h2>${esc(group)}</h2><div class="tiles">${CATALOGUE.filter((mode) => mode.group === group).map((mode) => `<article class="tile-row"><button class="tile" data-action="mode" data-mode="${mode.id}"><strong>${esc(mode.name)}</strong><span>${esc(mode.blurb)}</span></button><button class="tiny quick" data-action="quick" data-mode="${mode.id}">Quick play</button></article>`).join("")}</div></section>`).join("")}
    </div>
  </section>`;
}

function renderSetup() {
  const meta = metaOf(ui.mode);
  const roster = read(PREFIX + "roster") || [];
  const needed = ui.draft.teams && ui.mode === "tournament" ? ui.draft.count * 2 : ui.draft.teams ? 4 : ui.draft.count;
  const summary = safeRules();
  return `<section class="screen screen-setup">
    ${topbar(meta.name, "Setup")}
    <div class="setup-scroll">
      <section class="setup-block">
        <h2>Players</h2>
        <div class="row">
          ${meta.players.teams ? `<button class="choice ${ui.draft.teams ? "on" : ""}" data-action="teams">${ui.mode === "english" ? "Teams of two" : ui.mode === "tournament" ? "Team entrants" : "2v2 teams"}</button>` : ""}
          <button class="ghost" data-action="count" data-dir="-1">Fewer</button>
          <strong>${ui.draft.teams && ui.mode === "tournament" ? `${ui.draft.count} teams` : `${needed} players`}</strong>
          <button class="ghost" data-action="count" data-dir="1">More</button>
        </div>
        ${ui.draft.teams && ui.mode !== "tournament" ? `<div class="row">${[0, 1].map((index) => `<input class="texty" data-team="${index}" maxlength="24" placeholder="Team ${index + 1}" value="${esc(ui.draft.teamNames[index] || "")}">`).join("")}</div>` : ""}
        <div class="setup-grid">${ui.draft.players.slice(0, needed).map((player, index) => `<div class="player-card">
          <input class="texty" list="roster" data-player="${index}" maxlength="24" value="${esc(player.name)}" aria-label="Player ${index + 1}">
          <div class="row">
            <button class="choice ${player.bot ? "on" : ""}" data-action="bot" data-index="${index}">${player.bot ? "Bot" : "Human"}</button>
            ${player.bot ? `<select data-level="${index}" aria-label="Bot level">${levels(player.level)}</select>` : ""}
          </div>
        </div>`).join("")}</div>
        <datalist id="roster">${roster.map((name) => `<option value="${esc(name)}"></option>`).join("")}</datalist>
      </section>
      ${fieldsFor(meta)}
      <p class="summary">${esc(summary)}</p>
      <button class="primary" data-action="start">Start</button>
    </div>
  </section>`;
}

function fieldsFor(meta) {
  const blocks = {
    x01: [
      select("start", "Start", [["301", "301"], ["501", "501"], ["701", "701"], ["901", "901"], ["1001", "1001"], ["custom", "Custom 01"]]),
      ui.draft.start === "custom" ? `<label class="field">Custom 01<input class="texty" data-field="customStart" inputmode="numeric" value="${esc(ui.draft.customStart || "")}"></label>` : "",
      select("inRule", "In", [["straight", "Straight in"], ["double", "Double in"], ["master", "Master in"]]),
      select("outRule", "Out", [["straight", "Straight out"], ["double", "Double out"], ["master", "Master out"]]),
      select("legsMode", "Legs", [["single", "Single leg"], ["first", "First to"], ["best", "Best of"]]),
      ui.draft.legsMode === "single" ? "" : select("legs", "Leg target", nums(ui.draft.legsMode === "best" ? [3, 5, 7, 9, 11] : [2, 3, 4, 5, 6, 7])),
      select("setsMode", "Sets", [["off", "No sets"], ["first", "First to"], ["best", "Best of"]]),
      ui.draft.setsMode === "off" ? "" : select("sets", "Set target", nums(ui.draft.setsMode === "best" ? [3, 5] : [2, 3, 4])),
      ui.draft.setsMode === "off" ? "" : select("setLegsMode", "Legs in a set", [["first", "First to"], ["best", "Best of"]]),
      ui.draft.setsMode === "off" ? "" : select("setLegs", "Legs per set", nums([2, 3, 4, 5])),
      toggle("bullOff", "Bull-off for the start"),
      toggle("alternate", "Alternate the starter each leg"),
      select("starter", "Who starts", [["0", "Player 1"], ["1", "Player 2"], ["2", "Player 3"], ["3", "Player 4"], ["random", "Random"]]),
    ],
    winner: [select("variant", "Format", [["501", "501, straight in, double out"], ["301", "301, double in, double out"]]), toggle("random", "Draw the order at random")],
    cricket: [toggle("cutThroat", "Cut-throat"), toggle("tactics", "Tactics, 10 to 20"), select("legsMode", "Legs", [["single", "Single leg"], ["first", "First to"]]), ui.draft.legsMode === "first" ? select("legs", "First to", nums([2, 3, 4, 5])) : ""],
    tournament: [
      select("start", "Start", [["301", "301"], ["501", "501"], ["701", "701"]]),
      select("inRule", "In", [["straight", "Straight"], ["double", "Double"], ["master", "Master"]]),
      select("outRule", "Out", [["double", "Double"], ["straight", "Straight"], ["master", "Master"]]),
      select("seeding", "Seeding", [["random", "Random"], ["manual", "As listed"]]),
      toggle("third", "Third-place play-off"),
      select("legsMode", "Early rounds", [["single", "Single leg"], ["first", "First to"], ["best", "Best of"]]),
      select("legs", "Early length", nums([1, 2, 3, 5])),
      select("semiMode", "Semi-final", [["single", "Single leg"], ["first", "First to"], ["best", "Best of"]]),
      select("semiLegs", "Semi length", nums([1, 2, 3, 5])),
      select("finalMode", "Final", [["single", "Single leg"], ["first", "First to"], ["best", "Best of"]]),
      select("finalLegs", "Final length", nums([1, 2, 3, 5])),
    ],
    english: [select("wickets", "Wickets", [["10", "10 wickets"], ["11", "11 wickets"]]), select("inningsEach", "Innings each", [["1", "One innings"], ["2", "Two innings"]]), select("battingFirst", "Bats first", [["0", "Side 1"], ["1", "Side 2"]])],
    score: [select("visits", "Visits", nums([5, 8, 10, 12, 20]))],
    doubles: [toggle("bull", "Finish on the inner bull")],
    random: [select("preset", "Preset", [["random", "Random finishes"], ["bracket", "Bracket points"]]), select("budget", "Darts allowed", [["3", "3"], ["6", "6"], ["9", "9"]]), select("outRule", "Out", [["double", "Double"], ["straight", "Straight"], ["master", "Master"]]), select("rounds", "Rounds", nums([5, 8, 10, 12])), toggle("shared", "Same target for the round")],
    clock: [select("filter", "Segments", [["any", "Any segment"], ["single", "Singles only"], ["double", "Doubles only"], ["treble", "Trebles only"]]), select("bull", "Bull", [["off", "No bull"], ["either", "Either bull"], ["inner", "Inner bull"]]), toggle("skip", "Multiplier skip"), toggle("equalTurn", "Equal turns"), toggle("descending", "Descending")],
    ladder: [select("attempts", "Attempts each", nums([4, 8, 10, 12]))],
    shanghai: [select("length", "Rounds", [["7", "1 to 7"], ["20", "1 to 20"]]), toggle("requireNumber", "Halve a complete miss"), toggle("requireTreble", "Reset if no treble")],
    killer: [`<label class="field">Numbers, optional<input class="texty" data-field="numbersText" placeholder="Leave blank to deal them" value="${esc(ui.draft.numbersText || "")}"></label>`],
  };
  const html = (blocks[meta.id] || []).filter(Boolean).join("");
  return html ? `<section class="setup-block"><h2>Rules</h2><div class="setup-grid">${html}</div></section>` : "";
}

function select(id, label, options) {
  return `<label class="field">${esc(label)}<select data-field="${id}" data-render="yes">${options.map(([value, text]) => `<option value="${esc(value)}" ${String(ui.draft[id]) === String(value) ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`;
}

function toggle(id, label) {
  return `<button type="button" class="choice ${ui.draft[id] ? "on" : ""}" data-action="toggle" data-id="${id}">${esc(label)}</button>`;
}

function nums(list) {
  return list.map((value) => [String(value), String(value)]);
}

function levels(current) {
  return Array.from({ length: 15 }, (_, index) => `<option value="${index + 1}" ${String(current) === String(index + 1) ? "selected" : ""}>Level ${index + 1}</option>`).join("");
}

function renderMatch() {
  const view = project(ui.match);
  if (view.phase === "confirm") return renderConfirm(view);
  if (view.phase === "done") return renderResult(view);
  return renderLive(view);
}

function renderConfirm(view) {
  const rounds = view.raw.rounds || [];
  return `<section class="screen screen-confirm">
    ${topbar("Draw", view.kicker)}
    <div class="setup-scroll">
      <div class="banner"><h2>${esc(view.banner?.title || "Draw")}</h2><p>${esc(view.banner?.body || "")}</p></div>
      ${rounds.map((round) => `<section><h2>${esc(round.name)}</h2>${round.matches.map((match) => `<p class="stat-line"><span>${match.bye ? "Bye" : `${nameOf(match.a)} v ${nameOf(match.b)}`}</span><span>${match.bye ? esc(nameOf(match.winner)) : "To play"}</span></p>`).join("")}</section>`).join("")}
      <div class="row">${(view.actions || []).map((action) => `<button class="${action.tone === "primary" ? "primary" : "ghost"}" data-action="game-action" data-id="${action.id}">${esc(action.label)}</button>`).join("")}</div>
    </div>
  </section>`;
}

function nameOf(index) {
  return ui.match?.entrants?.[index]?.name || "—";
}

function renderLive(view) {
  const form = prepareForm(view);
  return `<section class="screen screen-live">
    ${topbar(view.title, view.kicker)}
    <div class="score-strip">${view.players.map((player) => `<article class="score-card ${player.active ? "active" : ""} ${player.out ? "out" : ""}" style="--swatch:${esc(player.swatch)}"><div class="name">${esc(player.name)}</div><div class="primary-score">${esc(player.primary)}</div><div class="muted">${esc(player.secondary || "")}</div>${player.detail ? `<div class="muted">${esc(player.detail)}</div>` : ""}</article>`).join("")}</div>
    <div class="live-main">
      <p class="muted">${esc(view.headlineLabel || "")}</p>
      <p class="headline">${esc(view.headline || "")}</p>
      <p class="subhead">${esc(view.subhead || "")}</p>
      ${view.note ? `<p class="muted">${esc(view.note)}</p>` : ""}
      <div class="darts-row">${[0, 1, 2].map((index) => view.darts[index] ? `<span class="dart-chip">${esc(view.darts[index].label)}</span>` : `<span class="dart-empty">${index + 1}</span>`).join("")}</div>
      ${ui.pending.length ? `<p class="muted">Pending ${ui.pending.map((dart) => dartLabel(dart)).join(" ")}</p>` : ""}
      <div class="suggestions">${(view.suggestions || []).map((item) => `<span class="chip">${esc(item.text)}</span>`).join("")}</div>
      ${view.banner ? `<div class="banner"><h2>${esc(view.banner.title)}</h2><p>${esc(view.banner.body || "")}</p></div>` : ""}
      <div class="row">${(view.actions || []).map((action) => `<button class="${action.tone === "primary" ? "primary" : "ghost"}" data-action="game-action" data-id="${action.id}">${esc(action.label)}</button>`).join("")}
        ${view.botTurn && ui.holdBot ? `<button class="primary" data-action="bot-go">Let the bot throw</button>` : ""}
      </div>
    </div>
    <div class="pad">
      <div class="switcher">
        ${["darts", "total", "board"].map((mode) => `<button class="choice ${ui.input === mode ? "on" : ""}" data-action="input" data-mode="${mode}">${mode === "darts" ? "Darts" : mode === "total" ? "Total" : "Board"}</button>`).join("")}
        <button class="tiny" data-action="pace">${ui.pace === "fast" ? "Fast bots" : "Slower bots"}</button>
        <button class="tiny" data-action="undo">Undo</button>
      </div>
      ${ui.input === "total" ? renderTotal(view, form) : ui.input === "board" ? renderBoard(view) : renderDarts(view)}
    </div>
  </section>`;
}

function renderDarts(view) {
  if (!view.canThrow) return `<p class="muted">Waiting for the next step.</p>`;
  return `<div class="mults">${[1, 2, 3].map((mult) => `<button class="mult ${ui.mult === mult ? "on" : ""}" data-action="mult" data-value="${mult}">${["Single", "Double", "Treble"][mult - 1]}</button>`).join("")}</div>
    <div class="nums">${Array.from({ length: 20 }, (_, index) => `<button class="num" data-action="number" data-value="${index + 1}">${index + 1}</button>`).join("")}</div>
    <div class="row"><button class="ghost" data-action="face" data-face="outer">25</button><button class="ghost" data-action="face" data-face="inner">Bull</button><button class="ghost" data-action="face" data-face="miss">Miss</button><button class="primary" data-action="confirm-darts">Enter</button></div>`;
}

function prepareForm(view) {
  if (!view.canType) return { fields: [] };
  let form = schema(ui.match, { ...ui.extras, total: ui.typed });
  let changed = false;
  for (const field of form.fields || []) {
    if (field.type === "step" && ui.extras[field.id] == null) {
      ui.extras[field.id] = field.id === "dartsUsed" ? 3 : (field.min ?? 0);
      changed = true;
    }
    if (field.type === "select" && (ui.extras[field.id] == null || ui.extras[field.id] === "") && field.options?.[0]) {
      ui.extras[field.id] = field.options[0].id;
      changed = true;
    }
  }
  if (changed) form = schema(ui.match, { ...ui.extras, total: ui.typed });
  return form;
}

function renderTotal(view, form) {
  if (!view.canType) return `<p class="muted">${view.note || "This turn stays dart by dart."}</p>${renderDarts(view)}`;
  const showPad = form.placeholder || form.common || form.miss || form.bust;
  return `${showPad ? `<p class="headline" style="font-size:clamp(2rem,7svh,3.4rem)">${esc(ui.typed || "0")}</p>
    <div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => `<button class="key" data-action="digit" data-value="${digit}">${digit}</button>`).join("")}
      <button class="key" data-action="clear-typed">C</button><button class="key" data-action="digit" data-value="0">0</button><button class="key" data-action="backspace">⌫</button></div>
    ${form.common ? `<div class="suggestions">${COMMON.map((score) => `<button class="chip" data-action="common" data-value="${score}">${score}</button>`).join("")}</div>` : ""}` : ""}
    ${renderFields(form)}
    <div class="row">
      <button class="primary" data-action="commit-typed">Enter</button>
      ${form.miss ? `<button class="ghost" data-action="miss-typed">Miss</button>` : ""}
      ${form.bust ? `<button class="danger" data-action="bust-typed">Bust</button>` : ""}
    </div>`;
}

function renderFields(form) {
  return (form.fields || []).map((field) => {
    if (field.type === "note") return `<p class="muted">${esc(field.label)}</p>`;
    if (field.type === "toggle") return `<button class="choice ${ui.extras[field.id] ? "on" : ""}" data-action="extra-toggle" data-id="${field.id}">${esc(field.label)}</button>`;
    if (field.type === "step") return `<div class="extra-row"><span>${esc(field.label)}</span><button class="tiny" data-action="extra-step" data-id="${field.id}" data-dir="-1">−</button><strong>${esc(ui.extras[field.id] ?? field.min ?? 0)}</strong><button class="tiny" data-action="extra-step" data-id="${field.id}" data-dir="1">+</button></div>`;
    if (field.type === "select") return `<label class="field">${esc(field.label)}<select data-extra="${field.id}">${(field.options || []).map((option) => `<option value="${esc(option.id)}" ${String(ui.extras[field.id] || "") === String(option.id) ? "selected" : ""}>${esc(option.label)}</option>`).join("")}</select></label>`;
    if (field.type === "marks") return `<div class="setup-grid">${field.targets.map((target) => `<div class="extra-row"><span>${target === "bull" ? "Bull" : target}</span><button class="tiny" data-action="extra-step" data-id="marks" data-target="${target}" data-dir="-1">−</button><strong>${Number(ui.extras.marks?.[target] || 0)}</strong><button class="tiny" data-action="extra-step" data-id="marks" data-target="${target}" data-dir="1">+</button></div>`).join("")}</div>`;
    return "";
  }).join("");
}

function renderBoard(view) {
  if (!view.canThrow) return `<p class="muted">The board is waiting.</p>`;
  const wedges = BOARD.map((value, index) => ["double", "outer", "treble", "inner"].map((ring) => {
    const radii = { double: [0.86, 1], outer: [0.54, 0.86], treble: [0.42, 0.54], inner: [0.18, 0.42] }[ring];
    const mult = ring === "double" ? 2 : ring === "treble" ? 3 : 1;
    const light = index % 2 === 0;
    const fill = ring === "outer" || ring === "inner" ? (light ? "#e8eef5" : "#151922") : (light ? "#1a9be0" : "#1c4384");
    return `<path fill="${fill}" data-action="segment" data-mult="${mult}" data-value="${value}" d="${wedge(index, radii[0], radii[1])}"></path>`;
  }).join("")).join("");
  const labels = BOARD.map((value, index) => {
    const angle = ((index * 18 - 90) * Math.PI) / 180;
    const x = Math.cos(angle) * 1.12;
    const y = Math.sin(angle) * 1.12;
    return `<text x="${x}" y="${y}" fill="#f4f7fb" font-size="0.11" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">${value}</text>`;
  }).join("");
  return `<div class="board-wrap"><svg viewBox="-1.28 -1.28 2.56 2.56" role="img" aria-label="Dartboard">${wedges}
      <circle cx="0" cy="0" r="0.18" fill="#2e9bdb" data-action="face" data-face="outer"></circle>
      <circle cx="0" cy="0" r="0.08" fill="#f4f7fb" data-action="face" data-face="inner"></circle>
      ${labels}</svg>
    <div class="row" style="flex-direction:column">${renderDarts(view)}</div></div>`;
}

function wedge(index, inner, outer) {
  const start = ((index * 18 - 9 - 90) * Math.PI) / 180;
  const end = (((index + 1) * 18 - 9 - 90) * Math.PI) / 180;
  const point = (angle, radius) => [Math.cos(angle) * radius, Math.sin(angle) * radius];
  const [x0, y0] = point(start, outer);
  const [x1, y1] = point(end, outer);
  const [x2, y2] = point(end, inner);
  const [x3, y3] = point(start, inner);
  return `M ${x0} ${y0} A ${outer} ${outer} 0 0 1 ${x1} ${y1} L ${x2} ${y2} A ${inner} ${inner} 0 0 0 ${x3} ${y3} Z`;
}

function segmentFrom(data) {
  return { type: "number", multiplier: Number(data.mult), value: Number(data.value) };
}

function renderResult(view) {
  const end = view.end || { title: "Finished", subtitle: "", rows: [], players: [] };
  return `<section class="screen screen-result">
    ${topbar(view.title || "Result", end.subtitle || "")}
    <div class="result-scroll">
      <h2 class="headline" style="font-size:clamp(2rem,6svh,3.2rem)">${esc(end.title || "Finished")}</h2>
      ${(end.rows || []).map((row) => statLine(row)).join("")}
      <div class="end-grid">${(end.players || []).map((player) => `<article class="stat-card"><h2>${esc(player.name)}</h2>${(player.rows || []).map((row) => statLine(row)).join("")}${(player.members || []).map((member) => `<h3>${esc(member.name)}</h3>${member.rows.map((row) => statLine(row)).join("")}`).join("")}</article>`).join("")}</div>
      <div class="row"><button class="primary" data-action="rematch">Change players</button><button class="ghost" data-action="setup-return">Same setup</button><button class="ghost" data-action="home">Modes</button></div>
    </div>
  </section>`;
}

function statLine(row) {
  return `<p class="stat-line"><span>${esc(row.label)}</span><strong>${esc(row.value)}</strong></p>`;
}

function renderModal() {
  return `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true"><h2>Leave this match?</h2><p>The score stays on this tablet until you abandon it.</p><div class="row"><button class="danger" data-action="abandon">Abandon</button><button class="primary" data-action="close-modal">Keep playing</button></div></div></div>`;
}

function topbar(title, sub) {
  return `<header class="topbar"><img class="brand-mark" src="./icons/icon-192.png" alt=""><div><p class="wordmark">${esc(title)}<span>${esc(sub || "501")}</span></p></div><div class="top-actions"><button class="ghost" data-action="home">Modes</button></div></header>`;
}

function safeRules() {
  try {
    return rulesText(ui.mode, configFrom(ui.mode, ui.draft));
  } catch (error) {
    return error.message;
  }
}

function dartLabel(dart) {
  if (dart.type === "miss") return "Miss";
  if (dart.type === "outer") return "25";
  if (dart.type === "inner") return "Bull";
  return `${dart.multiplier === 2 ? "D" : dart.multiplier === 3 ? "T" : "S"}${dart.value}`;
}

function rememberNames(config) {
  const names = [];
  const list = config.entrants ? config.entrants.flatMap((entrant) => entrant.players) : config.players || [];
  for (const player of list) if (player?.name) names.push(player.name);
  const prior = read(PREFIX + "roster") || [];
  write(PREFIX + "roster", [...new Set([...names, ...prior])].slice(0, 24));
}

function saveMatch() {
  const payload = { mode: ui.mode, match: ui.match, input: ui.input };
  write(PREFIX + "match", payload);
  ui.saved = payload;
}

function toast(message) {
  ui.toast = message;
  render();
}

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

async function wake() {
  try { ui.wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* the tablet may ignore this */ }
}
