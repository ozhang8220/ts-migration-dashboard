import { useState } from 'react';
import type { Batch, BatchResponse } from '../types';

interface Props {
  batches: Batch[];
  onStartBatch: (batchSize: number) => Promise<BatchResponse>;
}

export default function ActionPanel({ batches, onStartBatch }: Props) {
  const [batchSize, setBatchSize] = useState(5);
  const [isStarting, setIsStarting] = useState(false);
  const [lastResult, setLastResult] = useState<BatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeBatch = batches.find((b) => b.status === 'running');

  const handleStart = async () => {
    setIsStarting(true);
    setError(null);
    try {
      const result = await onStartBatch(batchSize);
      setLastResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start batch');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <h2 className="text-lg font-semibold text-gray-100 mb-4">Batch Control</h2>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">Batch Size:</label>
          <select
            value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          >
            <option value={3}>3 files</option>
            <option value={5}>5 files</option>
            <option value={8}>8 files</option>
          </select>
        </div>

        <button
          onClick={handleStart}
          disabled={isStarting}
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:text-indigo-400 text-white font-medium rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        >
          {isStarting ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Starting…
            </span>
          ) : (
            'Start Next Batch'
          )}
        </button>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      {lastResult && !error && (
        <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-sm text-emerald-400">
          Batch <span className="font-mono">{lastResult.batchId}</span> created — {lastResult.filesQueued} files queued
        </div>
      )}

      {activeBatch && (
        <div className="mt-4 p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            <span className="text-sm font-medium text-indigo-300">Active Batch: {activeBatch.id}</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Total:</span>{' '}
              <span className="text-gray-200">{activeBatch.total_files}</span>
            </div>
            <div>
              <span className="text-gray-400">Completed:</span>{' '}
              <span className="text-emerald-400">{activeBatch.completed}</span>
            </div>
            <div>
              <span className="text-gray-400">Failed:</span>{' '}
              <span className="text-red-400">{activeBatch.failed}</span>
            </div>
          </div>
        </div>
      )}

      {/* Batch History */}
      {batches.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Batch History</h3>
          <div className="space-y-2">
            {batches.slice(0, 5).map((batch) => (
              <div key={batch.id} className="flex items-center justify-between text-sm p-2 bg-gray-800/50 rounded-lg">
                <span className="font-mono text-gray-300">{batch.id}</span>
                <div className="flex items-center gap-3">
                  <span className="text-gray-400">{batch.total_files} files</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      batch.status === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : batch.status === 'running'
                        ? 'bg-indigo-500/20 text-indigo-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {batch.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
