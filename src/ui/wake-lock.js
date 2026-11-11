/**
 * wake-lock.js — keep the screen from dimming/locking while the app is open.
 *
 * Uses the Screen Wake Lock API (Android Chrome; iPhone Safari 16.4+). The
 * browser drops the lock whenever the app is hidden, so it is re-requested when
 * the app becomes visible again. Requests must follow a user gesture on some
 * browsers, so controls.js also calls syncWakeLock() on taps. Best effort:
 * unsupported or refused simply leaves normal screen timeout.
 */

let wanted = false;
let sentinel = null;
let pending = false;

export function canKeepAwake() {
  return typeof navigator !== 'undefined' && !!navigator.wakeLock?.request;
}

/** Turn the lock on/off to match `want`, re-acquiring it if the browser dropped it. */
export function syncWakeLock(want = wanted) {
  wanted = !!want;
  if (!canKeepAwake()) return;
  if (!wanted) {
    sentinel?.release?.().catch?.(() => {});
    sentinel = null;
    return;
  }
  if ((sentinel && !sentinel.released) || pending) return;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  pending = true;
  navigator.wakeLock
    .request('screen')
    .then((s) => {
      sentinel = s;
      if (!wanted) syncWakeLock(false); // switched off while the request was in flight
    })
    .catch(() => {})
    .finally(() => {
      pending = false;
    });
}

/** Re-acquire after the app comes back to the foreground. Call once at startup. */
export function initWakeLock(want) {
  wanted = !!want;
  if (typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncWakeLock();
  });
  syncWakeLock();
}
