/** Apply a visit under independent in and out rules. */

import { dartPoints, isDouble, isPossibleVisit, isTreble, normaliseDart } from "./darts.js";
import { bustsOnLeave, canCheckout, finishOk } from "./checkout.js";

export function scoreSequence(startRemaining, startOpened, darts, inRule, outRule) {
  let remaining = startRemaining;
  let opened = !!startOpened;
  const credited = [];
  let attempts = 0;
  let hits = 0;
  let tracked = false;

  for (let index = 0; index < darts.length; index += 1) {
    const dart = normaliseDart(darts[index]);
    const points = dartPoints(dart);
    let scoring = opened;
    if (!opened) {
      const opens = inRule === "double" ? isDouble(dart) : inRule === "master" ? isDouble(dart) || isTreble(dart) : true;
      if (!opens) {
        credited.push(0);
        continue;
      }
      scoring = true;
    }
    if (outRule === "double" && scoring && oneDartDouble(remaining) && countsAsDoubleAttempt(remaining, dart)) {
      attempts += 1;
      tracked = true;
      if (points === remaining && isDouble(dart)) hits += 1;
    }
    if (points > remaining || (points === remaining && !finishOk(dart, outRule)) || (points < remaining && bustsOnLeave(remaining - points, outRule))) {
      return {
        bust: true,
        checkout: false,
        remaining: startRemaining,
        opened: !!startOpened,
        points: 0,
        dartsUsed: index + 1,
        attempts,
        hits,
        tracked,
        credited: Array(index + 1).fill(0),
      };
    }
    credited.push(points);
    if (points === remaining) {
      return {
        bust: false,
        checkout: true,
        remaining: 0,
        opened: true,
        points: startRemaining,
        dartsUsed: index + 1,
        attempts,
        hits,
        tracked,
        credited,
      };
    }
    remaining -= points;
    opened = true;
  }

  return {
    bust: false,
    checkout: false,
    remaining,
    opened,
    points: startRemaining - remaining,
    dartsUsed: darts.length,
    attempts,
    hits,
    tracked,
    credited,
  };
}

function oneDartDouble(remaining) {
  return remaining === 50 || (remaining >= 2 && remaining <= 40 && remaining % 2 === 0);
}

function countsAsDoubleAttempt(remaining, dart) {
  if (remaining === 50) return dart.type === "inner" || dart.type === "outer" || dart.type === "miss";
  if (dart.type === "miss") return true;
  return dart.type === "number" && dart.value === remaining / 2;
}

export function planTotal(options) {
  const inRule = options.inRule;
  const outRule = options.outRule;
  const startRemaining = options.remaining;
  const startOpened = !!options.opened;
  const dartsUsed = options.dartsUsed ?? 3;
  if (![1, 2, 3].includes(dartsUsed)) throw new Error("Darts thrown must be 1, 2 or 3");

  if (options.bust) return bust(startRemaining, startOpened, dartsUsed, options, outRule);
  if (options.miss || options.total === 0 && options.forceMiss) {
    return plain({
      remaining: startRemaining,
      opened: startOpened,
      points: 0,
      dartsUsed,
      options,
      outRule,
      checkout: false,
    });
  }

  const total = options.total;
  if (!Number.isInteger(total) || total < 0) throw new Error("Enter a visit total");
  if (!isPossibleVisit(total, dartsUsed)) throw new Error("That total is impossible with those darts");

  if (!startOpened && inRule !== "straight") {
    if (!options.didOpen) {
      if (total !== 0) throw new Error("Tick the opening dart, or enter 0 if you are still not in");
      return plain({
        remaining: startRemaining,
        opened: false,
        points: 0,
        dartsUsed,
        options,
        outRule,
        checkout: false,
      });
    }
    if (total < 2) throw new Error("The opening dart has to score");
  }

  if (total > startRemaining) return bust(startRemaining, startOpened, dartsUsed, options, outRule);
  if (total === startRemaining && total > 0) {
    return planCheckout(options, startRemaining, startOpened, dartsUsed, total, outRule);
  }
  const leave = startRemaining - total;
  if (bustsOnLeave(leave, outRule)) return bust(startRemaining, startOpened, dartsUsed, options, outRule);
  return plain({
    remaining: leave,
    opened: true,
    points: total,
    dartsUsed,
    options,
    outRule,
    checkout: false,
  });
}

function planCheckout(options, startRemaining, startOpened, dartsUsed, total, outRule) {
  if (!canCheckout(total, dartsUsed, outRule)) {
    throw new Error("That total cannot check out with those darts");
  }
  const attempt = attemptsFor(options, true, outRule);
  return {
    bust: false,
    checkout: true,
    remaining: 0,
    opened: true,
    points: startRemaining,
    dartsUsed,
    credited: spread(startRemaining, dartsUsed, null),
    ...attempt,
  };
}

function bust(remaining, opened, dartsUsed, options, outRule) {
  return {
    bust: true,
    checkout: false,
    remaining,
    opened,
    points: 0,
    dartsUsed,
    credited: Array(dartsUsed).fill(0),
    ...attemptsFor(options, false, outRule),
  };
}

function plain({ remaining, opened, points, dartsUsed, options, outRule, checkout }) {
  return {
    bust: false,
    checkout,
    remaining,
    opened,
    points,
    dartsUsed,
    credited: spread(points, dartsUsed, null),
    ...attemptsFor(options, checkout, outRule),
  };
}

function attemptsFor(options, checkout, outRule) {
  if (outRule !== "double") return { attempts: 0, hits: 0, tracked: false };
  const raw = options.doubleAttempts;
  if (raw == null || raw === "na" || raw === "") {
    if (checkout) return { attempts: 1, hits: 1, tracked: true };
    return { attempts: 0, hits: 0, tracked: false };
  }
  const count = Number(raw);
  if (!Number.isInteger(count) || count < 0 || count > 3) {
    throw new Error("Doubles aimed at must be from 0 to 3");
  }
  return {
    attempts: checkout ? Math.max(1, count) : count,
    hits: checkout ? 1 : 0,
    tracked: true,
  };
}

function spread(points, darts, last) {
  const credited = Array(darts).fill(0);
  if (last != null && darts > 0) {
    const finish = Math.min(points, last);
    credited[darts - 1] = finish;
    let rest = points - finish;
    const slots = darts - 1;
    if (slots <= 0) return credited;
    const base = Math.floor(rest / slots);
    const extra = rest - base * slots;
    for (let index = 0; index < slots; index += 1) {
      credited[index] = base + (index === slots - 1 ? extra : 0);
    }
    return credited;
  }
  if (darts <= 0) return credited;
  const base = Math.floor(points / darts);
  const extra = points - base * darts;
  for (let index = 0; index < darts; index += 1) {
    credited[index] = base + (index === darts - 1 ? extra : 0);
  }
  return credited;
}
