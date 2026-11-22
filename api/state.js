import { redis, getPlayers, sendJson, dbEnvNames } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method' });
  if (!redis) return sendJson(res, 500, { error: 'no_database', found: dbEnvNames });
  try {
    const players = await getPlayers();
    const ids = Object.keys(players);
    const logs = await Promise.all(ids.map(id => redis.hgetall(`log:${id}`)));
    const list = ids
      .map((id, i) => ({
        id,
        name: players[id].name,
        order: players[id].order,
        hasPin: !!players[id].pinHash,
        log: logs[i] || {},
      }))
      .sort((a, b) => a.order - b.order);
    sendJson(res, 200, { players: list });
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: 'server' });
  }
}
