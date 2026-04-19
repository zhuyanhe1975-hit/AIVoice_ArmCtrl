import { createWorkerReadyMessage } from '../domain/optimization/workerProtocol';
import { runHeadlessTrial, type HeadlessTrialRuntime } from '../domain/optimization/runHeadlessTrial';
import type { HeadlessWorkerIncomingMessage, HeadlessWorkerOutgoingMessage } from '../types';
import { createHeadlessSimulationRuntime } from './createHeadlessSimulationRuntime';

let runtimePromise: Promise<HeadlessTrialRuntime> | null = null;

function postMessageToMainThread(message: HeadlessWorkerOutgoingMessage) {
  postMessage(message);
}

self.onmessage = async (event: MessageEvent<HeadlessWorkerIncomingMessage>) => {
  if (event.data.type === 'worker.init') {
    runtimePromise ??= createHeadlessSimulationRuntime();
    await runtimePromise;
    postMessageToMainThread(createWorkerReadyMessage());
    return;
  }

  if (event.data.type !== 'trial.run') {
    return;
  }

  try {
    const runtime = await (runtimePromise ??= createHeadlessSimulationRuntime());
    const result = await runHeadlessTrial(runtime, event.data.payload);
    postMessageToMainThread({
      type: 'trial.result',
      payload: result,
    });
  } catch (error) {
    postMessageToMainThread({
      type: 'trial.error',
      payload: {
        trialId: event.data.payload.trialId,
        error: error instanceof Error ? error.message : 'Unknown headless trial error',
      },
    });
  }
};
