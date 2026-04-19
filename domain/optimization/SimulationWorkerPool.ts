import type {
  HeadlessWorkerOutgoingMessage,
  TrialRequest,
  TrialResult,
  TrialResultMessage,
} from '../../types';
import { createTrialRunMessage, createWorkerInitMessage } from './workerProtocol';

interface PoolWorker {
  worker: Worker;
  busy: boolean;
  ready: boolean;
  currentTrialId?: string;
}

export interface SimulationWorkerPoolOptions {
  size: number;
  workerFactory?: () => Worker;
}

export class SimulationWorkerPool {
  private readonly workers: PoolWorker[];
  private readonly queue: TrialRequest[] = [];
  private readonly pending = new Map<
    string,
    { resolve: (result: TrialResult) => void; reject: (error: Error) => void }
  >();

  constructor(private readonly options: SimulationWorkerPoolOptions) {
    const workerFactory =
      options.workerFactory ??
      (() => new Worker(new URL('../../workers/headlessSimulationWorker.ts', import.meta.url), { type: 'module' }));

    this.workers = Array.from({ length: options.size }, () => {
      const worker = workerFactory();
      const entry: PoolWorker = { worker, busy: false, ready: false };
      worker.onmessage = (event: MessageEvent<HeadlessWorkerOutgoingMessage>) => {
        this.handleMessage(entry, event.data);
      };
      worker.postMessage(createWorkerInitMessage());
      return entry;
    });
  }

  async runBatch(requests: TrialRequest[]): Promise<TrialResult[]> {
    return Promise.all(requests.map((request) => this.runTrial(request)));
  }

  async dispose(): Promise<void> {
    this.workers.forEach(({ worker }) => worker.terminate());
  }

  private runTrial(request: TrialRequest): Promise<TrialResult> {
    return new Promise<TrialResult>((resolve, reject) => {
      this.pending.set(request.trialId, { resolve, reject });
      this.queue.push(request);
      this.dispatch();
    });
  }

  private dispatch() {
    for (const entry of this.workers) {
      if (entry.busy || !entry.ready) continue;
      const nextRequest = this.queue.shift();
      if (!nextRequest) return;

      entry.busy = true;
      entry.currentTrialId = nextRequest.trialId;
      entry.worker.postMessage(createTrialRunMessage(nextRequest));
    }
  }

  private handleMessage(entry: PoolWorker, message: HeadlessWorkerOutgoingMessage) {
    if (message.type === 'worker.ready') {
      entry.ready = true;
      this.dispatch();
      return;
    }

    if (message.type === 'trial.result') {
      this.resolveTrial(entry, message);
      return;
    }

    if (message.type === 'trial.error') {
      const pending = this.pending.get(message.payload.trialId);
      if (pending) {
        pending.reject(new Error(message.payload.error));
        this.pending.delete(message.payload.trialId);
      }
      entry.busy = false;
      entry.currentTrialId = undefined;
      this.dispatch();
    }
  }

  private resolveTrial(entry: PoolWorker, message: TrialResultMessage) {
    const pending = this.pending.get(message.payload.trialId);
    if (pending) {
      pending.resolve(message.payload);
      this.pending.delete(message.payload.trialId);
    }

    entry.busy = false;
    entry.currentTrialId = undefined;
    this.dispatch();
  }
}
