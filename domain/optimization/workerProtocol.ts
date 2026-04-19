import type {
  TrialRequest,
  TrialRunMessage,
  WorkerInitMessage,
  WorkerReadyMessage,
} from '../../types';

export function createWorkerInitMessage(): WorkerInitMessage {
  return {
    type: 'worker.init',
  };
}

export function createTrialRunMessage(payload: TrialRequest): TrialRunMessage {
  return {
    type: 'trial.run',
    payload,
  };
}

export function createWorkerReadyMessage(): WorkerReadyMessage {
  return {
    type: 'worker.ready',
  };
}
