import * as wp from 'web-push';
const webpush = wp.default || wp;

// Public key: safe to keep in code. The private key lives only in Vercel's env vars.
export const VAPID_PUBLIC_KEY = 'BPvqVNj_898n5yIEuxSAc2ikF-Q2XjqkvWMvq4H2X6YoSyDkNecdG85bexwZ3h_znT0SOBl-nzSw-6tFFt4JuXo';

let ready = false;
export function pushReady() {
  if (ready) return true;
  if (!process.env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails('mailto:challenge-100@example.com', VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  ready = true;
  return true;
}

export { webpush };

// Send one notification to every subscribed device (optionally skipping one participant).
export async function pushToAll(redis, playerIds, payload, exceptId) {
  if (!pushReady()) return 0;
  let sent = 0;
  for (const id of playerIds) {
    if (id === exceptId) continue;
    const subs = await redis.hgetall(`subs:${id}`);
    for (const [key, sub] of Object.entries(subs || {})) {
      try { await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 6 * 3600 }); sent++; }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await redis.hdel(`subs:${id}`, key); }
    }
  }
  return sent;
}
