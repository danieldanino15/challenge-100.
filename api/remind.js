import { redis, getPlayers, sendJson } from '../lib/store.js';
import { pushReady, webpush } from '../lib/push.js';

const START = Date.UTC(2026, 10, 23); // day 1 = 23.11.2026
const DAYS = 100, GOAL = 100;
const MESSAGE = 'נו יא סחבה, עוד רגע נגמר היום. תיעדת?';

// Today's challenge day, by the calendar in Israel.
function todayIdx() {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - START) / 864e5) + 1;
}

const full = (log, d, mult = 1) => {
  const v = (log || {})[d] || {};
  return (+v.p || 0) >= GOAL * mult && (+v.s || 0) >= GOAL * mult;
};

function isOut(log, T) {
  let missed = 0;
  for (let d = 1; d < Math.min(T, DAYS + 1); d++) {
    if (!full(log, d) && !(d + 1 < T && full(log, d + 1, 2))) missed++;
  }
  return missed >= 2;
}

export default async function handler(req, res) {
  // With CRON_SECRET set, Vercel sends it and we require it. Without it, accept only Vercel's own cron runner.
  const secret = process.env.CRON_SECRET;
  const ok = secret
    ? req.headers.authorization === `Bearer ${secret}`
    : /^vercel-cron\//.test(req.headers['user-agent'] || '');
  if (!ok) return sendJson(res, 401, { error: 'unauthorized' });
  if (!redis) return sendJson(res, 500, { error: 'no_database' });
  if (!pushReady()) return sendJson(res, 500, { error: 'no_vapid_key' });

  const T = todayIdx();
  if (T < 1 || T > DAYS) return sendJson(res, 200, { skipped: 'outside_challenge', day: T });

  const players = await getPlayers();
  let sent = 0, removed = 0, skipped = 0;
  for (const id of Object.keys(players)) {
    const [log, subs] = await Promise.all([redis.hgetall(`log:${id}`), redis.hgetall(`subs:${id}`)]);
    if (!subs || full(log, T) || isOut(log, T)) { skipped++; continue; }
    const payload = JSON.stringify({ title: 'אתגר 100 ימים', body: MESSAGE, url: '/' });
    for (const [key, sub] of Object.entries(subs)) {
      try {
        await webpush.sendNotification(sub, payload, { TTL: 6 * 3600, urgency: 'high' });
        sent++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) { await redis.hdel(`subs:${id}`, key); removed++; }
        else console.error('push', id, e.statusCode, e.body);
      }
    }
  }
  sendJson(res, 200, { day: T, sent, removed, skipped });
}
