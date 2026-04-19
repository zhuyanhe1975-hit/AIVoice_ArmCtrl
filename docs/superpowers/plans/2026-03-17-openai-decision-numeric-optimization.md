# OpenAI Decision And Numeric Optimization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Gemini with an OpenAI-backed decision service, restrict the model to controller-design decisions, and move iterative parameter search fully into numeric optimization.

**Architecture:** Add a small server endpoint for OpenAI controller decisions, keep controller selection constrained by the existing registry, and refactor `ControlOptimizer` so optimization no longer calls the model. Frontend code should call the backend for design decisions and continue using the existing simulation and evaluation path for optimization.

**Tech Stack:** TypeScript, React, Vite, Node HTTP server, OpenAI API, MuJoCo WASM, Vitest

---

## File Structure

- Modify: `package.json`
  Replace Gemini dependency usage and add any OpenAI/server dependency needed for the backend endpoint.
- Modify: `README.md`
  Update local run instructions and environment variables.
- Modify: `vite.config.ts`
  Remove Gemini-specific env exposure from the frontend build.
- Modify: `App.tsx`
  Stop constructing the optimizer with a frontend API key.
- Modify: `ControlOptimizer.ts`
  Replace direct model SDK usage with backend calls and numeric-only optimization.
- Create: `server/index.ts`
  Start a lightweight local API server for OpenAI-backed controller decisions.
- Create: `server/openaiDecisionService.ts`
  Wrap OpenAI request/response handling and schema normalization.
- Create: `server/controllerDecisionSchema.ts`
  Define request and response validation helpers.
- Modify: `domain/optimization/OptimizationManager.ts`
  Ensure optimization can iterate without any model participation.
- Modify: `types.ts`
  Add any missing request/response types for the new decision endpoint.
- Test: `tests/server/openaiDecisionService.test.ts`
  Verify response normalization and fallback behavior.
- Test: `tests/controlOptimizer/controlOptimizer.test.ts`
  Verify design calls the backend and optimization never calls a model SDK.
- Test: `tests/domain/optimization/optimizationManager.test.ts`
  Verify numeric iteration behavior remains bounded and deterministic.

## Chunk 1: Backend OpenAI Decision Service

### Task 1: Add the failing backend decision-service test

**Files:**
- Create: `tests/server/openaiDecisionService.test.ts`
- Create: `server/openaiDecisionService.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { normalizeControllerDecision } from '../../server/openaiDecisionService';

describe('openaiDecisionService', () => {
  it('normalizes a bounded controller decision payload', () => {
    const decision = normalizeControllerDecision({
      templateId: 'joint_pd',
      optimizableParameters: ['kp', 'kd'],
      initialParameters: { kp: 20, kd: 5 },
      parameterBounds: {
        kp: { min: 1, max: 100 },
        kd: { min: 0, max: 50 }
      },
      selectionRationale: 'stable default'
    });

    expect(decision.templateId).toBe('joint_pd');
    expect(decision.optimizableParameters).toEqual(['kp', 'kd']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/server/openaiDecisionService.test.ts`
Expected: FAIL because the service module does not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:

- a normalized controller-decision shape
- strict field presence checks
- parameter list and bounds normalization helpers

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/server/openaiDecisionService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/server/openaiDecisionService.test.ts server/openaiDecisionService.ts
git commit -m "feat: add openai decision service normalization"
```

### Task 2: Add the HTTP endpoint

**Files:**
- Create: `server/index.ts`
- Create: `server/controllerDecisionSchema.ts`
- Test: `tests/server/openaiDecisionService.test.ts`

- [ ] **Step 1: Extend the failing test**

```ts
import { validateControllerDecisionRequest } from '../../server/controllerDecisionSchema';

it('accepts a valid scenario request', () => {
  const result = validateControllerDecisionRequest({
    description: 'pick cube and place into tray'
  });

  expect(result.valid).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/server/openaiDecisionService.test.ts`
Expected: FAIL because request validation does not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:

- request validation helper
- a small POST endpoint for controller decisions
- JSON response formatting for success and error paths

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/server/openaiDecisionService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/index.ts server/controllerDecisionSchema.ts tests/server/openaiDecisionService.test.ts
git commit -m "feat: add controller decision endpoint"
```

## Chunk 2: Frontend And Optimizer Migration

### Task 3: Refactor `ControlOptimizer` design flow to call the backend

**Files:**
- Modify: `ControlOptimizer.ts`
- Modify: `types.ts`
- Test: `tests/controlOptimizer/controlOptimizer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { ControlOptimizer } from '../../ControlOptimizer';

describe('ControlOptimizer design flow', () => {
  it('requests a controller blueprint from the backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        templateId: 'joint_pd',
        optimizableParameters: ['kp'],
        initialParameters: { kp: 20 },
        parameterBounds: { kp: { min: 1, max: 100 } },
        selectionRationale: 'safe default'
      })
    });

    const optimizer = new ControlOptimizer(fetchMock as unknown as typeof fetch);
    await optimizer.designAlgorithm({
      description: 'pick and place',
      taskType: 'pick_and_place',
      requirements: { speed: 0.5, accuracy: 0.8, efficiency: 0.4, robustness: 0.7 }
    } as any);

    expect(fetchMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/controlOptimizer/controlOptimizer.test.ts`
Expected: FAIL because `ControlOptimizer` still expects Gemini configuration

- [ ] **Step 3: Write minimal implementation**

Implement:

- constructor injection for `fetch`
- backend request helper
- design response mapping into the existing blueprint flow

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/controlOptimizer/controlOptimizer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ControlOptimizer.ts types.ts tests/controlOptimizer/controlOptimizer.test.ts
git commit -m "refactor: move controller design to backend service"
```

### Task 4: Remove model-driven optimization

**Files:**
- Modify: `ControlOptimizer.ts`
- Modify: `domain/optimization/OptimizationManager.ts`
- Test: `tests/controlOptimizer/controlOptimizer.test.ts`
- Test: `tests/domain/optimization/optimizationManager.test.ts`

- [ ] **Step 1: Extend the failing tests**

```ts
it('optimizes without any model call', async () => {
  const fetchMock = vi.fn();
  const optimizer = new ControlOptimizer(fetchMock as unknown as typeof fetch);

  // arrange fake algorithm and simulation here

  expect(fetchMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/controlOptimizer/controlOptimizer.test.ts tests/domain/optimization/optimizationManager.test.ts`
Expected: FAIL because optimization still contains Gemini logic

- [ ] **Step 3: Write minimal implementation**

Implement:

- removal of all per-iteration model prompts
- numeric-only candidate updates inside optimization
- clearer separation between diagnostics generation and parameter updates

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/controlOptimizer/controlOptimizer.test.ts tests/domain/optimization/optimizationManager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ControlOptimizer.ts domain/optimization/OptimizationManager.ts tests/controlOptimizer/controlOptimizer.test.ts tests/domain/optimization/optimizationManager.test.ts
git commit -m "refactor: remove model-driven parameter optimization"
```

## Chunk 3: App Configuration And Documentation

### Task 5: Remove Gemini frontend configuration

**Files:**
- Modify: `App.tsx`
- Modify: `vite.config.ts`
- Modify: `package.json`
- Test: `tests/controlOptimizer/controlOptimizer.test.ts`

- [ ] **Step 1: Add or extend the failing test**

```ts
it('constructs the optimizer without a frontend API key', () => {
  const optimizer = new ControlOptimizer(fetch);
  expect(optimizer).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/controlOptimizer/controlOptimizer.test.ts`
Expected: FAIL because the app and optimizer still depend on Gemini key wiring

- [ ] **Step 3: Write minimal implementation**

Implement:

- removal of `process.env.GEMINI_API_KEY` from frontend setup
- dependency updates from Gemini to OpenAI/server usage
- app wiring that passes `fetch` instead of an API key

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/controlOptimizer/controlOptimizer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add App.tsx vite.config.ts package.json tests/controlOptimizer/controlOptimizer.test.ts
git commit -m "chore: remove gemini frontend wiring"
```

### Task 6: Update docs and startup instructions

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write the failing doc expectation**

Manual check:

- README should mention `OPENAI_API_KEY`
- README should explain how to run the local backend
- README should no longer mention Gemini

- [ ] **Step 2: Update the README**

Add:

- local server startup instructions
- environment variable setup for OpenAI
- short explanation of the new responsibility split

- [ ] **Step 3: Verify the README**

Run: `rg -n "Gemini|GEMINI" README.md`
Expected: no matches

Run: `rg -n "OPENAI_API_KEY|server" README.md`
Expected: matching setup instructions

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update setup for openai decision service"
```

## Chunk 4: End-to-End Verification

### Task 7: Run the relevant test suite and lint checks

**Files:**
- Test: `tests/server/openaiDecisionService.test.ts`
- Test: `tests/controlOptimizer/controlOptimizer.test.ts`
- Test: `tests/domain/optimization/optimizationManager.test.ts`

- [ ] **Step 1: Run targeted tests**

Run: `npm test -- --run tests/server/openaiDecisionService.test.ts tests/controlOptimizer/controlOptimizer.test.ts tests/domain/optimization/optimizationManager.test.ts`
Expected: PASS

- [ ] **Step 2: Run type checking**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Smoke-check codebase references**

Run: `rg -n "Gemini|GEMINI|@google/genai" .`
Expected: no source-code matches outside historical docs or lockfile entries that are intentionally pending cleanup

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: migrate autonomy decision layer to openai"
```
