/** Dart faces, labels, and which three-dart totals can exist. */

export const BOARD_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

export const PLAYER_COLOURS = ["#2E9BDB", "#F4F7FB", "#7EC8FF", "#8EA2FF"];

export function normaliseDart(input) {
  if (!input || typeof input !== "object") throw new Error("Missing dart");
  if (input.type === "miss" || input.type === "outer" || input.type === "inner") {
    return { type: input.type };
  }
  if (input.type === "number") {
    const multiplier = input.multiplier;
    const value = input.value;
    if (multiplier !== 1 && multiplier !== 2 && multiplier !== 3) {
      throw new Error("Multiplier must be single, double or treble");
    }
    if (!Number.isInteger(value) || value < 1 || value > 20) {
      throw new Error("Score must be from 1 to 20");
    }
    return { type: "number", multiplier, value };
  }
  throw new Error("Unknown dart");
}

export function isLegalDart(input) {
  try {
    normaliseDart(input);
    return true;
  } catch {
    return false;
  }
}

export function dartPoints(dart) {
  const clean = normaliseDart(dart);
  if (clean.type === "miss") return 0;
  if (clean.type === "outer") return 25;
  if (clean.type === "inner") return 50;
  return clean.multiplier * clean.value;
}

export function dartLabel(dart) {
  const clean = normaliseDart(dart);
  if (clean.type === "miss") return "Miss";
  if (clean.type === "outer") return "25";
  if (clean.type === "inner") return "Bull";
  const mark = clean.multiplier === 1 ? "S" : clean.multiplier === 2 ? "D" : "T";
  return `${mark}${clean.value}`;
}

export function isDouble(dart) {
  const clean = normaliseDart(dart);
  return clean.type === "inner" || (clean.type === "number" && clean.multiplier === 2);
}

export function isTreble(dart) {
  const clean = normaliseDart(dart);
  return clean.type === "number" && clean.multiplier === 3;
}

export function scoringFaces() {
  const faces = [{ type: "outer" }, { type: "inner" }];
  for (let value = 1; value <= 20; value += 1) {
    faces.push({ type: "number", multiplier: 1, value });
    faces.push({ type: "number", multiplier: 2, value });
    faces.push({ type: "number", multiplier: 3, value });
  }
  return faces;
}

export function adjacentNumbers(value) {
  const index = BOARD_ORDER.indexOf(value);
  if (index < 0) return [];
  return [BOARD_ORDER[(index + 1) % 20], BOARD_ORDER[(index + 19) % 20]];
}

const FACE_SCORES = [0, 25, 50];
for (let value = 1; value <= 20; value += 1) {
  FACE_SCORES.push(value, value * 2, value * 3);
}
const UNIQUE_SCORES = [...new Set(FACE_SCORES)];

const POSSIBLE_BY_DARTS = [null, null, null, null];
for (let darts = 1; darts <= 3; darts += 1) {
  let layer = new Set([0]);
  for (let step = 0; step < darts; step += 1) {
    const next = new Set();
    for (const total of layer) {
      for (const score of UNIQUE_SCORES) next.add(total + score);
    }
    layer = next;
  }
  POSSIBLE_BY_DARTS[darts] = layer;
}

/** True when `total` can be thrown with at most `darts` darts (misses allowed). */
export function isPossibleVisit(total, darts = 3) {
  if (!Number.isInteger(total) || total < 0) return false;
  const cap = darts < 1 ? 1 : darts > 3 ? 3 : darts;
  if (POSSIBLE_BY_DARTS[cap].has(total)) return true;
  if (cap < 3 && darts > cap) return POSSIBLE_BY_DARTS[3].has(total);
  return false;
}

export function clipName(value, fallback) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
  return text || fallback;
}
