import { randomBytes } from 'node:crypto';
import { redis, getPlayers, checkPin, sendJson } from '../lib/store.js';

const KEEP = 300;          // messages kept
const MAX_IMG = 600_000;   // ~450 KB jpeg as base64

export default async function handler(req, res) {
  if (!redis) return sendJson(res, 500, { error: 'no_database' });
  try {
    if (req.method === 'GET') {
      const all = (await redis.hgetall('chat')) || {};
      const msgs = Object.values(all).sort((a, b) => a.ts - b.ts).slice(-80);
      return sendJson(res, 200, { messages: msgs });
    }
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method' });

    const { id, pin } = req.body || {};
    const text = String((req.body || {}).text || '').trim().slice(0, 500);
    const img = (req.body || {}).img;
    if (typeof id !== 'string' || !/^\d{4}$/.test(pin || '')) return sendJson(res, 400, { error: 'bad_input' });
    if (img != null && (typeof img !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(img) || img.length > MAX_IMG)) {
      return sendJson(res, 400, { error: 'bad_image' });
    }
    if (!text && !img) return sendJson(res, 400, { error: 'empty' });

    const players = await getPlayers();
    const auth = await checkPin(players, id, pin);
    if (auth === 'no_player') return sendJson(res, 404, { error: 'no_player' });
    if (auth === 'wrong_pin') return sendJson(res, 403, { error: 'wrong_pin' });

    const ts = Date.now();
    const mid = `${ts.toString(36)}-${randomBytes(3).toString('hex')}`;
    if (img) await redis.hset('chatimg', { [mid]: img });
    await redis.hset('chat', { [mid]: { mid, pid: id, name: players[id].name, text, hasImg: !!img, ts } });

    // Prune the oldest messages (and their pictures).
    const all = (await redis.hgetall('chat')) || {};
    const old = Object.values(all).sort((a, b) => a.ts - b.ts).slice(0, Math.max(0, Object.keys(all).length - KEEP));
    for (const m of old) {
      await redis.hdel('chat', m.mid);
      if (m.hasImg) await redis.hdel('chatimg', m.mid);
    }
    sendJson(res, 200, { ok: true, mid });
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: 'server' });
  }
}
