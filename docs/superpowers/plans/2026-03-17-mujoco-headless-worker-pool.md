# MuJoCo Headless Worker Pool Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase parameter-optimization throughput by running MuJoCo trials in parallel through a reusable headless worker pool.

**Architecture:** Keep the current visible `MujocoSim.ts` runtime for UI playback, and add a separate worker-based optimization runtime for batch trial execution. Introduce a typed worker protocol, a single-worker headless trial runner, then a reusable pool, and finally rewire optimization to submit candidate batches instead of serial evaluations.

**Tech Stack:** TypeScript, React, Vite, Web Workers, MuJoCo WASM, Vitest

---

## File Structure

- Modify: `types.ts`
  Add typed worker request/response contracts and headless-trial result shapes.
- Create: `domain/optimization/workerProtocol.ts`
  Shared message types and small helpers for worker communication.
- Create: `domain/optimization/runHeadlessTrial.ts`
  Pure trial-execution function for headless workers.
- Create: `workers/headlessSimulationWorker.ts`
  Worker entrypoint that loads MuJoCo, receives tasks, and returns trial results.
- Create: `domain/optimization/SimulationWorkerPool.ts`
  Pool manager for worker lifecycle, scheduling, and result aggregation.
- Modify: `domain/optimization/OptimizationManager.ts`
  Add batch-oriented result handling helpers if needed.
- Modify: `ControlOptimizer.ts`
  Submit optimization candidates through the worker pool instead of serial evaluation.
- Modify: `MujocoSim.ts`
  Keep UI runtime isolated from optimization-only concerns and expose only reusable plan helpers if needed.
- Modify: `App.tsx`
  Initialize worker-backed optimization cleanly without changing visible simulation flow.
- Test: `tests/domain/optimization/workerProtocol.test.ts`
  Validate message shapes and protocol helpers.
- Test: `tests/domain/optimization/runHeadlessTrial.test.ts`
  Validate headless trial execution behavior with fakes/stubs.
- Test: `tests/domain/optimization/simulationWorkerPool.test.ts`
  Validate scheduling, reuse, and aggregation.
- Test: `tests/controlOptimizer/controlOptimizer.test.ts`
  Validate worker-backed batch optimization integration.

## Chunk 1: Protocol And Trial Types

### Task 1: Add worker protocol tests

**Files:**
- Create: `tests/domain/optimization/workerProtocol.test.ts`
- Create: `domain/optimization/workerProtocol.ts`
- Modify: `types.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { createTrialRunMessage } from '../../../domain/optimization/workerProtocol';

describe('workerProtocol', () => {
  it('creates a typed trial.run message', () => {
    const message = createTrialRunMessage({
      trialId: 'trial-1',
      scenario: { taskId: 's1' } as any,
      controllerBlueprint: { templateId: 'joint_pd' } as any,
      parameters: { blend: 0.3 },
      executionPlan: { stages: [] },
      monitoringConfig: { sampleRate: 1 }
    });

    expect(message.type).toBe('trial.run');
    expect(message.payload.trialId).toBe('trial-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/domain/optimization/workerProtocol.test.ts`
Expected: FAIL because the protocol module does not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:

- worker message unions
- `TrialRequest` and `TrialResult` types
- a small helper such as `createTrialRunMessage`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/domain/optimization/workerProtocol.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add types.ts domain/optimization/workerProtocol.ts tests/domain/optimization/workerProtocol.test.ts
git commit -m "feat: add worker protocol for headless trials"
```

## Chunk 2: Single Headless Trial Runner

### Task 2: Add the headless trial runner test

**Files:**
- Create: `tests/domain/optimization/runHeadlessTrial.test.ts`
- Create: `domain/optimization/runHeadlessTrial.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { runHeadlessTrial } from '../../../domain/optimization/runHeadlessTrial';

describe('runHeadlessTrial', () => {
  it('resets state, executes one trial, and returns a score', async () => {
    const runtime = {
      reset: vi.fn(),
      execute: vi.fn().mockResolvedValue({
        success: true,
        metrics: { totalTime: 4, energyConsumption: 10, finalPoseError: 0.02, collisionCount: 0 }
      })
    };

    const result = await runHeadlessTrial(runtime as any, {
      trialId: 'trial-1',
      scenario: {} as any,
      controllerBlueprint: {} as any,
      parameters: { blend: 0.3 },
      executionPlan: { stages: [] },
      monitoringConfig: { sampleRate: 1 }
    });

    expect(runtime.reset).toHaveBeenCalled();
    expect(result.trialId).toBe('trial-1');
    expect(result.score).toBeTypeOf('number');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/domain/optimization/runHeadlessTrial.test.ts`
Expected: FAIL because the runner module does not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:

- a headless runtime interface
- state reset before each trial
- scoring through the existing optimization scoring rules
- structured `TrialResult`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/domain/optimization/runHeadlessTrial.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add domain/optimization/runHeadlessTrial.ts tests/domain/optimization/runHeadlessTrial.test.ts
git commit -m "feat: add single headless trial runner"
```

### Task 3: Add the worker entrypoint

**Files:**
- Create: `workers/headlessSimulationWorker.ts`
- Modify: `domain/optimization/workerProtocol.ts`
- Test: `tests/domain/optimization/runHeadlessTrial.test.ts`

- [ ] **Step 1: Extend the failing test**

```ts
import { createWorkerReadyMessage } from '../../../domain/optimization/workerProtocol';

it('creates a worker.ready message', () => {
  expect(createWorkerReadyMessage().type).toBe('worker.ready');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/domain/optimization/workerProtocol.test.ts tests/domain/optimization/runHeadlessTrial.test.ts`
Expected: FAIL because worker lifecycle messages do not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:

- worker init/ready/result/error messages
- a worker entrypoint that wires `onmessage` to `runHeadlessTrial`
- no rendering or DOM access inside the worker

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/domain/optimization/workerProtocol.test.ts tests/domain/optimization/runHeadlessTrial.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add workers/headlessSimulationWorker.ts domain/optimization/workerProtocol.ts tests/domain/optimization/workerProtocol.test.ts tests/domain/optimization/runHeadlessTrial.test.ts
git commit -m "feat: add headless simulation worker entrypoint"
```

## Chunk 3: Worker Pool Scheduling

### Task 4: Add the worker-pool scheduling test

**Files:**
- Create: `tests/domain/optimization/simulationWorkerPool.test.ts`
- Create: `domain/optimization/SimulationWorkerPool.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { SimulationWorkerPool } from '../../../domain/optimization/SimulationWorkerPool';

describe('SimulationWorkerPool', () => {
  it('dispatches queued trials across idle workers', async () => {
    const workerFactory = vi.fn(() => ({
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null
    }));

    const pool = new SimulationWorkerPool({ size: 2, workerFactory: workerFactory as any });

    expect(workerFactory).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/domain/optimization/simulationWorkerPool.test.ts`
Expected: FAIL because the pool module does not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:

- fixed-size pool creation
- idle/busy worker bookkeeping
- trial queueing
- promise-based result resolution

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/domain/optimization/simulationWorkerPool.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add domain/optimization/SimulationWorkerPool.ts tests/domain/optimization/simulationWorkerPool.test.ts
git commit -m "feat: add headless simulation worker pool"
```

### Task 5: Add batch result aggregation

**Files:**
- Modify: `domain/optimization/OptimizationManager.ts`
- Test: `tests/domain/optimization/simulationWorkerPool.test.ts`
- Test: `tests/domain/optimization/optimizationManager.test.ts`

- [ ] **Step 1: Extend the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { selectBestTrialResult } from '../../../domain/optimization/OptimizationManager';

it('selects the highest-scoring trial result from a batch', () => {
  const best = selectBestTrialResult([
    { trialId: 'a', score: 10 },
    { trialId: 'b', score: 20 }
  ] as any);

  expect(best?.trialId).toBe('b');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/domain/optimization/simulationWorkerPool.test.ts tests/domain/optimization/optimizationManager.test.ts`
Expected: FAIL because batch aggregation helpers do not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:

- a best-result selector
- any small aggregation helpers needed by the pool-backed optimizer
- no change to scoring rules themselves

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/domain/optimization/simulationWorkerPool.test.ts tests/domain/optimization/optimizationManager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add domain/optimization/OptimizationManager.ts tests/domain/optimization/simulationWorkerPool.test.ts tests/domain/optimization/optimizationManager.test.ts
git commit -m "feat: add batch optimization aggregation helpers"
```

## Chunk 4: Integrate Pool-Backed Optimization

### Task 6: Rewire `ControlOptimizer` to batch-submit candidates

**Files:**
- Modify: `ControlOptimizer.ts`
- Modify: `App.tsx`
- Test: `tests/controlOptimizer/controlOptimizer.test.ts`

- [ ] **Step 1: Extend the failing test**

```ts
it('submits optimization candidates through the worker pool', async () => {
  const pool = {
    runBatch: vi.fn().mockResolvedValue([
      { trialId: 'trial-1', score: 10, success: true, metrics: {} }
    ])
  };

  const optimizer = new ControlOptimizer(fetch, pool as any);
  await optimizer.optimize({} as any, {
    id: 'algo-1',
    name: 'joint_pd',
    description: 'test',
    code: 'return;',
    parameters: { blend: 0.3 },
    performanceMetrics: {}
  }, () => undefined);

  expect(pool.runBatch).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/controlOptimizer/controlOptimizer.test.ts`
Expected: FAIL because `ControlOptimizer` still optimizes serially

- [ ] **Step 3: Write minimal implementation**

Implement:

- constructor injection for the worker pool
- batch candidate submission
- best-result selection from returned trial results
- retention of current logging and bounded parameter rules

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/controlOptimizer/controlOptimizer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ControlOptimizer.ts App.tsx tests/controlOptimizer/controlOptimizer.test.ts
git commit -m "refactor: move optimization onto headless worker pool"
```

### Task 7: Final verification

**Files:**
- Test: `tests/domain/optimization/workerProtocol.test.ts`
- Test: `tests/domain/optimization/runHeadlessTrial.test.ts`
- Test: `tests/domain/optimization/simulationWorkerPool.test.ts`
- Test: `tests/domain/optimization/optimizationManager.test.ts`
- Test: `tests/controlOptimizer/controlOptimizer.test.ts`

- [ ] **Step 1: Run the targeted suite**

Run: `npm test -- --run tests/domain/optimization/workerProtocol.test.ts tests/domain/optimization/runHeadlessTrial.test.ts tests/domain/optimization/simulationWorkerPool.test.ts tests/domain/optimization/optimizationManager.test.ts tests/controlOptimizer/controlOptimizer.test.ts`
Expected: PASS

- [ ] **Step 2: Run type checking**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: add mujoco headless worker pool optimization"
```
