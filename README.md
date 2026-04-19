<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run the autonomy demo locally

This workspace runs a Franka Panda pick-and-place autonomy demo with:

- a frontend simulation UI
- a local decision service that prefers oMLX and can fall back to OpenAI
- a local vision-planning path that can inspect MuJoCo screenshots before executing voice commands
- numeric parameter optimization inside the app runtime

## Run Locally

**Prerequisites:** Node.js 22+

1. Install dependencies:
   `npm install`
2. Optional but recommended: start a local `oMLX` server on Apple Silicon:
   `omlx serve --model-dir ~/models`
3. Optional OpenAI fallback:
   `export OPENAI_API_KEY=your_key_here`
4. Start the local decision service:
   `npm run dev:server`
5. In a second terminal, start the frontend:
   `npm run dev`

The frontend talks to `/api/decision/controller-blueprint`, and Vite proxies that route to the local backend on port `3001`.

## Local LLM Defaults

The backend now prefers `oMLX` via an OpenAI-compatible endpoint before falling back to OpenAI.

- Default local base URL: `http://127.0.0.1:8000/v1`
- Default local model env: `OMLX_MODEL`
- Optional local base URL override: `OMLX_BASE_URL`
- Optional OpenAI fallback model env: `OPENAI_MODEL`
- Optional OpenAI fallback base URL env: `OPENAI_BASE_URL`

## Architecture Notes

- oMLX or OpenAI decides which controller template to use and how natural-language voice commands should be interpreted.
- Numeric optimization owns iterative parameter search.
- The frontend no longer exposes a model API key.
