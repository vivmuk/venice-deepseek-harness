# Venice DeepSeek Harness (`venice-deepseek-harness`)

A thin deployment wrapper for the open-source **[DeepSeek Harness (`@deepseek-ai/dsh`)](https://www.npmjs.com/package/@deepseek-ai/dsh)**, preconfigured out of the box with **[Venice](https://venice.ai)** as its model provider.

Instead of reimplementing the agent harness, this repository wires up `@deepseek-ai/dsh` with a preloaded `$DSH_HOME/settings.yaml` configuration so you can immediately launch the DeepSeek Harness Web UI locally or deploy it with one click to Railway using Venice's private, uncensored, and high-speed DeepSeek endpoints.

---

## Preconfigured Venice Models

The included [`dsh-home/settings.yaml`](./dsh-home/settings.yaml) configures the `llm-pi-ai` plugin with the `venice` provider (`https://api.venice.ai/api/v1`, OpenAI-compatible completions with `thinkingFormat: deepseek`) and registers five DeepSeek models:

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
3. (Optional but recommended) Open the service's **Variables** tab and add:
   - `VENICE_API_KEY`: Your API key from [venice.ai/settings/api](https://venice.ai/settings/api)
   - Railway automatically injects `PORT`, which `npm start` binds to on `0.0.0.0`.
4. Under **Settings → Networking**, click **Generate Domain** to expose the Web UI publicly.
5. Open your Railway domain URL. If you did not set `VENICE_API_KEY` in step 3, configure it directly inside **Settings → Models** in the Web UI.

---

## Running Locally

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Copy .env.example and set VENICE_API_KEY
cp .env.example .env

# 3. Start the DeepSeek Harness Web UI (it prints its URL, including a one-time access token)
npm start
```

## Opening the UI (access token)

`dsh web` gates the UI behind a one-time token: on startup it prints a URL like
`http://<host>:3080/?token=...`. Open that exact URL — opening the bare
address without the token returns 401. On Railway, find the token URL in the
service's deploy logs. The token is stored as a browser-session grant in
`dsh-home/.credentials.yaml` (gitignored, never committed).

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
