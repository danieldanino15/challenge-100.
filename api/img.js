import { redis } from '../lib/store.js';

export default async function handler(req, res) {
  const id = String((req.query && req.query.id) || '');
  if (!redis || !/^[a-z0-9-]{4,40}$/.test(id)) return res.status(404).end();
  const data = await redis.hget('chatimg', id);
  if (typeof data !== 'string' || !data.startsWith('data:image/jpeg;base64,')) return res.status(404).end();
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.status(200).send(Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'));
}
