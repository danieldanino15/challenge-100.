import { redis, getPlayers, sendJson } from '../lib/store.js';

// Reports only whether each setting exists, never its value.
export default async function handler(req, res) {
  let push = null;
  if (redis) {
    const players = await getPlayers();
    const devices = {};
    for (const [id, p] of Object.entries(players)) devices[p.name] = Object.keys((await redis.hgetall(`subs:${id}`)) || {}).length;
    const last = {};
    for (const slot of ['morning', 'evening', 'late']) last[slot] = await redis.hget('meta', `lastRemind-${slot}`);
    push = { devices, last };
  }
  sendJson(res, 200, {
    push,
    database: !!redis,
    pushKey: !!process.env.VAPID_PRIVATE_KEY,
    cronSecret: !!process.env.CRON_SECRET,
    version: 'push-check-1',
  });
}
