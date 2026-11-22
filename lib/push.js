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
