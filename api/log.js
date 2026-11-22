import { redis, getPlayers, checkPin, sendJson } from '../lib/store.js';
import { todayIdx, isOut } from '../lib/rules.js';

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
    if (auth !== 'admin') {
      const log = await redis.hgetall(`log:${id}`);
      if (isOut(log, todayIdx())) return sendJson(res, 403, { error: 'out' });
    }
    await redis.hset(`log:${id}`, { [day]: { p, s, q, m } });
    sendJson(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: 'server' });
  }
}
