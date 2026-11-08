/** Fifteen-level bot. Every dart is a real board segment. */

import { adjacentNumbers, normaliseDart } from "./darts.js";

const HIT = [0, 0.07, 0.11, 0.16, 0.22, 0.28, 0.34, 0.4, 0.47, 0.54, 0.61, 0.68, 0.75, 0.82, 0.88, 0.93];
const NEAR = [0, 0.2, 0.24, 0.28, 0.3, 0.32, 0.33, 0.32, 0.3, 0.26, 0.22, 0.18, 0.15, 0.12, 0.08, 0.05];

export function skillProfile(level) {
  const safe = Math.max(1, Math.min(15, level | 0));
  return { level: safe, hit: HIT[safe], near: NEAR[safe], miss: ((16 - safe) / 15) * 0.42 };
}

/** Independent stream for this step. The same seed and step always replay. */
export function makeRand(seed, step) {
  let value = (Math.imul((seed | 0) ^ 0xA5A5A5A5, 0x9E3779B1) + Math.imul((step | 0) + 1, 0x6C078965)) >>> 0;
  return function rand() {
    value = (value + 0x6D2B79F5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeSeed(config) {
  const seed = Number(config?.rngSeed);
  if (Number.isInteger(seed) && seed > 0) return seed;
  return Math.floor(Math.random() * 1_000_000_000) + 1;
}

export function throwAimed(aim, level, rand) {
  const target = normaliseDart(coerceAim(aim));
  const skill = skillProfile(level);
  const roll = rand();
  if (roll < skill.hit) return target;
  if (roll < skill.hit + skill.near) return nearby(target, rand);
  return scatter(rand, skill);
}

function coerceAim(aim) {
  if (!aim) return { type: "number", multiplier: 1, value: 20 };
  if (aim.type === "miss") return { type: "number", multiplier: 1, value: 20 };
  return aim;
}

function nearby(target, rand) {
  if (target.type === "inner") {
    const roll = rand();
    if (roll < 0.45) return { type: "outer" };
    if (roll < 0.7) return { type: "number", multiplier: 1, value: 20 };
    if (roll < 0.85) return { type: "number", multiplier: 1, value: 1 };
    return { type: "miss" };
  }
  if (target.type === "outer") {
    const roll = rand();
    if (roll < 0.35) return { type: "inner" };
    if (roll < 0.6) return { type: "number", multiplier: 1, value: 20 };
    if (roll < 0.8) return { type: "number", multiplier: 1, value: 5 };
    return { type: "miss" };
  }
  const neighbours = adjacentNumbers(target.value);
  const roll = rand();
  if (roll < 0.45) {
    const multiplier = target.multiplier === 3 ? (rand() < 0.7 ? 1 : 2) : target.multiplier === 2 ? (rand() < 0.55 ? 1 : 3) : rand() < 0.5 ? 2 : 3;
    return { type: "number", multiplier, value: target.value };
  }
  const value = neighbours[rand() < 0.5 ? 0 : 1] || target.value;
  return { type: "number", multiplier: target.multiplier, value };
}

function scatter(rand, skill) {
  if (rand() < skill.miss) return { type: "miss" };
  const value = 1 + Math.floor(rand() * 20);
  const ring = rand();
  const multiplier = ring < 0.72 ? 1 : ring < 0.9 ? 2 : 3;
  return { type: "number", multiplier, value };
}
