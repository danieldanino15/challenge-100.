import { redis, getPlayers, hashPin, sendJson } from '../lib/store.js';

const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method' });
  const { id, day, p, s, pin } = req.body || {};
  if (typeof id !== 'string' || !int(day, 1, 100) || !int(p, 0, 2000) || !int(s, 0, 2000) || !/^\d{4}$/.test(pin || '')) {
    return sendJson(res, 400, { error: 'bad_input' });
  }
  try {
    const players = await getPlayers();
    const player = players[id];
    if (!player) return sendJson(res, 404, { error: 'no_player' });

    const isAdmin = process.env.ADMIN_PIN && pin === process.env.ADMIN_PIN;
    if (!isAdmin) {
      if (!player.pinHash) {
        // First save claims the row with this PIN.
        await redis.hset('players', { [id]: { ...player, pinHash: hashPin(id, pin) } });
      } else if (player.pinHash !== hashPin(id, pin)) {
        return sendJson(res, 403, { error: 'wrong_pin' });
      }
    }
    await redis.hset(`log:${id}`, { [day]: { p, s } });
    sendJson(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: 'server' });
  }
}
