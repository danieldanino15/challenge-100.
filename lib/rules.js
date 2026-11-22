// Shared challenge rules (the page has the same logic in index.html).
export const START = Date.UTC(2026, 10, 23); // day 1 = 23.11.2026
export const DAYS = 100;
export const DAILY = 200; // push-ups + sit-ups + squats + pull-ups, split any way

export const total = (log, d) => {
  const v = (log || {})[d] || {};
  return (+v.p || 0) + (+v.s || 0) + (+v.q || 0) + (+v.m || 0);
};

// Today's challenge day by the calendar in Israel.
export function todayIdx() {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - START) / 864e5) + 1;
}

// A finished day under 200 is a miss, unless the next finished day covered the shortfall on top of its own 200.
// 5 = Friday, 6 = Saturday
export const weekday = d => new Date(START + (d - 1) * 864e5).getUTCDay();
export const isShabbat = d => { const w = weekday(d); return w === 5 || w === 6; };

export function missedDays(log, T) {
  const missed = [];
  for (let d = 1; d < Math.min(T, DAYS + 1); d++) {
    const t = total(log, d);
    if (t >= DAILY) continue;
    // Friday and Saturday can be logged until the end of Sunday (for those who keep Shabbat).
    if (isShabbat(d) && d + (weekday(d) === 5 ? 2 : 1) >= T) continue;
    const madeUp = d + 1 < T && total(log, d + 1) >= DAILY + (DAILY - t);
    if (!madeUp) missed.push(d);
  }
  return missed;
}

export const isOut = (log, T) => missedDays(log, T).length >= 2;

export const fullDays = log => {
  let n = 0;
  for (let d = 1; d <= DAYS; d++) if (total(log, d) >= DAILY) n++;
  return n;
};

export const MILESTONES = { 25: 'רבע הדרך', 50: 'חצי הדרך', 75: 'שלושה רבעים מהדרך', 100: 'סיים/ה את האתגר' };
