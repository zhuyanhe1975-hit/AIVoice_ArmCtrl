# Franka Panda Pick-and-Place Autonomy Codebase Documentation

This project implements a closed-loop autonomy demo for a Franka Panda robot in MuJoCo.

The current architecture is:

`task scenario -> OpenAI-backed decision service -> controller blueprint -> numeric optimization -> simulation evaluation -> best controller parameters`

The language model is only responsible for bounded controller-design decisions. Iterative parameter search is handled by numeric optimization inside the app.

## System Architecture

1. **Frontend (React)**
   Runs the UI, starts autonomy runs, displays optimization progress, and visualizes logs.
2. **Simulation (MuJoCo WASM + Three.js)**
   Executes the robot, scene physics, IK-based stage planning, and trial evaluation.
3. **Decision Service (local Node server + OpenAI)**
   Accepts a task scenario and returns a structured controller decision payload.
4. **Autonomy Domain Modules**
   Convert the scenario into a performance profile, validate controller blueprints, instantiate controllers, score trials, and generate diagnostics.
5. **Numeric Optimization Loop**
   Updates controller parameters across repeated simulation trials without asking the model for per-iteration suggestions.

---

## File Structure And Responsibilities

### App And UI

- **`index.tsx`**: Application entry point.
- **`App.tsx`**: Main app controller.
  - Initializes MuJoCo.
  - Creates `ControlOptimizer` with `fetch`.
  - Runs design, execution, and optimization flows from the UI.
- **`components/UnifiedSidebar.tsx`**: Main autonomy control panel.
- **`components/SystemLogs.tsx`**: Displays structured autonomy logs.
- **`components/Toolbar.tsx`**: Playback, reset, and display controls.
- **`components/RobotSelector.tsx`**: Robot status and overlay controls.

### Decision Layer

- **`server/index.ts`**: Lightweight local HTTP server exposing `/api/decision/controller-blueprint`.
- **`server/openaiDecisionService.ts`**: Calls OpenAI or falls back to a safe local decision when no key is configured.
- **`server/controllerDecisionSchema.ts`**: Validates incoming decision requests.
- **`ControlOptimizer.ts`**: Orchestrates controller design and numeric optimization.
  - Requests a controller decision from the backend.
  - Falls back to a local heuristic if the backend is unavailable.
  - Validates and instantiates the selected blueprint.
  - Runs bounded numeric optimization over repeated simulation trials.

### Domain Logic

- **`domain/decision/TaskAnalyzer.ts`**: Builds and normalizes the performance profile from a task scenario.
- **`domain/decision/ControllerDesigner.ts`**: Creates a constrained controller blueprint from a registered template.
- **`domain/controllers/controllerTemplates.ts`**: Registry of allowed controller families and parameter bounds.
- **`domain/controllers/validateBlueprint.ts`**: Checks template validity and parameter bounds.
- **`domain/controllers/instantiateController.ts`**: Turns a blueprint into executable controller code and parameters.
- **`domain/optimization/OptimizationManager.ts`**: Scores trials and applies bounded numeric updates.
- **`domain/evaluation/generateDiagnostics.ts`**: Produces structured optimization feedback from metrics and logs.
- **`domain/evaluation/classifyFailure.ts`**: Maps runtime outcomes into failure categories.
- **`domain/execution/buildPickPlacePlan.ts`**: Builds stage-based pick-and-place execution plans.
- **`domain/autonomy/autonomySession.ts`**: Tracks autonomy phase and status messaging.

### Simulation And Robotics

- **`MujocoSim.ts`**: Central simulation orchestrator.
  - Loads the robot scene.
  - Runs simulation and rendering loops.
  - Builds autonomy scenarios.
  - Executes algorithm plans and returns trial metrics.
- **`RenderSystem.ts`**: Three.js rendering and scene synchronization.
- **`IkSystem.ts`**: IK target handling for the arm.
- **`FrankaAnalyticalIK.ts`**: Franka-specific analytical IK solver.
- **`SequenceAnimator.ts`**: Drives stage-based robot motion.
- **`RobotLoader.ts`**: Loads robot assets and MJCF files into the MuJoCo WASM filesystem.

### Shared Types And Logging

- **`types.ts`**: Shared domain and runtime types, including `TaskScenario`, `ControllerBlueprint`, `OptimizationSession`, and decision request/response types.
- **`LogManager.ts`**: Structured log storage for autonomy and optimization events.

### Support Files

- **`vite.config.ts`**: Frontend build config and `/api` proxy to the local decision server.
- **`README.md`**: Local setup instructions for the frontend and OpenAI-backed decision service.
- **`metadata.json`**: App metadata.

---

## Runtime Flow

### 1. Design Phase

1. The UI submits a `TaskScenario`.
2. `ControlOptimizer.ts` posts it to `/api/decision/controller-blueprint`.
3. `server/openaiDecisionService.ts` asks OpenAI for a bounded decision:
   - `templateId`
   - `optimizableParameters`
   - `initialParameters`
   - `parameterBounds`
   - `selectionRationale`
4. The result is normalized and validated against the controller registry.
5. The blueprint is instantiated into an executable controller.

### 2. Execution Phase

1. `MujocoSim.ts` creates an execution scenario and plan.
2. The chosen controller runs through the pick-and-place stages.
3. Metrics such as settling time, energy, and final pose error are collected.

### 3. Optimization Phase

1. `ControlOptimizer.ts` starts with the blueprint's initial parameters.
2. `MujocoSim.ts` evaluates each trial.
3. `domain/optimization/OptimizationManager.ts` scores the trial.
4. `domain/evaluation/generateDiagnostics.ts` produces optimization hints.
5. Parameter updates are applied numerically and clamped to the blueprint bounds.
6. The best-performing parameter set is kept as the session result.

---

## Important Design Constraints

- The model never generates free-form control code.
- The model never performs iterative parameter optimization.
- All controller choices must come from the registered template allowlist.
- All parameter updates stay within hard bounds.
- The frontend does not hold the OpenAI API key.

## Verification Targets

The most important regression surfaces for this codebase are:

- decision-service request and response validation
- `ControlOptimizer` using the backend only during design
- optimization proceeding without any model call
- blueprint validation and controller instantiation
- build, type-check, and targeted optimization tests
