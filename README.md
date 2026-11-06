<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Franka voice pick-and-place demo

**Public demo: [https://zhuyanhe1975-hit.github.io/AIVoice_ArmCtrl/](https://zhuyanhe1975-hit.github.io/AIVoice_ArmCtrl/)**

The page is a static Vite build of the browser simulation. It does not ship API keys, and it does not run the local decision server.

## What the hosted page can do

- Load the Franka Panda MuJoCo scene in the browser (WASM from the `mujoco-js` package CDN, meshes from this repo).
- Pause, reset, change speed, switch theme, and open the model library.
- Use the browser speech recognizer in Chrome. If `/api` is unreachable, voice commands fall back to the built-in keyword parser (for example “把红色块放到收纳栏的中间”) and the on-screen joint controller.
- Show a short note that full autonomy needs a local backend.

Other library robots are not stored in this repo. The loader tries the Pages asset path first, then MuJoCo Menagerie. Those remote fetches work only when the browser can reach GitHub.

## What stays local

These paths call `http://127.0.0.1:3001` through the Vite dev proxy. GitHub Pages has no place to run them, so the UI keeps the simulation on screen and skips the model:

- oMLX or OpenAI controller decisions (`/api/decision/controller-blueprint`)
- Voice interpretation, task planning, and assistant replies that need a model
- Vision description and vision planning from MuJoCo screenshots

Start the local server with the steps below when you want that behavior. Do not commit `.env` or an API key. Copy `.env.example` on the machine that runs the server.

## One-time GitHub Pages setting

The repository is public. Pages is not turned on until this is set once:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.

After that, `.github/workflows/pages.yml` builds and deploys on every push to `main`, and it can also be run with **Actions → Deploy demo to GitHub Pages → Run workflow**. Pull requests run lint, tests, and a production build at base path `/AIVoice_ArmCtrl/`, and they do not deploy.

The live site URL is `https://zhuyanhe1975-hit.github.io/AIVoice_ArmCtrl/`. The workflow asks GitHub for the real base path at deploy time, then passes it to `vite build --base`. Asset loads use that base, so meshes resolve under `/AIVoice_ArmCtrl/assets/...` instead of the domain root.

## Run locally

**Prerequisites:** Node.js 22+

1. Install dependencies:
   `npm install`
2. Optional but recommended: start a local `oMLX` server on Apple Silicon:
   `omlx serve --model-dir ~/models`
3. Optional OpenAI fallback. Put the key in an untracked `.env` or the shell, never in git:
   `export OPENAI_API_KEY=your_key_here`
4. Start the local decision service:
   `npm run dev:server`
5. In a second terminal, start the frontend:
   `npm run dev`

The frontend talks to `/api/decision/controller-blueprint`, `/api/voice/*`, and `/api/vision/*`. Vite proxies those routes to the local backend on port `3001`.

To preview the Pages build on your machine:

```bash
npm run build -- --base /AIVoice_ArmCtrl/
npm run preview
```

Open the printed URL with the `/AIVoice_ArmCtrl/` prefix.

## Local LLM defaults

The backend prefers `oMLX` via an OpenAI-compatible endpoint before falling back to OpenAI.

- Default local base URL: `http://127.0.0.1:8000/v1`
- Default local model env: `OMLX_MODEL`
- Optional local base URL override: `OMLX_BASE_URL`
- Optional OpenAI fallback model env: `OPENAI_MODEL`
- Optional OpenAI fallback base URL env: `OPENAI_BASE_URL`

## Architecture notes

- oMLX or OpenAI decides which controller template to use and how natural-language voice commands should be interpreted.
- Numeric optimization owns iterative parameter search. If the decision request fails, the optimizer keeps a built-in template.
- The frontend does not embed a model API key.
