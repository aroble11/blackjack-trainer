/**
 * persist.js — what survives across sessions: the bankroll and settings.
 * A thin, app-specific layer over the IndexedDB key/value store.
 */
import { idbGet, idbSet, idbDel } from './store.js';

const KEY = 'state';

/** @returns {Promise<{bankrollCents:number, settings:object}|null>} */
export async function loadPersisted() {
  return (await idbGet(KEY)) ?? null;
}

export function savePersisted(state) {
  return idbSet(KEY, state);
}

export function clearPersisted() {
  return idbDel(KEY);
}
