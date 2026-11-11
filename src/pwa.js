import { registerSW } from 'virtual:pwa-register';

/** Updates wait for an explicit click between hands; no mid-round reload. */
export function setupPwa(state, refresh) {
  const update = registerSW({
    immediate: true,
    // First install only: flash a brief "ready for offline" toast, then hide it.
    onOfflineReady() {
      state.ready = true;
      state.readyToast = true;
      refresh();
      setTimeout(() => { state.readyToast = false; refresh(); }, 4000);
    },
    onNeedRefresh() { state.updateAvailable = true; refresh(); },
    onRegisterError() { state.error = true; refresh(); },
    onRegisteredSW(_url, registration) {
      if (registration?.active) { state.ready = true; refresh(); }
      const check = () => registration?.update().catch(() => {});
      state.check = check;
      window.addEventListener('online', check);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });
  state.update = () => update(true);
}
