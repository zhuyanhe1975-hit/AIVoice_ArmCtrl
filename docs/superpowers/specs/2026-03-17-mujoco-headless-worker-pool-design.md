# MuJoCo Headless Worker Pool Design

## 1. Goal

Increase parameter-optimization throughput by running multiple MuJoCo trials in parallel using headless workers.

Target architecture:

`candidate parameter batch -> worker pool -> parallel MuJoCo headless trials -> aggregated trial results -> next optimization batch`

This work optimizes batch trial throughput, not UI frame rate.

## 2. Problem Statement

The current optimization path evaluates trials serially inside the main app runtime.

Current limitations:

- MuJoCo stepping happens inside the main `requestAnimationFrame` loop
- simulation, IK, rendering, and interaction share the same thread
- optimization evaluates one parameter set at a time
- the machine's multi-core CPU capacity is largely unused during batch optimization

Because parameter optimization is dominated by repeated black-box simulation, the highest-value acceleration is parallel trial execution, not further tuning of the single visible simulation loop.

## 3. Scope

### In scope

- Add a headless MuJoCo worker pool for parameter optimization
- Run multiple trials concurrently across workers
- Keep worker instances warm and reusable across batches
- Separate optimization simulation from the UI-rendered simulation
- Define batch trial request and result contracts
- Add tests for worker-pool scheduling and result aggregation

### Out of scope

- GPU acceleration through MPS or MLX
- Learned surrogate models
- Replacing MuJoCo with another simulator
- Optimizing interactive frame rate of the visible viewer
- Distributed or multi-machine execution

## 4. Architecture

### 4.1 Split runtimes

The system will use two independent simulation runtimes:

- UI Runtime
  Existing `MujocoSim.ts` remains responsible for visible simulation, interaction, and demo playback.
- Optimization Runtime
  A new worker-based headless runtime handles batch trial execution for parameter optimization.

### 4.2 Core components

- `OptimizationManager`
  Produces candidate parameter batches and consumes aggregated trial results.
- `SimulationWorkerPool`
  Owns worker lifecycle, task dispatch, concurrency control, and result collection.
- `HeadlessSimulationWorker`
  Holds one MuJoCo WASM instance, one loaded model, and performs trial execution without rendering.
- `runHeadlessTrial`
  Pure execution logic used inside the worker to reset state, run a plan, and compute result metrics.

## 5. Data Flow

### 5.1 Batch optimization loop

1. The optimizer produces a batch of candidate parameter sets.
2. The worker pool assigns each candidate to an idle worker.
3. Each worker:
   - resets the simulation state
   - applies the controller and parameters
   - runs the pick-and-place execution plan
   - computes metrics and score
   - returns a structured result
4. The main thread aggregates completed results.
5. The optimizer selects the best candidate and decides the next batch.

### 5.2 Runtime separation

The visible simulation is not used for parameter optimization once the worker pool is active.

This avoids:

- UI thread contention
- render overhead during batch search
- state corruption from mixing visible and optimization trials

## 6. Interfaces

### 6.1 Trial request

`TrialRequest`

- `trialId`
- `scenario`
- `controllerBlueprint`
- `parameters`
- `executionPlan`
- `monitoringConfig`

### 6.2 Trial result

`TrialResult`

- `trialId`
- `success`
- `metrics`
- `score`
- `failureType`
- `failureSummary`
- `durationMs`

### 6.3 Pool control messages

- `worker.init`
- `worker.ready`
- `trial.run`
- `trial.result`
- `trial.error`
- `worker.reset`
- `worker.dispose`

## 7. Worker Design

Each worker should:

- load MuJoCo once during initialization
- load the model and scene once if possible
- reuse its local model/data objects across trials by resetting state
- avoid any DOM, Three.js, or rendering dependency

Each worker must be isolated:

- no shared mutable MuJoCo state between workers
- no cross-worker trial contamination
- each trial starts from a deterministic reset point

## 8. Concurrency Strategy

The pool size should be fixed and conservative by default.

Recommended initial strategy:

- derive logical CPU count from browser capabilities if available
- reserve some capacity for the UI and browser
- default to a modest worker count such as `max(2, cpuCount - 2)` with an upper bound

The first implementation should prefer predictable throughput over aggressively saturating the machine.

## 9. Required Refactoring

To support headless worker execution, some logic currently coupled to the visible simulation path must be separated.

Expected refactors:

- isolate execution-plan running logic from render-loop concerns
- isolate metric collection from visible scene updates
- ensure controller execution can run without Three.js objects
- keep `MujocoSim.ts` as the UI facade, not the optimization engine

## 10. Error Handling

- if a worker fails initialization, the pool should replace or disable it
- if a trial crashes, the worker should report `trial.error` and return to a known-good state
- if a worker becomes unhealthy, the pool should recycle it
- if pool creation fails entirely, optimization may fall back to serial execution with a clear warning

## 11. Testing Strategy

- unit tests for worker-pool scheduling
- unit tests for trial result aggregation
- unit tests for request/result message shapes
- regression tests that optimization can submit a batch rather than one serial evaluation
- smoke verification that headless trials do not depend on rendering

## 12. Success Criteria

This work is successful when:

- parameter optimization no longer depends on the visible simulation loop
- multiple trials run concurrently
- throughput improves on multi-core Macs
- the UI remains responsive during optimization
- trial results remain deterministic and bounded by the same controller constraints as before

## 13. Risks

- `mujoco-js` worker compatibility may require adaptation
- WASM asset loading inside workers may differ from the current main-thread path
- initialization overhead may erase gains if workers are not reused
- some existing execution code may still assume visible-scene objects

## 14. Rollout Strategy

1. Build a single headless worker trial runner
2. Add a reusable worker pool
3. Batch-submit parameter candidates
4. Compare throughput against current serial optimization
5. Keep the UI runtime untouched except for optimization orchestration
