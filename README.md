# Venice DeepSeek Harness (`venice-deepseek-harness`)

A thin deployment wrapper for the open-source **[DeepSeek Harness (`@deepseek-ai/dsh`)](https://www.npmjs.com/package/@deepseek-ai/dsh)**, preconfigured out of the box with **[Venice](https://venice.ai)** as its model provider.

Instead of reimplementing the agent harness, this repository wires up `@deepseek-ai/dsh` with a preloaded `$DSH_HOME/settings.yaml` configuration so you can immediately launch the DeepSeek Harness Web UI locally or deploy it with one click to Railway using Venice's private, uncensored, and high-speed DeepSeek endpoints.

---

## Preconfigured Venice Models

The included [`dsh-home/profiles/web/cordis.patch.yml`](./dsh-home/profiles/web/cordis.patch.yml) configures the `llm-pi-ai` plugin with the `venice` provider (`https://api.venice.ai/api/v1`, OpenAI-compatible completions with `thinkingFormat: deepseek`) and registers five DeepSeek models. The web profile scaffold (`cordis.yml`, `package.json`, `pnpm-workspace.yaml`) ships alongside it so a fresh container has the provider on its very first boot — dsh only imports a legacy `settings.yaml` into this patch layer after it starts.

| Model ID | Description |
| :--- | :--- |
| `deepseek-v4-1-flash` | Fast, low-latency DeepSeek V4.1 reasoning and coding model |
| `deepseek-v4-pro` | Flagship DeepSeek V4 Pro for deep reasoning, architecture, and complex tasks |
| `deepseek-v4-flash` | Balanced high-speed DeepSeek V4 Flash model |
| `deepseek-v3.2` | Proven general-purpose DeepSeek V3.2 model |
| `deepseek-v4-1-flash-uncensored` | Uncensored variant of DeepSeek V4.1 Flash hosted on Venice |

---

## Setting Your Venice API Key

Your Venice API key is **never** stored in this repository. You can provide it in either of two ways:

1. **Environment Variable (`VENICE_API_KEY`)**:
   Set `VENICE_API_KEY` in your environment (or in Railway's service variables). The harness automatically reads `VENICE_API_KEY` as configured by `apiKeyEnv: VENICE_API_KEY` in `dsh-home/settings.yaml`.
2. **In the Harness Web UI (`Settings → Models`)**:
   Open the Web UI, navigate to **Settings → Models**, select the **Venice** provider, and paste your API key. The harness saves UI-entered credentials into `dsh-home/.credentials.yaml` (which is gitignored).

---

## Deploying on Railway

This repository includes a [`Dockerfile`](./Dockerfile) (Node 22 base image with a built-in HTTP healthcheck) and [`railway.json`](./railway.json) for turnkey deployment on [Railway](https://railway.app):

1. Push or fork this repository to your GitHub account.
2. In Railway, click **New Project → Deploy from GitHub repo** and select this repository.
3. Open the service's **Variables** tab and add:
   - `VENICE_API_KEY`: your API key from [venice.ai/settings/api](https://venice.ai/settings/api)
   - `HARNESS_ACCESS_KEY`: a shared secret of your choosing. Without it the deployment is open to anyone who finds the URL.
   - Railway automatically injects `PORT`; the entrypoint binds to it on `0.0.0.0`.
4. Under **Settings → Networking**, click **Generate Domain** to expose the Web UI publicly.
5. Open `https://<your-domain>/?key=<HARNESS_ACCESS_KEY>` once. The gatekeeper mints an access cookie and drops you straight into the harness.

---

## Running Locally

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Copy .env.example and set VENICE_API_KEY
cp .env.example .env

# 3. Start the DeepSeek Harness Web UI
PORT=3080 HARNESS_ACCESS_KEY=devkey npm start
# then open http://localhost:3080/?key=devkey
```

## How the public entry works

`dsh web` prints a URL carrying a **fresh random launch token on every process start**, and that URL is the only way in: a bare request gets `401 dsh web authentication required`. Behind a PaaS nobody can read that printed line, and the token changes on every restart.

[`scripts/gatekeeper.mjs`](./scripts/gatekeeper.mjs) solves that. It starts `dsh web` on an internal loopback port, scrapes the current launch token out of the startup output, and proxies the public port to it — redeeming the token for each visitor so the plain domain works. It also:

- forwards `Host`, cookies and WebSocket upgrades untouched (dsh's browser-trust fence requires the browser-visible authority),
- re-redeems the token after every restart, and clears a session cookie left over from a previous process,
- optionally gates the deployment behind `HARNESS_ACCESS_KEY` (keyed link or a small form, then an HttpOnly cookie),
- serves `/healthz` for the platform healthcheck, independent of dsh's token state.

The harness home (`$DSH_HOME`, default `./dsh-home`) holds settings, sessions and credentials. On a platform with an ephemeral filesystem, mount a volume there if you want sessions to survive deploys.


---

## Long-Horizon Capabilities of DeepSeek Harness

DeepSeek Harness (`dsh`) is purpose-built for autonomous, long-horizon engineering and research workflows:

- **Multi-Step Planning**: Decomposes large, ambiguous objectives into structured plans with explicit milestones and verification criteria before writing code or executing commands.
- **Subagent Delegation**: Spawns specialized child agents to investigate codebases, run parallel experiments, or audit modules without polluting the main reasoning context.
- **Background & Scheduled Tasks**: Launches long-running processes (builds, test suites, crawlers, watchers) in the background and supports recurring or delayed scheduled jobs.
- **Isolated Workspaces**: Maintains clean workspace directories and persistent session state so complex multi-file projects can evolve over hours or days.

### 3 Example Long-Horizon Tasks to Try First

1. **Full-Stack Repository Bootstrap & Self-Testing Loop**:
   > *"Create a new workspace and build a complete TypeScript + Fastify + SQLite task queue service with retry backoff, dead-letter handling, and an OpenAPI spec. Write unit and integration tests, run them in the background, and iterate until 100% of tests pass."*
2. **Parallel Subagent Architecture & Security Audit**:
   > *"Clone a target open-source repository into the workspace. Delegate three subagents in parallel: one to map the dependency graph and module boundaries, one to audit authentication and input validation paths, and one to benchmark test execution speed. Synthesize their findings into an actionable `ARCHITECTURE_AUDIT.md` report."*
3. **Scheduled Competitive & Release Monitor**:
   > *"Set up a workspace with a script and scheduled job that periodically checks upstream GitHub releases and changelogs for our core dependencies, summarizes breaking changes using `deepseek-v4-1-flash`, and appends structured upgrade plans to a status report."*
