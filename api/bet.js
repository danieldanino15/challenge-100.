import { redis, getPlayers, checkPin, sendJson } from '../lib/store.js';
import { todayIdx, isOut } from '../lib/rules.js';

// "Who falls first?" — each participant bets on one person. Bets close once someone has fallen.
export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method' });
  if (!redis) return sendJson(res, 500, { error: 'no_database' });
  const { id, pin, target } = req.body || {};
  if (typeof id !== 'string' || typeof target !== 'string' || !/^\d{4}$/.test(pin || '')) return sendJson(res, 400, { error: 'bad_input' });
  try {
    const players = await getPlayers();
    if (!players[target]) return sendJson(res, 404, { error: 'no_target' });
    const auth = await checkPin(players, id, pin);
    if (auth === 'no_player') return sendJson(res, 404, { error: 'no_player' });
    if (auth === 'wrong_pin') return sendJson(res, 403, { error: 'wrong_pin' });
    const T = todayIdx();
    const ids = Object.keys(players);
    const logs = await Promise.all(ids.map(pid => redis.hgetall(`log:${pid}`)));
    if (logs.some((l, i) => isOut(l, T, players[ids[i]].joinedDay))) return sendJson(res, 409, { error: 'closed' });
    await redis.hset('bets', { [id]: { target, ts: Date.now() } });
    sendJson(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: 'server' });
  }
}
