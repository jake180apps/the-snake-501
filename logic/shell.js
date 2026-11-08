/** Default shape for every live scoreboard. */

export function shell(partial) {
  return {
    phase: "live",
    title: "",
    kicker: "",
    note: "",
    headline: "",
    headlineLabel: "",
    subhead: "",
    colour: "#2E9BDB",
    players: [],
    darts: [],
    dartsThisVisit: 0,
    lastText: "",
    suggestions: [],
    log: [],
    canThrow: false,
    canType: false,
    canUndo: false,
    botTurn: false,
    botLevel: null,
    actions: [],
    banner: null,
    end: null,
    rulesBrief: "",
    bot: null,
    raw: {},
    ...partial,
  };
}

export function playerCard(side, extra) {
  return {
    name: side.name,
    primary: "",
    secondary: "",
    active: false,
    out: false,
    swatch: side.swatch,
    detail: "",
    ...extra,
  };
}
