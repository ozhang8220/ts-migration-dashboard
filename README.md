# ShopDirect TypeScript Migration Dashboard

A full-stack web app for tracking an automated JavaScript-to-TypeScript migration.

## Tech Stack

- **Backend**: Express.js + TypeScript
- **Database**: SQLite via better-sqlite3
- **Frontend**: React + TypeScript + Tailwind CSS
- **Dev tooling**: Vite (frontend), tsx (backend)

## Quick Start

```bash
npm install
npm run seed
npm run dev
```

This will:
1. Install all dependencies (root, server, client)
2. Seed the database with sample migration data
3. Start both the Express API server (port 3001) and Vite dev server (port 5173)

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
| GET | `/api/stats` | Migration overview statistics |
| GET | `/api/files` | All files (filterable by `?status=` and sortable by `?sort=`) |
| GET | `/api/files/:id` | Single file detail with Devin sessions |
| PATCH | `/api/files/:id` | Update file status |
| GET | `/api/batches` | All batches |
| POST | `/api/batches` | Create a new batch of files to migrate |
| GET | `/api/activity` | Last 20 activity log entries |
