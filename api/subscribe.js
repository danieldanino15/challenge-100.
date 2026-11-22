import { createHash } from 'node:crypto';
import { redis, getPlayers, sendJson } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method' });
  if (!redis) return sendJson(res, 500, { error: 'no_database' });
  const { id, sub } = req.body || {};
  const endpoint = sub && sub.endpoint;
  if (typeof id !== 'string' || typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || !sub.keys) {
    return sendJson(res, 400, { error: 'bad_input' });
  }
  try {
    const players = await getPlayers();
    if (!players[id]) return sendJson(res, 404, { error: 'no_player' });
    const key = createHash('sha256').update(endpoint).digest('hex').slice(0, 24);
    // One device belongs to one participant: drop it from anyone else first.
    await Promise.all(Object.keys(players).filter(pid => pid !== id).map(pid => redis.hdel(`subs:${pid}`, key)));
    await redis.hset(`subs:${id}`, { [key]: { endpoint, keys: sub.keys } });
    sendJson(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: 'server' });
  }
}
