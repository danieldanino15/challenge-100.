import { Redis } from '@upstash/redis';
import { createClient } from 'redis';
import { createHash, randomBytes } from 'node:crypto';

// Vercel may add a custom prefix to the variable names (e.g. STORAGE_KV_REST_API_URL),
// so find them by suffix and by value instead of exact name.
const env = process.env;
const pick = test => Object.keys(env).sort().find(k => test(k, env[k] || ''));
const urlKey = pick((k, v) => /(REST_API_URL|REDIS_REST_URL)$/.test(k) && v.startsWith('https://'));
const tokenKey = urlKey && (
  env[urlKey.replace(/URL$/, 'TOKEN')] !== undefined ? urlKey.replace(/URL$/, 'TOKEN')
  : pick(k => /(REST_API_TOKEN|REDIS_REST_TOKEN)$/.test(k) && !/READ_ONLY/.test(k)));
const restUrl = urlKey && env[urlKey];
const restToken = tokenKey && env[tokenKey];
const tcpKey = pick((k, v) => /^rediss?:\/\//.test(v));
const tcpUrl = tcpKey && env[tcpKey];
// Names only (never values), to help diagnose a missing connection.
export const dbEnvNames = Object.keys(env).filter(k => /REDIS|KV|UPSTASH|STORAGE/i.test(k));

// Works with either Vercel's Upstash (REST) or a plain Redis connection string.
function tcpStore(url) {
  let client;
  const conn = async () => {
    if (!client) {
      client = createClient({ url });
      client.on('error', e => console.error('redis', e));
      await client.connect();
    }
    return client;
  };
  return {
    async hgetall(key) {
      const raw = await (await conn()).hGetAll(key);
      const keys = Object.keys(raw || {});
      if (!keys.length) return null;
      return Object.fromEntries(keys.map(k => [k, JSON.parse(raw[k])]));
    },
    async hget(key, field) {
      const v = await (await conn()).hGet(key, field);
      return v == null ? null : JSON.parse(v);
    },
    async hdel(key, field) {
      return (await conn()).hDel(key, field);
    },
    async hset(key, obj) {
      const flat = Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, JSON.stringify(v)]));
      return (await conn()).hSet(key, flat);
    },
  };
}

export const redis = restUrl && restToken
  ? new Redis({ url: restUrl, token: restToken })
  : tcpUrl
    ? tcpStore(tcpUrl)
    : null;
if (!redis) console.error('No database env vars found (UPSTASH_REDIS_REST_URL / KV_REST_API_URL / REDIS_URL).');

// Participants who were already in the challenge before the move to Vercel.
// Each one sets a personal PIN the first time he saves.
const SEED = [
  { id: 'daniel', name: 'דניאל דנינו', order: 1 },
  { id: 'rom', name: 'רום אבישר', order: 2 },
  { id: 'asaf', name: 'אסף ריינשטיין', order: 3 },
];

export const hashPin = (id, pin) =>
  createHash('sha256').update(`${id}:${pin}:${process.env.PIN_SALT || 'c100'}`).digest('hex');

export const newId = () => randomBytes(6).toString('hex');

// One-time fix (22.11): Diana's first chat message was posted under Daniel's row
// before she joined, which may also have claimed Daniel's PIN and logged zeros on day 1.
async function fixOnce(players) {
  if (await redis.hget('meta', 'fix-2211')) return players;
  const diana = Object.entries(players).find(([, p]) => (p.name || '').startsWith('דיאנה'));
  if (diana) {
    const msg = await redis.hget('chat', 'mws8goyo-e757c7');
    if (msg && msg.pid === 'daniel') await redis.hset('chat', { [msg.mid]: { ...msg, pid: diana[0], name: diana[1].name } });
  }
  if (players.daniel) {
    players.daniel = { ...players.daniel, pinHash: null };
    await redis.hset('players', { daniel: players.daniel });
    const log = (await redis.hgetall('log:daniel')) || {};
    const d1 = log['1'];
    if (d1 && !(+d1.p || +d1.s || +d1.q)) await redis.hdel('log:daniel', '1');
  }
  await redis.hset('meta', { 'fix-2211': { at: Date.now() } });
  return players;
}

// One-time log resets asked by Daniel. Each clears that person's logged days (and their
// automatic chat posts); they stay in the challenge with their PIN. Add a line to reset someone.
const LOG_RESETS = [
  { key: 'reset-efrat-2211', id: '37d76b41ad6b' },
  { key: 'reset-ziso-2211', id: '9f476d02477c' },
];
// Participants removed at Daniel's request: row, logs, devices, auto chat posts, and any bets on/by them.
const REMOVALS = [
  { key: 'remove-lavdav-2211', id: '562b89b713c1' },
];
async function runRemovals(players) {
  for (const { key, id } of REMOVALS) {
    if (await redis.hget('meta', key)) continue;
    const log = (await redis.hgetall(`log:${id}`)) || {};
    for (const day of Object.keys(log)) { await redis.hdel(`log:${id}`, day); await redis.hdel('chat', `log-${id}-${day}`); }
    const subs = (await redis.hgetall(`subs:${id}`)) || {};
    for (const k of Object.keys(subs)) await redis.hdel(`subs:${id}`, k);
    const bets = (await redis.hgetall('bets')) || {};
    for (const [voter, b] of Object.entries(bets)) if (voter === id || (b && b.target === id)) await redis.hdel('bets', voter);
    await redis.hdel('players', id);
    delete players[id];
    await redis.hset('meta', { [key]: { at: Date.now() } });
  }
  return players;
}

// One-time fix (24.11): an old cached page sent Daniel's full day-2 numbers (+10) to the new "add" logic,
// doubling day 2 from 190 to 390. The real total is 200.
async function fixDanielDay2() {
  if (await redis.hget('meta', 'fix-daniel-d2')) return;
  const d2 = await redis.hget('log:daniel', '2');
  const t = d2 ? (+d2.p || 0) + (+d2.s || 0) + (+d2.q || 0) + (+d2.m || 0) : 0;
  if (t === 390) {
    await redis.hset('log:daniel', { 2: { p: 65, s: 55, q: 80, m: 0, at: d2.at } });
    const msg = await redis.hget('chat', 'log-daniel-2');
    if (msg) await redis.hset('chat', { 'log-daniel-2': { ...msg, text: '✅ דניאל דנינו סגר/ה את יום 2 עם 200 חזרות (שכיבות סמיכה 65 · כפיפות בטן 55 · סקוואט 80)' } });
  }
  await redis.hset('meta', { 'fix-daniel-d2': { at: Date.now() } });
}

// Single days cleared at Daniel's request (log entry + its automatic chat post).
const DAY_RESETS = [
  { key: 'reset-gil-d3', id: 'b3dd191d5733', day: 3 },
];
async function runDayResets() {
  for (const { key, id, day } of DAY_RESETS) {
    if (await redis.hget('meta', key)) continue;
    await redis.hdel(`log:${id}`, String(day));
    await redis.hdel('chat', `log-${id}-${day}`);
    await redis.hset('meta', { [key]: { at: Date.now() } });
  }
}

// Days set by hand at Daniel's request (replaces that day's numbers; posts the usual chat line).
const DAY_SETS = [
  { key: 'set-gil-d3', id: 'b3dd191d5733', day: 3, v: { p: 200, s: 0, q: 200, m: 0 } },
  // Correction (26.11): Gil really did 209 on day 2 (just didn't log it) and 200 on day 3.
  { key: 'set-gil-d2-fix', id: 'b3dd191d5733', day: 2, v: { p: 109, s: 0, q: 100, m: 0 } },
  { key: 'set-gil-d3-fix', id: 'b3dd191d5733', day: 3, v: { p: 100, s: 0, q: 100, m: 0 } },
  // Yigal, day 4 (26.11): 100 push-ups + 100 sit-ups, as Daniel reported.
  { key: 'set-yigal-d4', id: 'dd32f86e9dca', day: 4, v: { p: 100, s: 100, q: 0, m: 0 } },
];
async function runDaySets(players) {
  for (const { key, id, day, v } of DAY_SETS) {
    if (await redis.hget('meta', key)) continue;
    if (players[id]) {
      await redis.hset(`log:${id}`, { [day]: { ...v, at: Date.now() } });
      const parts = [['שכיבות סמיכה', v.p], ['כפיפות בטן', v.s], ['סקוואט', v.q], ['מתח', v.m]].filter(([, n]) => n > 0).map(([l, n]) => `${l} ${n}`).join(' · ');
      const tot = v.p + v.s + v.q + v.m, name = players[id].name, mid = `log-${id}-${day}`;
      await redis.hset('chat', { [mid]: { mid, pid: id, name, text: `✅ ${name} סגר/ה את יום ${day} עם ${tot} חזרות (${parts})`, auto: true, hasImg: false, ts: Date.now() } });
    }
    await redis.hset('meta', { [key]: { at: Date.now() } });
  }
}

async function runResets(players) {
  await fixDanielDay2();
  await runDayResets();
  await runDaySets(players);
  for (const { key, id } of LOG_RESETS) {
    if (await redis.hget('meta', key)) continue;
    if (players[id]) {
      const log = (await redis.hgetall(`log:${id}`)) || {};
      for (const day of Object.keys(log)) {
        await redis.hdel(`log:${id}`, day);
        await redis.hdel('chat', `log-${id}-${day}`);
      }
    }
    await redis.hset('meta', { [key]: { at: Date.now() } });
  }
}

export async function getPlayers() {
  let players = (await redis.hgetall('players')) || {};
  if (Object.keys(players).length) players = await fixOnce(players);
  if (Object.keys(players).length) await runResets(players);
  if (Object.keys(players).length) players = await runRemovals(players);
  if (!Object.keys(players).length) {
    const seed = Object.fromEntries(SEED.map(p => [p.id, { name: p.name, order: p.order, pinHash: null }]));
    await redis.hset('players', seed);
    players = seed;
  }
  return players;
}

export function sendJson(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

// Checks a participant's PIN. The first PIN a participant ever uses claims the row.
export async function checkPin(players, id, pin) {
  const player = players[id];
  if (!player) return 'no_player';
  if (process.env.ADMIN_PIN && pin === process.env.ADMIN_PIN) return 'admin';
  if (!player.pinHash) {
    players[id] = { ...player, pinHash: hashPin(id, pin) };
    await redis.hset('players', { [id]: players[id] });
    return 'ok';
  }
  return player.pinHash === hashPin(id, pin) ? 'ok' : 'wrong_pin';
}
