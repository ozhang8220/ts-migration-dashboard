import crypto from 'crypto';
import { Request, Response } from 'express';
import { getDb, logError } from '../database';
import { updateFileStatus, checkBatchProgression, shouldHaltBatch } from './batch-progression';

interface PullRequestPayload {
  action: string;
  repository: { full_name: string };
  pull_request: {
    number: number;
    merged: boolean;
    state: string;
    html_url: string;
    base: { ref: string };
  };
}

/**
 * Verify the webhook signature from GitHub using HMAC-SHA256.
 */
function verifySignature(payload: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/**
 * Handle incoming GitHub webhook events.
 * Must be mounted with raw body parsing for signature verification.
 */
export async function handleGitHubWebhook(req: Request, res: Response): Promise<void> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[webhook] GITHUB_WEBHOOK_SECRET not configured — rejecting webhook');
    res.status(500).json({ error: 'Webhook secret not configured' });
    return;
  }

  // Verify signature
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const rawBody = (req as Request & { rawBody?: string }).rawBody;

  if (!rawBody) {
    console.error('[webhook] No raw body available for signature verification');
    res.status(400).json({ error: 'Missing request body' });
    return;
  }

  if (!verifySignature(rawBody, signature, secret)) {
    console.warn('[webhook] Invalid signature — rejecting');
    logError('webhook', 'Invalid webhook signature received');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const event = req.headers['x-github-event'] as string;

  if (event === 'ping') {
    console.log('[webhook] Received ping event');
    res.status(200).json({ ok: true, event: 'ping' });
    return;
  }

  if (event !== 'pull_request') {
    res.status(200).json({ ignored: true, event });
    return;
  }

  try {
    const payload = req.body as PullRequestPayload;
    const pr = payload.pull_request;
    const prNumber = pr.number;
    const action = payload.action;

    console.log(`[webhook] PR #${prNumber} action: ${action}`);

    // Find the file associated with this PR (filter by repo)
    const db = getDb();
    const repoId = `${payload.repository.full_name}:${payload.pull_request.base.ref}`;
    const file = db.prepare(
      "SELECT * FROM files WHERE pr_number = ? AND repo_id = ?"
    ).get(prNumber, repoId) as { id: string; path: string; status: string; batch_id: string | null } | undefined;

    if (!file) {
      res.status(200).json({ ignored: true, reason: 'PR not tracked' });
      return;
    }

    if (action === 'closed' && pr.merged) {
      console.log(`[webhook] PR #${prNumber} merged for ${file.path}`);
      updateFileStatus(file.id, 'merged');

      if (file.batch_id) {
        db.prepare("UPDATE batches SET completed = completed + 1 WHERE id = ?").run(file.batch_id);
      }

      await checkBatchProgression();

    } else if (action === 'closed' && !pr.merged) {
      console.log(`[webhook] PR #${prNumber} closed without merge for ${file.path}`);
      updateFileStatus(file.id, 'needs_human', 'PR closed without merge');

      if (file.batch_id) {
        db.prepare("UPDATE batches SET failed = failed + 1 WHERE id = ?").run(file.batch_id);
        shouldHaltBatch(file.batch_id);
      }

      await checkBatchProgression();
    }

    res.status(200).json({ ok: true, action, prNumber });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[webhook] Error handling webhook:', msg);
    logError('webhook', 'Error processing webhook', msg);
    res.status(500).json({ error: 'Internal webhook error' });
  }
}
