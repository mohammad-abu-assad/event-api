# Event API — instructions for the coding agent

## What we're building

A small, production-style API on Google Cloud that receives events from apps (like "button_clicked"), stores them, and returns simple stats. It is deployed automatically on every push to `main`.

- `GET /health` → 200 `{ "status": "ok" }`, no auth (used by the uptime check)
- `POST /v1/events` → accepts a batch of events for the calling client, returns 201 `{ "accepted": n }`
- `GET /v1/stats?from=YYYY-MM-DD&to=YYYY-MM-DD` → counts per event name per day for the calling client

Next week (Project 3) an SDK and two sample apps will send events here, so the API contract must stay stable once it is published.

## My goal: learn, not just ship

I'm building this to prove my skills for Solution Engineer roles, so I must understand every line. Follow these rules:

1. **Plan first.** Before writing code for a step, explain the plan in plain words and wait for my OK.
2. **Small steps.** One feature per step. Run the tests after each step. Suggest a commit message when a step is done.
3. **Explain after each step.** Say what the code does and why, and name the concept it uses (multi-stage builds, API contracts, validation, statelessness, least privilege, CI/CD, keyless auth, structured logging, rollback).
4. **I do the account work.** I create the Google Cloud project, enable APIs, create resources and run every `gcloud` command myself. Give me the exact commands or click-by-click console steps, with one sentence on what each does.
5. **Ask before** installing a new dependency, or running any command that creates, changes or deletes cloud resources. Never run `gcloud` commands yourself.
6. **Never hardcode secrets.** Locally they live in `.env` (gitignored); in the cloud they live in Secret Manager. Never print an API key in logs or output.

## The API contract

`openapi.yaml` is the source of truth. Write it before the code, and keep the code and the spec in sync.

**Auth:** header `x-api-key`. Keys come from env var `API_KEYS`, a JSON object mapping client ID → key, e.g. `{"demo-client":"key_abc123"}`. Missing or wrong key → 401. The client ID found for the key is attached to the request and stored on every event.

**Event** (validated with zod):

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | optional, UUID; used to ignore duplicates |
| `name` | string | required, 1–100 characters |
| `timestamp` | string | required, ISO 8601 date-time |
| `props` | object | optional, flat key/value, max 20 keys |

**Batch:** `{ "events": Event[] }` with 1–100 events. Body size limit 100 KB.

**Errors** always look like `{ "error": "<code>", "message": "<readable text>", "issues"?: [{ "path", "message" }] }`:

| Status | `error` code | When |
| --- | --- | --- |
| 400 | `invalid_request` | Validation failed (include zod issues as `path` + `message`) |
| 401 | `unauthorized` | Missing or wrong API key |
| 413 | `payload_too_large` | Body over 100 KB |
| 429 | `rate_limited` | Over 60 requests per minute for that key; include a `Retry-After` header |
| 500 | `internal_error` | Anything unexpected; details only in logs, never in the response |

**Stats:** `from` and `to` are required, `from ≤ to`, range at most 31 days. Response: `{ "from", "to", "stats": [{ "date", "name", "count" }] }`, sorted by date then name.

## Fixed technical decisions

- Node.js 22, TypeScript, ES modules. Express, zod. Tests with Vitest + supertest.
- **Storage behind an interface.** `src/store/` defines an `EventStore` interface with two implementations:
  - `memory.ts` for tests and local development (default when `STORE=memory`)
  - `firestore.ts` using `@google-cloud/firestore` (when `STORE=firestore`)
  The routes only talk to the interface, so tests never need the cloud.
- **Firestore layout:** collection `events`. When an event has an `id`, the document ID is a SHA-256 hash of the JSON array `[clientId, eventId]`; this makes resends idempotent without collisions between clients. Otherwise, the document ID is auto-generated. Each document stores `clientId`, `name`, `timestamp`, `date` (YYYY-MM-DD, derived), `props`, `receivedAt`. Stats query: `clientId ==` + `date` range, counted in code. Tell me when a composite index is needed and how to create it.
- **Stateless:** nothing important kept in memory between requests, except the per-instance rate limiter (document that this limit is per instance).
- **Port:** listen on `process.env.PORT` (default 8080).
- **Docker:** multi-stage build on `node:22-slim`; final stage has only `dist/` and production dependencies, runs as `USER node`. Include a `.dockerignore` (node_modules, dist, .git, .env).
- **Cloud (region `europe-west1`):**
  - Cloud Run service `event-api`, min instances 0, max instances 2 (keeps cost safe during load tests)
  - Artifact Registry Docker repo `event-api`
  - Runtime service account `event-api-runtime` with only Firestore access and Secret Accessor on secret `api-keys`
  - Deploy service account `event-api-deployer` used only by GitHub Actions
  - `API_KEYS` comes from Secret Manager secret `api-keys`, exposed as an environment variable
- **CI/CD (`.github/workflows/ci.yml`):** on pull requests: install → check (types) → test. On push to `main`: the same, then build the image tagged with the commit SHA → push to Artifact Registry → deploy to Cloud Run. Authenticate with Workload Identity Federation (`google-github-actions/auth`), never a JSON key. Non-secret settings (project ID, region, WIF provider, service account email) are GitHub repository variables.
- **Logging:** one JSON line per request to stdout with `severity` (`INFO` < 400, `WARNING` 4xx, `ERROR` 5xx), `message`, `method`, `path`, `status`, `durationMs`, `clientId`, `eventCount` when relevant. Never log API keys or event `props`.
- **Dependencies kept minimal:** express, zod, @google-cloud/firestore at runtime; typescript, tsx, vitest, supertest and type packages for development. Ask before adding anything else.
- **CORS is not part of this project.** It will be added in Project 3 when the web demo needs it.

## Repo layout

```
event-api/
  src/server.ts         # starts the app on PORT
  src/app.ts            # builds the Express app (imported by tests)
  src/auth.ts           # x-api-key check
  src/rateLimit.ts      # per-key, per-instance limiter
  src/logger.ts         # structured JSON logs
  src/schemas.ts        # zod schemas
  src/routes/           # health.ts, events.ts, stats.ts
  src/store/            # types.ts, memory.ts, firestore.ts
  test/
  load/load.js          # k6 script
  openapi.yaml
  Dockerfile
  .dockerignore
  .github/workflows/ci.yml
  docs/runbook.md       # deploy, roll back, rotate a key, read logs
  .env.example
  README.md
  AGENTS.md
```

## npm scripts

- `npm run dev` — start locally with tsx in watch mode on port 8080 (memory store by default)
- `npm test` — run Vitest
- `npm run check` — TypeScript type check (`tsc --noEmit`)
- `npm run build` — compile to `dist/`
- `npm start` — run `dist/server.js` (used by the Docker image)

## Definition of done

- The API answers from a public Cloud Run URL; a bad key gets 401 and bad input gets a clear 400
- A push to `main` deploys by itself, with no key file stored in GitHub
- An uptime check on `/health` emails me when it fails
- I rolled back a broken release with Cloud Run traffic, and wrote down how long it took
- `openapi.yaml` matches the code and renders in Swagger Editor
- The README has: the problem, an architecture diagram, an API summary linked to the spec, local setup, environment variables, how to test, k6 results (requests per second, p95 latency, error rate, instances started), and links to the runbook
