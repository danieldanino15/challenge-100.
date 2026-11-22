import { Redis } from '@upstash/redis';
import { createHash, randomBytes } from 'node:crypto';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

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
