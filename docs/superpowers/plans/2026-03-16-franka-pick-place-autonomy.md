# Franka Pick-and-Place Autonomy Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first-version end-to-end autonomous pick-and-place loop for Franka Panda that analyzes the task, selects a constrained controller template, optimizes parameters in MuJoCo, and records structured logs for diagnostics.

**Architecture:** Extend the current demo into a layered autonomy pipeline. Keep MuJoCo execution in `MujocoSim.ts`, move AI decision-making and optimization into domain modules, replace free-form control generation with a template registry, and make structured logs a first-class cross-cutting capability.

**Tech Stack:** TypeScript, React, MuJoCo WASM, Three.js, existing Google GenAI client, Vite

---

## Chunk 1: Domain Models And Structured Logging

### Task 1: Expand shared domain types

**Files:**
- Modify: `types.ts`
- Test: `tests/types/autonomy-types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import type { AutonomyLog, ControllerBlueprint, PerformanceProfile } from '../../types';

describe('autonomy types', () => {
  it('supports structured controller and logging shapes', () => {
    const profile: PerformanceProfile = {
      speedWeight: 0.3,
      accuracyWeight: 0.3,
      energyWeight: 0.1,
      stabilityWeight: 0.2,
      safetyWeight: 0.1,
      targetThresholds: {},
      analysisRationale: 'favor stable grasp'
    };

    const blueprint: ControllerBlueprint = {
      templateId: 'joint_pd',
      controllerMode: 'stagewise',
      stageConfigs: [],
      initialParameters: { kp: 20, kd: 5 },
      parameterBounds: { kp: { min: 1, max: 100 }, kd: { min: 0, max: 50 } },
      selectionRationale: 'stable default'
    };

    const log: AutonomyLog = {
      id: 'log1',
      timestamp: Date.now(),
      level: 'info',
      source: 'OptimizationManager',
      eventType: 'trial.started',
      sessionId: 'session1',
      message: 'Trial started'
    };

    expect(profile.analysisRationale).toContain('stable');
    expect(blueprint.templateId).toBe('joint_pd');
    expect(log.eventType).toBe('trial.started');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/types/autonomy-types.test.ts`
Expected: FAIL because the new types do not exist yet

- [ ] **Step 3: Write minimal implementation**

Add the new domain interfaces and unions in `types.ts`:

- `TaskScenarioV2`
- `PerformanceProfile`
- `ControllerTemplateId`
- `ControllerBlueprint`
- `ExecutionPlan`
- `EvaluationReport`
- `OptimizationSession`
- `AutonomyLog`
- `FailureType`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/types/autonomy-types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add types.ts tests/types/autonomy-types.test.ts
git commit -m "feat: add autonomy domain types"
```

### Task 2: Upgrade the log manager to structured autonomy logs

**Files:**
- Modify: `LogManager.ts`
- Test: `tests/logging/log-manager.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { logger } from '../../LogManager';

describe('LogManager', () => {
  it('records structured autonomy events', () => {
    logger.clear();
    logger.event('info', {
      source: 'TaskAnalyzer',
      eventType: 'analysis.started',
      sessionId: 's1',
      trialId: 't1',
      message: 'Analyzing task'
    });

    const [log] = logger.getLogs();
    expect(log.eventType).toBe('analysis.started');
    expect(log.sessionId).toBe('s1');
    expect(log.trialId).toBe('t1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/logging/log-manager.test.ts`
Expected: FAIL because `logger.event` and new fields are missing

- [ ] **Step 3: Write minimal implementation**

Add:

- `logger.event(level, payload)` helper
- backward-compatible `info/warn/error/success`
- optional fields like `eventType`, `sessionId`, `trialId`, `stage`
- bounded log retention and normalized timestamps

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/logging/log-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add LogManager.ts tests/logging/log-manager.test.ts
git commit -m "feat: add structured autonomy logging"
```

## Chunk 2: Controller Templates, Validation, And Diagnostics

### Task 3: Add a constrained controller template registry

**Files:**
- Create: `domain/controllers/controllerTemplates.ts`
- Create: `domain/controllers/instantiateController.ts`
- Test: `tests/domain/controllers/controllerTemplates.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { getControllerTemplate, listControllerTemplates } from '../../../domain/controllers/controllerTemplates';

describe('controller templates', () => {
  it('returns registered templates and bounds', () => {
    const templates = listControllerTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(getControllerTemplate('joint_pd')?.parameterBounds.kp.max).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/domain/controllers/controllerTemplates.test.ts`
Expected: FAIL because the registry files do not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:

- a template registry with stable IDs
- safe parameter bounds
- stagewise support
- a controller-instantiation helper that maps a blueprint to execution config

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/domain/controllers/controllerTemplates.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add domain/controllers/controllerTemplates.ts domain/controllers/instantiateController.ts tests/domain/controllers/controllerTemplates.test.ts
git commit -m "feat: add constrained controller registry"
```

### Task 4: Add blueprint validation and failure classification

**Files:**
- Create: `domain/controllers/validateBlueprint.ts`
- Create: `domain/evaluation/classifyFailure.ts`
- Test: `tests/domain/controllers/validateBlueprint.test.ts`
- Test: `tests/domain/evaluation/classifyFailure.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { validateBlueprint } from '../../../domain/controllers/validateBlueprint';

describe('validateBlueprint', () => {
  it('rejects out-of-bound parameters', () => {
    const result = validateBlueprint({
      templateId: 'joint_pd',
      controllerMode: 'stagewise',
      stageConfigs: [],
      initialParameters: { kp: 9999, kd: 1 },
      parameterBounds: { kp: { min: 1, max: 100 }, kd: { min: 0, max: 50 } },
      selectionRationale: 'bad params'
    });

    expect(result.valid).toBe(false);
    expect(result.failureType).toBe('BlueprintValidationFailure');
  });
});
```

```ts
import { describe, expect, it } from 'vitest';
import { classifyFailure } from '../../../domain/evaluation/classifyFailure';

describe('classifyFailure', () => {
  it('marks timeout as task failure', () => {
    const result = classifyFailure({ timeout: true, collisionCount: 0, graspSuccess: false });
    expect(result.type).toBe('TaskFailure');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/domain/controllers/validateBlueprint.test.ts tests/domain/evaluation/classifyFailure.test.ts`
Expected: FAIL because validation and classification logic do not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:

- blueprint validation against registry bounds
- structured validation results
- failure classification from trial metrics and flags

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/domain/controllers/validateBlueprint.test.ts tests/domain/evaluation/classifyFailure.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add domain/controllers/validateBlueprint.ts domain/evaluation/classifyFailure.ts tests/domain/controllers/validateBlueprint.test.ts tests/domain/evaluation/classifyFailure.test.ts
git commit -m "feat: add blueprint validation and failure classification"
```

## Chunk 3: AI Decision Layer

### Task 5: Split `ControlOptimizer.ts` into task analysis and optimization services

**Files:**
- Create: `domain/decision/TaskAnalyzer.ts`
- Create: `domain/optimization/OptimizationManager.ts`
- Modify: `ControlOptimizer.ts`
- Test: `tests/domain/decision/taskAnalyzer.test.ts`
- Test: `tests/domain/optimization/optimizationManager.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { normalizePerformanceProfile } from '../../../domain/decision/TaskAnalyzer';

describe('TaskAnalyzer', () => {
  it('normalizes weights to 1', () => {
    const profile = normalizePerformanceProfile({
      speedWeight: 4,
      accuracyWeight: 3,
      energyWeight: 1,
      stabilityWeight: 1,
      safetyWeight: 1,
      targetThresholds: {},
      analysisRationale: 'fast but safe'
    });

    const sum = profile.speedWeight + profile.accuracyWeight + profile.energyWeight + profile.stabilityWeight + profile.safetyWeight;
    expect(sum).toBeCloseTo(1, 5);
  });
});
```

```ts
import { describe, expect, it } from 'vitest';
import { scoreTrial } from '../../../domain/optimization/OptimizationManager';

describe('OptimizationManager', () => {
  it('scores a successful faster trial above a failed one', () => {
    const good = scoreTrial({ success: true, metrics: { totalTime: 4, energyConsumption: 10, finalPoseError: 0.01, collisionCount: 0 } });
    const bad = scoreTrial({ success: false, metrics: { totalTime: 12, energyConsumption: 30, finalPoseError: 0.2, collisionCount: 2 } });
    expect(good).toBeGreaterThan(bad);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/domain/decision/taskAnalyzer.test.ts tests/domain/optimization/optimizationManager.test.ts`
Expected: FAIL because the new services and helpers do not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:

- structured task analysis prompt/response parsing
- performance-profile normalization
- optimization scoring helper
- optimization history management
- wrapper logic in `ControlOptimizer.ts` to delegate responsibilities

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/domain/decision/taskAnalyzer.test.ts tests/domain/optimization/optimizationManager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add domain/decision/TaskAnalyzer.ts domain/optimization/OptimizationManager.ts ControlOptimizer.ts tests/domain/decision/taskAnalyzer.test.ts tests/domain/optimization/optimizationManager.test.ts
git commit -m "refactor: split analysis and optimization services"
```

### Task 6: Add controller blueprint generation based on the registry

**Files:**
- Create: `domain/decision/ControllerDesigner.ts`
- Test: `tests/domain/decision/controllerDesigner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { ensureRegisteredTemplate } from '../../../domain/decision/ControllerDesigner';

describe('ControllerDesigner', () => {
  it('rejects unregistered templates', () => {
    expect(() => ensureRegisteredTemplate('free_code')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/domain/decision/controllerDesigner.test.ts`
Expected: FAIL because the designer does not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:

- prompt builder that provides only allowed template options
- schema parser for `ControllerBlueprint`
- template-existence guard and fallback selection

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/domain/decision/controllerDesigner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add domain/decision/ControllerDesigner.ts tests/domain/decision/controllerDesigner.test.ts
git commit -m "feat: add constrained controller designer"
```

## Chunk 4: Execution Planning And Simulation Integration

### Task 7: Add explicit pick-and-place execution planning

**Files:**
- Create: `domain/execution/buildPickPlacePlan.ts`
- Test: `tests/domain/execution/buildPickPlacePlan.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildPickPlacePlan } from '../../../domain/execution/buildPickPlacePlan';

describe('buildPickPlacePlan', () => {
  it('creates the default pick-and-place stage sequence', () => {
    const plan = buildPickPlacePlan({
      taskId: 'task1',
      description: 'pick cube and place in tray',
      objectName: 'cube',
      sourcePose: { position: { x: 0.4, y: -0.1, z: 0.02 } },
      targetPose: { position: { x: 0.4, y: 0.2, z: 0.05 } },
      constraints: {},
      preferences: {}
    });

    expect(plan.stages.map(stage => stage.name)).toEqual([
      'approach',
      'align',
      'descend',
      'grasp',
      'lift',
      'transfer',
      'place',
      'retreat'
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/domain/execution/buildPickPlacePlan.test.ts`
Expected: FAIL because the planner does not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement a planner that:

- produces the canonical stage list
- computes pose offsets for approach/lift/retreat
- stores gripper commands and stage transitions

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/domain/execution/buildPickPlacePlan.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add domain/execution/buildPickPlacePlan.ts tests/domain/execution/buildPickPlacePlan.test.ts
git commit -m "feat: add pick-place execution planner"
```

### Task 8: Refactor `MujocoSim.ts` to execute explicit plans and emit trial logs

**Files:**
- Modify: `MujocoSim.ts`
- Test: `tests/sim/mujocoSimExecution.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

describe('MujocoSim execution integration', () => {
  it('exposes a plan-based execution entry point', async () => {
    expect(typeof 'placeholder').toBe('string');
  });
});
```

- [ ] **Step 2: Run test to verify it fails meaningfully**

Run: `npm test -- --run tests/sim/mujocoSimExecution.test.ts`
Expected: FAIL after replacing the placeholder with a real API expectation

- [ ] **Step 3: Write minimal implementation**

Refactor `MujocoSim.ts` to:

- accept an `ExecutionPlan` instead of hard-coded stage arrays
- start and complete stages with structured logging
- collect richer metrics per stage
- stop trials on explicit safety/failure conditions

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/sim/mujocoSimExecution.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add MujocoSim.ts tests/sim/mujocoSimExecution.test.ts
git commit -m "refactor: execute autonomy plans in simulation"
```

## Chunk 5: Diagnostics And Optimization Feedback

### Task 9: Add diagnostic hint generation from logs and metrics

**Files:**
- Create: `domain/evaluation/generateDiagnostics.ts`
- Test: `tests/domain/evaluation/generateDiagnostics.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { generateDiagnostics } from '../../../domain/evaluation/generateDiagnostics';

describe('generateDiagnostics', () => {
  it('suggests reducing aggressiveness after repeated overshoot', () => {
    const result = generateDiagnostics({
      metrics: { overshootCount: 3, settleDelay: 0.5, collisionCount: 0 },
      logs: [
        { eventType: 'trial.failure_detected', message: 'overshoot near object' },
        { eventType: 'trial.failure_detected', message: 'overshoot near object' }
      ]
    });

    expect(result.summary).toContain('overshoot');
    expect(result.recommendations.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/domain/evaluation/generateDiagnostics.test.ts`
Expected: FAIL because the diagnostic generator does not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement rule-based diagnostics that:

- inspect evaluation metrics and recent logs
- produce human-readable summaries
- emit machine-usable optimization hints

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/domain/evaluation/generateDiagnostics.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add domain/evaluation/generateDiagnostics.ts tests/domain/evaluation/generateDiagnostics.test.ts
git commit -m "feat: add simulation diagnostics"
```

### Task 10: Close the optimization loop with diagnostic-informed parameter updates

**Files:**
- Modify: `domain/optimization/OptimizationManager.ts`
- Modify: `ControlOptimizer.ts`
- Test: `tests/domain/optimization/optimizationFeedback.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { applyOptimizationHints } from '../../../domain/optimization/OptimizationManager';

describe('optimization feedback', () => {
  it('reduces kp when overshoot reduction is requested', () => {
    const next = applyOptimizationHints(
      { kp: 30, kd: 5 },
      [{ action: 'reduce_gain', parameter: 'kp', magnitude: 0.2 }]
    );

    expect(next.kp).toBeLessThan(30);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/domain/optimization/optimizationFeedback.test.ts`
Expected: FAIL because hint-based updates do not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:

- bounded parameter update rules
- history-aware best-trial tracking
- integration of diagnostic hints into the next iteration

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/domain/optimization/optimizationFeedback.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add domain/optimization/OptimizationManager.ts ControlOptimizer.ts tests/domain/optimization/optimizationFeedback.test.ts
git commit -m "feat: use diagnostics in optimization loop"
```

## Chunk 6: UI Integration

### Task 11: Extend the sidebar and logs panel for autonomy sessions

**Files:**
- Modify: `components/UnifiedSidebar.tsx`
- Modify: `components/SystemLogs.tsx`
- Modify: `App.tsx`
- Test: `tests/ui/autonomyFlow.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SystemLogs } from '../../components/SystemLogs';

describe('SystemLogs', () => {
  it('can render autonomy event details', () => {
    render(<SystemLogs isDarkMode={false} />);
    expect(screen.getByText(/system logs/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails meaningfully**

Run: `npm test -- --run tests/ui/autonomyFlow.test.tsx`
Expected: FAIL after adding assertions for autonomy-specific content

- [ ] **Step 3: Write minimal implementation**

Update the UI so the user can:

- configure and launch an autonomy session
- inspect selected controller template and rationale
- follow optimization iterations
- view structured logs and diagnostic summaries

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/ui/autonomyFlow.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/UnifiedSidebar.tsx components/SystemLogs.tsx App.tsx tests/ui/autonomyFlow.test.tsx
git commit -m "feat: expose autonomy sessions in the UI"
```

## Chunk 7: End-To-End Verification

### Task 12: Add a reproducible autonomy smoke test and verification notes

**Files:**
- Create: `tests/e2e/autonomy-smoke.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

describe('autonomy smoke test', () => {
  it('keeps the autonomy pipeline entry points wired together', () => {
    expect(true).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/e2e/autonomy-smoke.test.ts`
Expected: FAIL because the smoke assertion is intentionally false

- [ ] **Step 3: Write minimal implementation**

Replace the placeholder with a real smoke test that verifies:

- scenario creation
- task analysis
- controller blueprint generation
- plan creation
- optimization session initialization

Also update `README.md` with the new autonomy flow and logging/debugging notes.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/e2e/autonomy-smoke.test.ts`
Expected: PASS

- [ ] **Step 5: Run broader verification**

Run: `npm test`
Expected: PASS for all implemented tests

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/autonomy-smoke.test.ts README.md
git commit -m "test: add autonomy smoke coverage"
```

Plan complete and saved to `docs/superpowers/plans/2026-03-16-franka-pick-place-autonomy.md`. Ready to execute?
