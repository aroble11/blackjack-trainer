import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/render.js', () => ({ render: vi.fn() }));
vi.mock('../src/assets/sound.js', () => ({ sound: {}, unlockAudio: vi.fn(), setMuted: vi.fn() }));
import { mount } from '../src/ui/controls.js';
import { createGame } from '../src/engine/game.js';
import { withRules } from './helpers/rules.js';

function mounted(options = {}) {
  const listeners = {};
  const root = { addEventListener: (name, fn) => { listeners[name] = fn; }, querySelector: () => null };
  const game = createGame(withRules());
  mount(root, game, options);
  const click = (action, value) => listeners.click({ target: { closest: () => ({ dataset: { action, value } }) } });
  return { game, options, click };
}
afterEach(() => vi.unstubAllGlobals());

describe('asynchronous UI lifecycle', () => {
  it('blocks new wagers while saving and installing an update', async () => {
    let saved;
    const update = vi.fn();
    const { game, click } = mounted({ pwa: { update }, persist: () => new Promise(resolve => { saved = resolve; }) });
    click('installUpdate');
    click('chip', '500');
    expect(game.betCents).toBe(0);
    expect(update).not.toHaveBeenCalled();
    saved();
    await Promise.resolve();
    expect(update).toHaveBeenCalledOnce();
    click('chip', '500');
    expect(game.betCents).toBe(0);
  });

  it('allows play again if update installation fails', async () => {
    const { options, click } = mounted({ pwa: { update: () => Promise.reject(new Error('offline')) } });
    click('installUpdate');
    await vi.waitFor(() => expect(options.pwa.error).toBe(true));
    expect(options.pwa.updating).toBe(false);
  });

  it('terminates cancellation, ignores stale worker messages, and clears changed results', () => {
    const workers = [];
    vi.stubGlobal('Worker', class {
      constructor() { workers.push(this); }
      postMessage = vi.fn();
      terminate = vi.fn();
    });
    const { options, click } = mounted();
    click('runSim');
    const old = workers[0];
    old.onmessage({ data: { type: 'progress', completed: 10 } });
    expect(options.ui.sim.progress).toBe(10);
    click('cancelSim');
    expect(old.terminate).toHaveBeenCalledOnce();
    old.onmessage({ data: { type: 'result', result: { stale: true } } });
    expect(options.ui.sim.result).toBeNull();
    click('runSim');
    workers[1].onmessage({ data: { type: 'result', result: { complete: true } } });
    expect(options.ui.sim.result).toEqual({ complete: true });
    click('simSystem', 'flat');
    expect(options.ui.sim.result).toBeNull();
    expect(options.ui.sim.running).toBe(false);
  });
});
