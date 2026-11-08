export function blankStats() {
  return {
    points: 0,
    darts: 0,
    firstNinePoints: 0,
    firstNineDarts: 0,
    tons: 0,
    tonForties: 0,
    oneEighties: 0,
    highestVisit: 0,
    highestCheckout: 0,
    busts: 0,
    doubleHits: 0,
    doubleAttempts: 0,
    doubleTracked: false,
    legsWon: 0,
    setsWon: 0,
    winningLegDarts: [],
    visits: 0,
  };
}

export function threeDart(stats) {
  if (!stats?.darts) return null;
  return (3 * stats.points) / stats.darts;
}

export function firstNine(stats) {
  if (!stats?.firstNineDarts) return null;
  return (3 * stats.firstNinePoints) / stats.firstNineDarts;
}

export function checkoutRate(stats) {
  if (!stats?.doubleTracked || !stats.doubleAttempts) return null;
  return stats.doubleHits / stats.doubleAttempts;
}

export function fmtAvg(value) {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(2);
}

export function fmtPct(rate) {
  if (rate == null || Number.isNaN(rate)) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

export function addVisitBand(stats, points, { checkout = false, bust = false } = {}) {
  if (bust) {
    stats.busts += 1;
    return;
  }
  if (points === 180) stats.oneEighties += 1;
  else if (points >= 140) stats.tonForties += 1;
  else if (points >= 100) stats.tons += 1;
  if (points > stats.highestVisit) stats.highestVisit = points;
  if (checkout && points > stats.highestCheckout) stats.highestCheckout = points;
}

export function mergeStats(into, extra) {
  if (!extra) return into;
  into.points += extra.points;
  into.darts += extra.darts;
  into.firstNinePoints += extra.firstNinePoints;
  into.firstNineDarts += extra.firstNineDarts;
  into.tons += extra.tons;
  into.tonForties += extra.tonForties;
  into.oneEighties += extra.oneEighties;
  into.highestVisit = Math.max(into.highestVisit, extra.highestVisit);
  into.highestCheckout = Math.max(into.highestCheckout, extra.highestCheckout);
  into.busts += extra.busts;
  into.doubleHits += extra.doubleHits;
  into.doubleAttempts += extra.doubleAttempts;
  into.doubleTracked = into.doubleTracked || extra.doubleTracked;
  into.legsWon += extra.legsWon;
  into.setsWon += extra.setsWon;
  into.winningLegDarts = into.winningLegDarts.concat(extra.winningLegDarts);
  into.visits += extra.visits;
  return into;
}

export function x01Rows(stats, { showSets = false } = {}) {
  const rows = [
    { label: "3-dart average", value: fmtAvg(threeDart(stats)) },
    { label: "First nine", value: fmtAvg(firstNine(stats)) },
    { label: "Checkout", value: fmtPct(checkoutRate(stats)) },
    { label: "Darts", value: String(stats.darts) },
    { label: "Legs won", value: String(stats.legsWon) },
  ];
  if (showSets) rows.push({ label: "Sets won", value: String(stats.setsWon) });
  rows.push(
    { label: "180s", value: String(stats.oneEighties) },
    { label: "140–179", value: String(stats.tonForties) },
    { label: "100–139", value: String(stats.tons) },
    { label: "Highest visit", value: String(stats.highestVisit) },
    { label: "Highest checkout", value: String(stats.highestCheckout) },
    { label: "Busts", value: String(stats.busts) },
  );
  if (stats.winningLegDarts.length) {
    const best = Math.min(...stats.winningLegDarts);
    const worst = Math.max(...stats.winningLegDarts);
    rows.push({ label: "Best winning leg", value: `${best} darts` });
    rows.push({ label: "Worst winning leg", value: `${worst} darts` });
  }
  return rows;
}

export function winsNeeded(mode, count) {
  if (mode === "single" || mode === "off") return 1;
  if (mode === "best") return Math.floor(Number(count) / 2) + 1;
  return Number(count);
}
