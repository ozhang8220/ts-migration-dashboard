import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root (one level up from server/)
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

import express from 'express';
import cors from 'cors';
import routes from './routes';
import { getDb } from './database';
import { startDevinPoller } from './worker/devin-poller';
import { startGitHubPoller } from './worker/github-poller';
import { handleGitHubWebhook } from './worker/webhook-handler';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());

// Webhook endpoint needs raw body for signature verification
// Must be registered BEFORE express.json() middleware
app.post('/api/webhooks/github', express.json({
  verify: (req, _res, buf) => {
    (req as express.Request & { rawBody?: string }).rawBody = buf.toString();
  }
}), handleGitHubWebhook);

app.use(express.json());

// API routes
app.use('/api', routes);

// Serve static frontend in production
const clientBuildPath = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientBuildPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// Initialize database on startup
getDb();

// Log configuration warnings on startup
if (!process.env.DEVIN_API_TOKEN) {
  console.warn('[startup] DEVIN_API_TOKEN not set — batch creation will queue files without creating Devin sessions');
}
if (!process.env.GITHUB_TOKEN) {
  console.warn('[startup] GITHUB_TOKEN not set — GitHub polling and repo analysis will be unavailable');
}
if (!process.env.GITHUB_WEBHOOK_SECRET) {
  console.warn('[startup] GITHUB_WEBHOOK_SECRET not set — webhook endpoint will reject all requests');
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  // Start background pollers
  startDevinPoller();
  startGitHubPoller();
});

export default app;
