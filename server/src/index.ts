import express from 'express';
import cors from 'cors';
import path from 'path';
import routes from './routes';
import { getDb } from './database';
import { startDevinPoller } from './worker/devin-poller';
import { startGitHubPoller } from './worker/github-poller';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  // Start background pollers
  startDevinPoller();
  startGitHubPoller();
});

export default app;
