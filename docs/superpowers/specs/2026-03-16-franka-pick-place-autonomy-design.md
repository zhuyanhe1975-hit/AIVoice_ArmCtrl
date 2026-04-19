# Franka Panda Autonomous Control Design

## 1. Goal

Build a first-version end-to-end closed loop for Franka Panda pick-and-place in MuJoCo:

`task scenario -> AI analysis -> controller blueprint -> parameter optimization -> simulation evaluation -> best result`

The system should autonomously analyze task requirements, choose a controller template from a constrained library, optimize parameters across multiple simulation runs, and emit detailed logs that support automatic troubleshooting and later refinement.

## 2. Scope

### In scope

- Franka Panda as the only robot target
- Pick-and-place task using the existing cube and tray scene
- AI-led decision layer for requirement analysis, controller selection, and optimization guidance
- Constrained controller-template library instead of free-form generated control code
- Multi-round parameter optimization in simulation
- Structured logging for design, execution, evaluation, and failure analysis
- UI support for launching the flow and inspecting results

### Out of scope for v1

- Multi-robot support
- Real robot deployment
- Arbitrary natural-language task decomposition beyond pick-and-place
- Free-form control code generation
- Vision-based object detection or scene reconstruction

## 3. Product Definition

The user provides a pick-and-place scenario. The system transforms it into a structured autonomy pipeline:

1. Analyze task intent and convert it into a weighted performance profile.
2. Decompose the task into execution stages.
3. Select the best controller template for the scenario.
4. Generate initial parameters within safe bounds.
5. Run simulation, collect metrics, classify failures, and log all critical events.
6. Iterate optimization until a budget or stopping condition is reached.
7. Present the chosen controller, optimized parameters, performance history, and diagnostic logs.

## 4. Architecture

### 4.1 Layered architecture

The system is organized into four layers:

- Scenario Layer
  Accepts structured task input for pick-and-place.
- Decision Layer
  Uses AI to analyze requirements, select controller templates, and guide optimization.
- Execution Layer
  Runs IK, stage planning, controller instantiation, safety validation, and MuJoCo stepping.
- Evaluation Layer
  Computes metrics, detects failures, scores trials, and emits optimization feedback.

### 4.2 Core closed loop

`TaskScenario -> PerformanceProfile -> ControllerBlueprint -> ExecutionPlan -> SimulationTrial -> EvaluationReport -> OptimizationDecision`

## 5. Functional Modules

### 5.1 Task Scenario Manager

Responsibility:

- Accept a structured pick-and-place scenario
- Normalize user input into a stable internal schema
- Provide defaults for object identity, source pose, target pose, time budget, and preference weights

### 5.2 AI Decision Engine

Responsibility:

- Infer performance priorities from the scenario
- Choose a controller template from the registry
- Generate stage-aware initial parameters
- Interpret trial history and recommend the next optimization direction

Constraints:

- May not produce executable control code
- Must emit schema-validated structured outputs only
- Must include rationale for controller selection and optimization changes

### 5.3 Controller Template Registry

Responsibility:

- Maintain an allowlist of supported controller families
- Define parameter schemas, default values, and hard bounds
- Instantiate execution-ready controller configs from AI-selected blueprints

Initial template candidates:

- Joint-space PD
- Stage-wise PD with per-stage gains
- Joint-space impedance-like controller
- Hybrid tracking controller with different gains for approach, grasp, transfer, and place

### 5.4 Task Execution Planner

Responsibility:

- Convert pick-and-place into explicit stages
- Resolve stage target poses and target joint states through IK
- Handle stage transitions and termination conditions

Default stages:

- approach
- align
- descend
- grasp
- lift
- transfer
- place
- retreat

### 5.5 Simulation Runner

Responsibility:

- Reset the MuJoCo world
- Apply controller parameters safely
- Drive the simulation for one trial
- Stream logs and metrics throughout execution

### 5.6 Metrics Evaluator

Responsibility:

- Compute task-level and stage-level metrics
- Classify failure types
- Produce a normalized score for optimization

Primary metrics:

- taskSuccess
- graspSuccess
- placeSuccess
- totalTime
- stageCompletionTime
- finalPoseError
- jointTrackingError
- energyConsumption
- controlSmoothness
- collisionCount
- objectDropCount
- timeout

### 5.7 Optimization Manager

Responsibility:

- Own trial budget, stopping conditions, and best-result tracking
- Combine AI suggestions with bounded parameter updates
- Persist optimization history for UI and diagnostics

## 6. Data Model

### 6.1 TaskScenario

- `taskId`
- `description`
- `objectName`
- `sourcePose`
- `targetPose`
- `constraints`
- `preferences`

### 6.2 PerformanceProfile

- `speedWeight`
- `accuracyWeight`
- `energyWeight`
- `stabilityWeight`
- `safetyWeight`
- `targetThresholds`
- `analysisRationale`

### 6.3 ControllerBlueprint

- `templateId`
- `controllerMode`
- `stageConfigs`
- `initialParameters`
- `parameterBounds`
- `selectionRationale`

### 6.4 ExecutionPlan

- `stages`
- `targetPoses`
- `targetQpos`
- `gripperCommands`
- `transitionRules`

### 6.5 EvaluationReport

- `trialId`
- `success`
- `score`
- `metrics`
- `stageReports`
- `failureType`
- `failureSummary`
- `optimizationHints`

### 6.6 OptimizationSession

- `sessionId`
- `scenario`
- `performanceProfile`
- `controllerBlueprint`
- `trials`
- `bestTrial`
- `status`

## 7. Logging and Diagnostics

Logging is a first-class feature in v1, not an afterthought.

### 7.1 Logging goals

- Record enough detail to reconstruct each trial
- Support automated failure diagnosis
- Feed optimization with structured observations instead of raw console noise
- Surface meaningful progress and errors in the UI

### 7.2 Event categories

- `scenario.received`
- `analysis.started`
- `analysis.completed`
- `controller.selected`
- `controller.validation_failed`
- `execution.plan_built`
- `trial.started`
- `trial.stage_started`
- `trial.stage_completed`
- `trial.metric_sampled`
- `trial.failure_detected`
- `trial.completed`
- `optimization.iteration_started`
- `optimization.iteration_completed`
- `optimization.best_updated`
- `diagnostics.generated`

### 7.3 Log structure

Each log entry should include:

- `id`
- `timestamp`
- `level`
- `source`
- `eventType`
- `sessionId`
- `trialId`
- `stage`
- `message`
- `data`

### 7.4 Diagnostic rules

The system should derive structured diagnoses from logs and metrics, for example:

- repeated overshoot during approach -> reduce proportional gain or increase damping
- long settle time with low control energy -> increase aggressiveness
- successful grasp but drop during transfer -> increase holding force or reduce transfer acceleration
- repeated IK failure at descend -> adjust approach pose or stage offsets
- collision spikes near tray -> soften final placement gains

### 7.5 Persistence model

For v1, logs can remain in in-memory session storage for UI display, but the architecture should allow later export to file or backend storage.

## 8. Safety Model

The execution layer must remain authoritative.

Safety requirements:

- AI can only select from registered controller templates
- Parameter values must be clamped to template-defined bounds
- Invalid controller blueprints must fail fast before simulation
- Joint and actuator commands must respect safe ranges
- Stage timeouts must terminate unstable runs
- Failure conditions must stop the current trial and emit structured diagnostics

## 9. Error Handling

All failures must become structured reports.

Failure classes:

- `PlanningFailure`
- `BlueprintValidationFailure`
- `IKFailure`
- `ExecutionFailure`
- `TaskFailure`
- `SafetyFailure`
- `OptimizationFailure`

Each failure report should include:

- machine-readable type
- human-readable summary
- triggering stage
- relevant metrics and log references
- suggested next actions for optimization

## 10. UI Expectations

The UI should expose:

- task scenario input for pick-and-place
- autonomy run trigger
- selected controller template and rationale
- current optimization iteration and best score
- metrics comparison across trials
- structured log stream
- summarized diagnostic findings

## 11. Testing Strategy

### Unit tests

- controller template validation
- score calculation
- failure classification
- log event normalization
- diagnostic rule generation

### Integration tests

- AI output parsing into `PerformanceProfile`
- controller blueprint validation and instantiation
- execution plan generation from a scenario

### Simulation regression tests

- baseline controller versus optimized controller on a fixed scene
- optimization history records monotonic best-score updates when improvements occur
- trial failures generate diagnostics and logs

### End-to-end validation

- user launches a pick-and-place autonomy run from the UI
- system completes analysis, execution, optimization, and result presentation
- logs explain the main decisions and the final outcome

## 12. Acceptance Criteria

- The user can launch an autonomous Franka Panda pick-and-place run from the app.
- The system generates a structured performance profile and controller blueprint.
- The controller blueprint is selected from a constrained template library only.
- The system performs multi-round simulation optimization.
- The app displays optimization progress, best parameters, and before/after metrics.
- The system emits structured logs across the full autonomy pipeline.
- Failures are converted into structured diagnostic reports that can guide automatic improvement.

## 13. Implementation Notes For This Repository

The current code already contains a useful base:

- `MujocoSim.ts` for simulation stepping, execution loops, and metric monitoring
- `ControlOptimizer.ts` for AI-assisted design and optimization, which should be split by responsibility
- `LogManager.ts` for the base logging facility, which should be extended into structured autonomy logs
- `types.ts` as the initial place to introduce the new schemas

The recommended implementation direction is to move the current code toward domain-oriented modules for scenario management, controller templates, decision logic, execution, evaluation, optimization, and diagnostics while keeping the UI as an orchestration and visualization layer.
