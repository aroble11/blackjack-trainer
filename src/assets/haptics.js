/**
 * haptics.js — short vibration cues alongside the sound effects.
 *
 * Uses navigator.vibrate, which Android browsers support and iPhone Safari does
 * not (there it is simply absent, and the Settings switch shows as
 * unsupported). Like sound.js, every call is wrapped so a failure can never
 * break play.
 */

let enabled = true;

export function setVibration(value) {
  enabled = !!value;
}

export function canVibrate() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

function buzz(pattern) {
  if (!enabled || !canVibrate()) return;
  // Browsers block (and log an error for) vibration before the first real tap.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

export const haptic = {
  tap: () => buzz(8), // chip, insurance choice
  card: () => buzz(12), // a card lands
  win: () => buzz([25, 60, 25]),
  lose: () => buzz(45),
  push: () => buzz(15),
};
