import { Redis } from '@upstash/redis';
import { createClient } from 'redis';
import { createHash, randomBytes } from 'node:crypto';

const restUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const restToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const tcpUrl = process.env.REDIS_URL || process.env.KV_URL;

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
