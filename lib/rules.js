// Shared challenge rules (the page has the same logic in index.html).
export const START = Date.UTC(2026, 10, 23); // day 1 = 23.11.2026
export const DAYS = 100;
export const DAILY = 200; // push-ups + sit-ups + squats, split any way

export const total = (log, d) => {
  const v = (log || {})[d] || {};
  return (+v.p || 0) + (+v.s || 0) + (+v.q || 0);
};

// Today's challenge day by the calendar in Israel.
export function todayIdx() {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - START) / 864e5) + 1;
}

// A finished day under 200 is a miss, unless the next finished day covered the shortfall on top of its own 200.
export function missedDays(log, T) {
  const missed = [];
  for (let d = 1; d < Math.min(T, DAYS + 1); d++) {
    const t = total(log, d);
    if (t >= DAILY) continue;
    const madeUp = d + 1 < T && total(log, d + 1) >= DAILY + (DAILY - t);
    if (!madeUp) missed.push(d);
  }
  return missed;
}

export const isOut = (log, T) => missedDays(log, T).length >= 2;
