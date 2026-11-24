import { redis, sendJson } from '../lib/store.js';

// Reports only whether each setting exists, never its value.
export default function handler(req, res) {
  sendJson(res, 200, {
    database: !!redis,
    pushKey: !!process.env.VAPID_PRIVATE_KEY,
    cronSecret: !!process.env.CRON_SECRET,
    version: 'owe-popup-1',
  });
}
