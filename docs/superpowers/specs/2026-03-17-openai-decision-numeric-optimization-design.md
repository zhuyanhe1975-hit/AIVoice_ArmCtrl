# OpenAI Decision Layer And Numeric Optimization Design

## 1. Goal

Refactor the current autonomy loop so that the language model only makes bounded controller-design decisions, while parameter optimization is handled by a deterministic numeric optimizer.

Target loop:

`task scenario -> OpenAI decision service -> controller blueprint -> numeric optimizer -> simulation evaluation -> best result`

## 2. Problem Statement

The current project still couples two responsibilities inside the AI layer:

- controller-template selection
- iterative parameter optimization

That coupling creates three problems:

- the model is used for continuous numeric search, which is less stable and less reproducible than mature optimizers
- the frontend currently holds the model API key, which is not acceptable for longer-term use
- the migration path from Gemini to ChatGPT/OpenAI is tangled with autonomy behavior changes

## 3. Scope

### In scope

- Replace Gemini with OpenAI for controller-design decisions
- Remove model participation from iterative parameter optimization
- Introduce a server-side decision endpoint for OpenAI calls
- Keep controller selection constrained to the existing template registry
- Keep optimization in the existing execution pipeline, but make it numeric-optimizer driven
- Update configuration and docs from `GEMINI_API_KEY` to `OPENAI_API_KEY`

### Out of scope

- Changing the robot target or task family
- Generating free-form controller code
- Real robot deployment
- Building a production-grade distributed backend
- Expanding beyond the current pick-and-place autonomy flow

## 4. Architecture

### 4.1 Responsibility split

- OpenAI Decision Layer
  Accepts a scenario and returns a structured controller blueprint proposal.
- Numeric Optimization Layer
  Accepts the blueprint, parameter bounds, and objective feedback, then searches the parameter space without consulting the language model.
- Simulation And Evaluation Layer
  Runs MuJoCo trials, computes metrics, scores trials, and returns optimization feedback.

### 4.2 New closed loop

`TaskScenario -> PerformanceProfile -> OpenAIControllerDecision -> ControllerBlueprint -> OptimizationSession -> SimulationTrial -> EvaluationReport`

## 5. Component Design

### 5.1 Server-side OpenAI decision service

Add a small backend endpoint that hides the API key and centralizes model prompting.

Responsibility:

- receive scenario input from the frontend
- call OpenAI with a constrained prompt and JSON schema
- return a validated controller decision payload
- surface structured errors when the model response is invalid

Non-goals:

- no direct optimization logic
- no simulation execution
- no free-form code generation

### 5.2 Controller decision contract

The model response should be limited to bounded design outputs:

- `templateId`
- `optimizableParameters`
- `initialParameters`
- `parameterBounds`
- `selectionRationale`

Rules:

- `templateId` must be one of the registered templates
- parameter names must exist in the chosen template schema
- bounds must stay within hard template limits
- the response must be rejected if it violates any registry constraint

### 5.3 Numeric optimization manager

Refactor optimization so it no longer asks the language model for updates. Instead it should:

- start from the blueprint's initial parameters
- evaluate trials in simulation
- score each trial using the existing evaluation logic
- update candidate parameters through deterministic numeric search
- track best parameters and trial history

For v1 migration, the numeric search can remain a bounded heuristic optimizer if that is what the codebase already supports. The contract should make it easy to replace with a mature optimizer later.

### 5.4 ControlOptimizer responsibility change

`ControlOptimizer` should become an orchestration service, not an AI optimizer.

New role:

- request a controller decision from the OpenAI backend
- validate and instantiate the returned blueprint
- launch numeric optimization with blueprint-defined search space
- collect logs and diagnostics across the full autonomy run

Removed role:

- asking the model for per-iteration parameter updates

## 6. Data Flow

### 6.1 Design phase

1. Frontend submits `TaskScenario`
2. Decision service derives or receives `PerformanceProfile`
3. OpenAI returns a bounded controller decision
4. Registry validation checks template, parameter names, and bounds
5. System materializes a `ControllerBlueprint`

### 6.2 Optimization phase

1. Optimization manager reads `initialParameters` and `parameterBounds`
2. Simulation runner executes a trial
3. Evaluator returns metrics and a score
4. Numeric optimizer proposes the next candidate
5. Best result is persisted in the optimization session

## 7. Error Handling

- If the OpenAI request fails, fall back to a local safe template-selection heuristic
- If the OpenAI payload is schema-valid but registry-invalid, reject it and log validation failure
- If the server endpoint is unavailable, show a design-stage error in the UI and do not start optimization
- If optimization fails mid-run, preserve completed trial history and best-known parameters

## 8. Security And Configuration

- Remove frontend exposure of provider keys
- Store `OPENAI_API_KEY` only on the server side
- Remove `GEMINI_API_KEY` references from build config and docs
- Keep model selection centralized in the server layer so future provider changes are isolated

## 9. Testing Strategy

- unit tests for OpenAI response normalization and validation
- unit tests for numeric optimization iteration without model calls
- integration tests for the frontend-to-backend decision request path
- regression tests to confirm optimization does not invoke any language-model client

## 10. Migration Plan

1. Add the backend decision endpoint and OpenAI client wrapper
2. Replace Gemini configuration and dependency references
3. Refactor `ControlOptimizer` to use the backend decision endpoint
4. Remove per-iteration model calls from optimization
5. Verify UI messaging and docs reflect the new architecture

## 11. Expected Outcome

After the migration:

- ChatGPT/OpenAI chooses the algorithm family and optimization space
- numeric optimization owns iterative parameter search
- the API key is no longer exposed in the frontend
- the autonomy architecture is more reproducible, testable, and easier to extend
