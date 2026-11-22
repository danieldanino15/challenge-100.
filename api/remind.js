import { redis, getPlayers, sendJson } from '../lib/store.js';
import { pushReady, webpush } from '../lib/push.js';
import { DAYS, DAILY, todayIdx, total, isOut, isShabbat } from '../lib/rules.js';

const MESSAGES = {
  evening: 'נו יא סחבה, עוד רגע נגמר היום. תיעדת?',
  late: 'לא תיעדת היום. אם לא תתעד עד 12, מחר תצטרך להשלים. ודניאל יצחק עליך.',
};

export default async function handler(req, res) {
  // With CRON_SECRET set, Vercel sends it and we require it. Without it, accept only Vercel's own cron runner.
  const secret = process.env.CRON_SECRET;
  const ok = secret
    ? req.headers.authorization === `Bearer ${secret}`
    : /^vercel-cron\//.test(req.headers['user-agent'] || '');
  if (!ok) return sendJson(res, 401, { error: 'unauthorized' });
  if (!redis) return sendJson(res, 500, { error: 'no_database' });
  if (!pushReady()) return sendJson(res, 500, { error: 'no_vapid_key' });

  const slot = (req.query && req.query.slot) === 'late' ? 'late' : 'evening';
  const T = todayIdx();
  if (T < 1 || T > DAYS) return sendJson(res, 200, { skipped: 'outside_challenge', day: T });
  if (isShabbat(T)) return sendJson(res, 200, { skipped: 'shabbat', day: T });

  const players = await getPlayers();
  const payload = JSON.stringify({ title: 'אתגר 100 ימים', body: MESSAGES[slot], url: '/' });
  let sent = 0, removed = 0, skipped = 0;
  for (const id of Object.keys(players)) {
    const [log, subs] = await Promise.all([redis.hgetall(`log:${id}`), redis.hgetall(`subs:${id}`)]);
    if (!subs || total(log, T) >= DAILY || isOut(log, T)) { skipped++; continue; }
    for (const [key, sub] of Object.entries(subs)) {
      try {
        await webpush.sendNotification(sub, payload, { TTL: 3 * 3600, urgency: 'high' });
        sent++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) { await redis.hdel(`subs:${id}`, key); removed++; }
        else console.error('push', id, e.statusCode, e.body);
      }
    }
  }
  sendJson(res, 200, { slot, day: T, sent, removed, skipped });
}
