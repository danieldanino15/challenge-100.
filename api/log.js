import { redis, getPlayers, checkPin, sendJson } from '../lib/store.js';
import { todayIdx, isOut, DAILY } from '../lib/rules.js';

const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method' });
  if (!redis) return sendJson(res, 500, { error: 'no_database' });
  const { id, day, p, s, q = 0, m = 0, pin } = req.body || {};
  if (typeof id !== 'string' || !int(day, 1, 100) || !int(p, 0, 2000) || !int(s, 0, 2000) || !int(q, 0, 2000) || !int(m, 0, 2000) || !/^\d{4}$/.test(pin || '')) {
    return sendJson(res, 400, { error: 'bad_input' });
  }
  try {
    const players = await getPlayers();
    const auth = await checkPin(players, id, pin);
    if (auth === 'no_player') return sendJson(res, 404, { error: 'no_player' });
    if (auth === 'wrong_pin') return sendJson(res, 403, { error: 'wrong_pin' });
    const log = (await redis.hgetall(`log:${id}`)) || {};
    if (auth !== 'admin' && isOut(log, todayIdx())) return sendJson(res, 403, { error: 'out' });
    // `at` = when this day was first logged (used for the weekly "slacker cup").
    const at = (log[day] && log[day].at) || Date.now();
    await redis.hset(`log:${id}`, { [day]: { p, s, q, m, at } });

    // Post the log to the group chat (one message per person per day; a re-save updates it).
    const parts = [['שכיבות סמיכה', p], ['כפיפות בטן', s], ['סקוואט', q], ['מתח', m]]
      .filter(([, n]) => n > 0).map(([label, n]) => `${label} ${n}`).join(' · ');
    const tot = p + s + q + m;
    const name = players[id].name;
    const text = tot >= DAILY
      ? `✅ ${name} סגר/ה את יום ${day} עם ${tot} חזרות${parts ? ` (${parts})` : ''}`
      : `${name} תיעד/ה יום ${day}: ${tot} מתוך ${DAILY}${parts ? ` (${parts})` : ''}`;
    const mid = `log-${id}-${day}`;
    await redis.hset('chat', { [mid]: { mid, pid: id, name, text, auto: true, hasImg: false, ts: Date.now() } });
    sendJson(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: 'server' });
  }
}
