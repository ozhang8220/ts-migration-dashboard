import { useState, useEffect, useCallback } from 'react';
import type { Stats, MigrationFile, Batch, ActivityEntry, BatchResponse } from '../types';

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
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [statsData, filesData, batchesData, activityData] = await Promise.all([
        fetchJson<Stats>('/stats'),
        fetchJson<MigrationFile[]>('/files'),
        fetchJson<Batch[]>('/batches'),
        fetchJson<ActivityEntry[]>('/activity'),
      ]);
      setStats(statsData);
      setFiles(filesData);
      setBatches(batchesData);
      setActivity(activityData);
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

  const startBatch = useCallback(async (batchSize: number): Promise<BatchResponse> => {
    const result = await fetchJson<BatchResponse>('/batches', {
      method: 'POST',
      body: JSON.stringify({ batchSize }),
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

  return {
    stats,
    files,
    batches,
    activity,
    lastUpdated,
    loading,
    error,
    refresh,
    startBatch,
    updateFileStatus,
  };
}
