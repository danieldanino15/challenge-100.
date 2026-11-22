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

export async function getPlayers() {
  let players = (await redis.hgetall('players')) || {};
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
