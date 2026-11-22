import { redis, getPlayers, hashPin, newId, sendJson } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method' });
  const name = String((req.body || {}).name || '').trim().slice(0, 40);
  const pin = String((req.body || {}).pin || '');
  if (!name || !/^\d{4}$/.test(pin)) return sendJson(res, 400, { error: 'bad_input' });
  try {
    const players = await getPlayers();
    if (Object.values(players).some(p => p.name.trim() === name)) {
      return sendJson(res, 409, { error: 'name_taken' });
    }
    if (Object.keys(players).length >= 50) return sendJson(res, 400, { error: 'full' });
    const id = newId();
    await redis.hset('players', { [id]: { name, order: Date.now(), pinHash: hashPin(id, pin) } });
    sendJson(res, 200, { id });
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: 'server' });
  }
}
