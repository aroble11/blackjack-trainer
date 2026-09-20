import { runSimulationBatches } from './simulator.js';

self.onmessage = ({ data }) => {
  try {
    const batches = runSimulationBatches(data.rules, data.options);
    let step;
    let lastProgress = 0;
    do {
      step = batches.next();
      if (!step.done && performance.now() - lastProgress >= 100) {
        self.postMessage({ type: 'progress', completed: step.value });
        lastProgress = performance.now();
      }
    } while (!step.done);
    self.postMessage({ type: 'result', result: step.value });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
