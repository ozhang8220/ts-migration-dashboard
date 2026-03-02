# TypeScript Migration Dashboard

A production-ready full-stack web app for automating JavaScript-to-TypeScript migrations. Analyzes any GitHub repository, creates Devin AI sessions to convert files, and tracks progress with real-time GitHub webhook integration.

## Tech Stack

- **Backend**: Express.js + TypeScript
- **Database**: SQLite via better-sqlite3
- **Frontend**: React + TypeScript + Tailwind CSS
- **Dev tooling**: Vite (frontend), tsx (backend)

## Quick Start

```bash
npm install
npm run dev
```

This starts both the Express API server (port 3001) and Vite dev server (port 5173).

### Using with seed data (demo mode)

```bash
npm run seed
npm run dev
```

The seed script populates the database with sample ShopDirect migration data for demos.

### Using with a real repository

1. Start the app with `npm run dev`
2. Open http://localhost:5173
3. Enter a GitHub repository (e.g., `owner/repo`) and branch in the Analyze form
4. Click "Analyze" to scan the repo for JS/JSX files
5. Use "Start Next Batch" to begin migration (requires Devin API token)

## Environment Variables

Copy `.env.example` to `.env` and fill in values:

| Variable | Required | Description |
|----------|----------|-------------|
| `DEVIN_API_TOKEN` | For migration | Bearer token for the Devin API |
| `DEVIN_API_BASE_URL` | No | Defaults to `https://api.devin.ai/v1` |
| `GITHUB_TOKEN` | For analysis/polling | GitHub personal access token |
| `GITHUB_OWNER` | No | Default repo owner (overridden by analyze) |
| `GITHUB_REPO` | No | Default repo name (overridden by analyze) |
| `GITHUB_BASE_BRANCH` | No | Default branch (defaults to `main`) |
| `GITHUB_WEBHOOK_SECRET` | For webhooks | Secret for verifying GitHub webhook signatures |

The app starts cleanly with no env vars set — missing tokens show warnings in the console and features degrade gracefully.

## Scripts

| Command | Description |
|---------|-------------|
| `npm install` | Install all dependencies (root + server + client) |
| `npm run seed` | Seed the SQLite database with sample data |
| `npm run dev` | Start both backend and frontend in dev mode |
| `npm run dev:server` | Start only the Express server |
| `npm run dev:client` | Start only the Vite frontend |
| `npm run build` | Build the frontend for production |
| `npm start` | Start the production server (serves built frontend) |

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/stats` | Migration overview with rate limits, config, duration stats |
| GET | `/api/files` | All files (filterable by `?status=`, sortable by `?sort=`) |
| GET | `/api/files/:id` | Single file detail with Devin sessions |
| PATCH | `/api/files/:id` | Update file status |
| GET | `/api/batches` | All batches |
| POST | `/api/batches` | Create a new batch of files to migrate |
| POST | `/api/batches/:id/resume` | Resume a halted batch |
| GET | `/api/activity` | Last 20 activity log entries |
| POST | `/api/analyze` | Analyze a GitHub repo for JS/JSX files |
| GET | `/api/config` | Read repo configuration |
| PATCH | `/api/config` | Update config (e.g., auto-progress toggle) |
| GET | `/api/errors` | Last 50 error log entries |
| POST | `/api/webhooks/github` | GitHub webhook receiver |

## GitHub Webhook Setup

Webhooks provide real-time PR status updates. The GitHub poller (every 2 minutes) serves as a fallback.

### Setup Steps

1. Go to your target repo on GitHub: **Settings → Webhooks → Add webhook**
2. **Payload URL**: `https://your-server-domain/api/webhooks/github`
3. **Content type**: `application/json`
4. **Secret**: Must match your `GITHUB_WEBHOOK_SECRET` env var
5. **Events**: Select **"Pull requests"** only
6. Click **Add webhook**

### Local Development with ngrok

For local development, use [ngrok](https://ngrok.com/) to expose your local server:

```bash
ngrok http 3001
```

Then use the ngrok URL (e.g., `https://abc123.ngrok.io/api/webhooks/github`) as the Payload URL in GitHub webhook settings.

## Features

### Auto-Analysis
The `/api/analyze` endpoint fetches any GitHub repo's file tree, parses JS/JSX files under `src/`, computes line counts, import graphs, dependency depths, and complexity classifications. Files are inserted as `pending` and ready for migration.

### Auto-Batch Progression
When enabled, the system automatically starts the next batch after the current one completes. A 10-second delay between batches allows GitHub to update the main branch. Toggle auto-progress on/off from the dashboard.

### Batch Halting
If 3 or more files in a batch fail, the batch is marked as `halted` and auto-progression pauses. A warning banner appears on the dashboard with a "Resume" button.

### Error Handling
- **Devin API**: Exponential backoff retry (2s, 4s, 8s) with max 3 attempts
- **GitHub API**: Rate limit tracking with warnings at <100 remaining, auto-pause at 0
- **Global error log**: All caught errors logged to database, viewable via `/api/errors`

### Session Cost Tracking
Devin session durations are calculated and displayed per-file and as a total across all sessions.
