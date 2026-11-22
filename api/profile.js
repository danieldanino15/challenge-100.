import { redis, getPlayers, checkPin, sendJson } from '../lib/store.js';

const MAX_IMG = 600_000;
const STATUSES = ['רווק/ה', 'נשוי/אה', 'גרוש/ה', 'אלמן/ה', 'בזוגיות', 'מסובך'];
const str = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

// A participant fills in their own profile card (PIN required).
export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method' });
  if (!redis) return sendJson(res, 500, { error: 'no_database' });
  const { id, pin } = req.body || {};
  const b = (req.body || {}).profile || {};
  if (typeof id !== 'string' || !/^\d{4}$/.test(pin || '')) return sendJson(res, 400, { error: 'bad_input' });
  const age = b.age === '' || b.age == null ? null : Number(b.age);
  if (age != null && !(Number.isInteger(age) && age >= 10 && age <= 120)) return sendJson(res, 400, { error: 'bad_age' });
  const status = STATUSES.includes(b.status) ? b.status : '';
  const name = str(b.name, 40);
  const photo = b.photo;
  if (photo != null && (typeof photo !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo) || photo.length > MAX_IMG)) {
    return sendJson(res, 400, { error: 'bad_image' });
  }
  try {
    const players = await getPlayers();
    const auth = await checkPin(players, id, pin);
    if (auth === 'no_player') return sendJson(res, 404, { error: 'no_player' });
    if (auth === 'wrong_pin') return sendJson(res, 403, { error: 'wrong_pin' });
    if (name && Object.entries(players).some(([pid, p]) => pid !== id && (p.name || '').trim() === name)) {
      return sendJson(res, 409, { error: 'name_taken' });
    }
    const old = players[id].profile || {};
    let photoV = old.photoV || null;
    if (photo) { await redis.hset('avatars', { [id]: photo }); photoV = Date.now(); }
    else if (b.removePhoto) { await redis.hdel('avatars', id); photoV = null; }
    const profile = { age, status, food: str(b.food, 60), nick: str(b.nick, 40), photoV };
    await redis.hset('players', { [id]: { ...players[id], name: name || players[id].name, profile } });
    sendJson(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: 'server' });
  }
}
