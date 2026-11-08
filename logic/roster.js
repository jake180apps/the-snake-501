import { clipName, PLAYER_COLOURS } from "./darts.js";

export function clampLevel(level) {
  const number = Number(level);
  if (!Number.isInteger(number) || number < 1 || number > 15) {
    throw new Error("Bot level must be from 1 to 15");
  }
  return number;
}

export function preparePlayers(list, { min, max }) {
  if (!Array.isArray(list) || list.length < min || list.length > max) {
    throw new Error(min === max ? `Choose ${min} players` : `Choose ${min} to ${max} players`);
  }
  const used = new Set();
  return list.map((player, index) => {
    let name = clipName(player?.name, `Player ${index + 1}`);
    const base = name;
    let extra = 2;
    while (used.has(name.toLowerCase())) {
      name = clipName(`${base} ${extra}`, `Player ${index + 1}`);
      extra += 1;
    }
    used.add(name.toLowerCase());
    const bot = player?.bot == null || player.bot === false || player.bot === "" ? null : clampLevel(player.bot);
    return { name, bot };
  });
}

export function makeSides(config, { min = 1, max = 4, allowTeams = true } = {}) {
  if (config?.teams) {
    if (!allowTeams) throw new Error("Teams are not used in this game");
    const players = preparePlayers(config.players, { min: 4, max: 4 });
    const left = clipName(config.teamNames?.[0], "");
    const right = clipName(config.teamNames?.[1], "");
    return [
      side(left || `${players[0].name} & ${players[1].name}`, [players[0], players[1]], 0),
      side(right || `${players[2].name} & ${players[3].name}`, [players[2], players[3]], 1),
    ];
  }
  const players = preparePlayers(config?.players, { min, max });
  return players.map((player, index) => side(player.name, [player], index));
}

function side(name, players, index) {
  return { name, players, swatch: PLAYER_COLOURS[index % PLAYER_COLOURS.length] };
}

export function memberOn(sideInfo, visitsFinished) {
  const list = sideInfo.players;
  return list[visitsFinished % list.length];
}
