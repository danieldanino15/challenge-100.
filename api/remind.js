import { redis, getPlayers, sendJson } from '../lib/store.js';
import { pushReady, webpush } from '../lib/push.js';
import { DAYS, DAILY, todayIdx, total, isOut, isShabbat } from '../lib/rules.js';

// How much a person must do today: 200 plus whatever they were short yesterday (0 = nothing owed).
function owed(log, T, joined = 1) {
  const y = T - 1;
  if (y < Math.max(1, joined) || isShabbat(y)) return 0;
  const t = total(log, y);
  return t < DAILY ? DAILY + (DAILY - t) : 0;
}

const MESSAGES = {
  evening: 'נו יא סחבה, עוד רגע נגמר היום. תיעדת?',
  late: 'לא תיעדת היום. אם לא תתעד עד 12, מחר תצטרך להשלים. ודניאל יצחק עליך.',
  morning: 'מחכה לך הודעה דחופה',
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

  const q = (req.query && req.query.slot) || '';
  const slot = q === 'late' || q === 'morning' ? q : 'evening';
  const T = todayIdx();
  if (T < 1 || T > DAYS) return sendJson(res, 200, { skipped: 'outside_challenge', day: T });
  if (isShabbat(T)) return sendJson(res, 200, { skipped: 'shabbat', day: T });

  const players = await getPlayers();
  const payload = JSON.stringify({ title: 'אתגר 100 ימים', body: MESSAGES[slot], url: slot === 'morning' ? '/?owe=1' : '/' });
  let sent = 0, removed = 0, skipped = 0;
  const results = {};
  for (const id of Object.keys(players)) {
    const [log, subs] = await Promise.all([redis.hgetall(`log:${id}`), redis.hgetall(`subs:${id}`)]);
    const joined = players[id].joinedDay;
    const nm = players[id].name;
    if (!subs) { results[nm] = 'לא נרשם להתראות'; skipped++; continue; }
    if (isOut(log, T, joined)) { results[nm] = 'עף, לא נשלח'; skipped++; continue; }
    // morning: only those who must make up yesterday; evening/late: anyone not done for today
    if (slot === 'morning' ? !owed(log, T, joined) : total(log, T) >= (owed(log, T, joined) || DAILY)) { results[nm] = 'לא צריך תזכורת'; skipped++; continue; }
    let ok = 0, bad = [];
    for (const [key, sub] of Object.entries(subs)) {
      try {
        await webpush.sendNotification(sub, payload, { TTL: 3 * 3600, urgency: 'high' });
        sent++; ok++;
      } catch (e) {
        bad.push(e.statusCode || 'error');
        if (e.statusCode === 404 || e.statusCode === 410) { await redis.hdel(`subs:${id}`, key); removed++; }
        else console.error('push', id, e.statusCode, e.body);
      }
    }
    results[nm] = ok ? `נשלח (${ok} מכשירים)` + (bad.length ? `, נכשל ב-${bad.length}` : '') : `נכשל (${bad.join(',')})`;
  }
  await redis.hset('meta', { [`lastRemind-${slot}`]: { at: Date.now(), day: T, sent, removed, results } });
  sendJson(res, 200, { slot, day: T, sent, removed, skipped });
}
