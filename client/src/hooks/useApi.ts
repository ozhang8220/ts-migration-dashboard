import { useState, useEffect, useCallback } from 'react';
import type { Stats, MigrationFile, Batch, ActivityEntry, BatchResponse, ErrorLogEntry, AnalysisResult } from '../types';

const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export function useDashboardData() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [files, setFiles] = useState<MigrationFile[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [errors, setErrors] = useState<ErrorLogEntry[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [statsData, filesData, batchesData, activityData, errorsData] = await Promise.all([
        fetchJson<Stats>('/stats'),
        fetchJson<MigrationFile[]>('/files'),
        fetchJson<Batch[]>('/batches'),
        fetchJson<ActivityEntry[]>('/activity'),
        fetchJson<ErrorLogEntry[]>('/errors'),
      ]);
      setStats(statsData);
      setFiles(filesData);
      setBatches(batchesData);
      setActivity(activityData);
      setErrors(errorsData);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const startBatch = useCallback(async (batchSize: number, assignee?: string): Promise<BatchResponse> => {
    const result = await fetchJson<BatchResponse>('/batches', {
      method: 'POST',
      body: JSON.stringify({ batchSize, assignee }),
    });
    await refresh();
    return result;
  }, [refresh]);

  const updateFileStatus = useCallback(async (fileId: string, status: string): Promise<void> => {
    await fetchJson(`/files/${fileId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await refresh();
  }, [refresh]);

  const analyzeRepo = useCallback(async (repoFullName: string, branch: string): Promise<AnalysisResult> => {
    const result = await fetchJson<AnalysisResult>('/analyze', {
      method: 'POST',
      body: JSON.stringify({ repoFullName, branch }),
    });
    await refresh();
    return result;
  }, [refresh]);

  const toggleAutoProgress = useCallback(async (enabled: boolean): Promise<void> => {
    await fetchJson('/config', {
      method: 'PATCH',
      body: JSON.stringify({ autoProgress: enabled }),
    });
    await refresh();
  }, [refresh]);

  const resumeBatch = useCallback(async (batchId: string): Promise<void> => {
    await fetchJson(`/batches/${batchId}/resume`, {
      method: 'POST',
    });
    await refresh();
  }, [refresh]);

  const getBatchFiles = useCallback(async (batchId: string): Promise<MigrationFile[]> => {
    return fetchJson<MigrationFile[]>(`/batches/${batchId}/files`);
  }, []);

  return {
    stats,
    files,
    batches,
    activity,
    errors,
    lastUpdated,
    loading,
    error,
    refresh,
    startBatch,
    updateFileStatus,
    analyzeRepo,
    toggleAutoProgress,
    resumeBatch,
    getBatchFiles,
  };
}
