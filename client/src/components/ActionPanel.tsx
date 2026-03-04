import { useState } from 'react';
import type { Batch, BatchResponse, MigrationFile } from '../types';

interface Props {
  batches: Batch[];
  autoProgress: boolean;
  onStartBatch: (batchSize: number, assignee?: string) => Promise<BatchResponse>;
  onToggleAutoProgress: (enabled: boolean) => Promise<void>;
  onResumeBatch: (batchId: string) => Promise<void>;
  onGetBatchFiles: (batchId: string) => Promise<MigrationFile[]>;
}

const batchStatusConfig: Record<string, string> = {
  completed: 'bg-[#DCFCE7] text-[#16A34A]',
  running: 'bg-[#DBEAFE] text-[#2563EB]',
  halted: 'bg-[#FEE2E2] text-[#DC2626]',
  partial_failure: 'bg-[#FEF3C7] text-[#D97706]',
};

const fileStatusLabels: Record<string, string> = {
  pending: 'Waiting',
  queued: 'In Batch',
  in_progress: 'In Progress',
  pr_open: 'Ready for Review',
  merged: 'Completed',
  needs_human: 'Feedback Needed',
  failed: 'Failed',
  skipped: 'Skipped',
};

function getDisplayFilename(path: string, status: string): string {
  const filename = path.split('/').pop() || path;
  if (status === 'merged') {
    return filename.replace(/\.jsx$/, '.tsx').replace(/\.js$/, '.ts');
  }
  return filename;
}

export default function ActionPanel({ batches, autoProgress, onStartBatch, onToggleAutoProgress, onResumeBatch, onGetBatchFiles }: Props) {
  const [batchSize, setBatchSize] = useState(5);
  const [assignee, setAssignee] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [lastResult, setLastResult] = useState<BatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [batchFilesCache, setBatchFilesCache] = useState<Record<string, MigrationFile[]>>({});
  const [loadingBatchFiles, setLoadingBatchFiles] = useState<string | null>(null);

  const activeBatch = batches.find((b) => b.status === 'running');
  const haltedBatch = batches.find((b) => b.status === 'halted');

  const handleStart = async () => {
    setIsStarting(true);
    setError(null);
    try {
      const result = await onStartBatch(batchSize, assignee.trim() || undefined);
      setLastResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start batch');
    } finally {
      setIsStarting(false);
    }
  };

  const handleResume = async () => {
    if (!haltedBatch) return;
    try {
      await onResumeBatch(haltedBatch.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume batch');
    }
  };

  const toggleBatchExpansion = async (batchId: string) => {
    if (expandedBatchId === batchId) {
      setExpandedBatchId(null);
      return;
    }
    setExpandedBatchId(batchId);
    if (!batchFilesCache[batchId]) {
      setLoadingBatchFiles(batchId);
      try {
        const files = await onGetBatchFiles(batchId);
        setBatchFilesCache((prev) => ({ ...prev, [batchId]: files }));
      } catch {
        // silently fail
      } finally {
        setLoadingBatchFiles(null);
      }
    }
  };

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB] p-5 flex flex-col h-full" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <h2 className="text-[15px] font-semibold text-[#111827] mb-3">Batch Control</h2>

      {haltedBatch && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-700">Batch Halted</p>
              <p className="text-xs text-red-500 mt-0.5">
                {haltedBatch.id}: {haltedBatch.failed}+ failures
              </p>
            </div>
            <button
              onClick={handleResume}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg text-xs transition-colors"
            >
              Resume
            </button>
          </div>
        </div>
      )}

      {/* Controls: all on one line */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={batchSize}
          onChange={(e) => setBatchSize(Number(e.target.value))}
          className="bg-white border border-[#E5E7EB] rounded-md px-2 py-1.5 text-sm text-[#374151] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value={3}>3 files</option>
          <option value={5}>5 files</option>
          <option value={8}>8 files</option>
        </select>

        <button
          onClick={handleStart}
          disabled={isStarting}
          className="px-4 py-1.5 bg-[#111827] hover:bg-[#1F2937] disabled:bg-[#D1D5DB] text-white font-medium rounded-md text-sm transition-colors"
        >
          {isStarting ? 'Starting...' : 'Start Batch'}
        </button>

        <input
          type="text"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          placeholder="Assignee (GitHub username)"
          className="bg-white border border-[#E5E7EB] rounded-md px-2 py-1.5 text-sm text-[#374151] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-blue-500/20 min-w-[220px]"
        />

        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-[#6B7280]">Auto</label>
          <button
            onClick={() => onToggleAutoProgress(!autoProgress)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              autoProgress ? 'bg-[#3B82F6]' : 'bg-[#D1D5DB]'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                autoProgress ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-600">
          {error}
        </div>
      )}

      {lastResult && !error && (
        <div className="mt-2 p-2 bg-[#DCFCE7] border border-green-200 rounded-md text-xs text-[#16A34A]">
          Batch <span className="font-mono">{lastResult.batchId}</span> {"\u2014"} {lastResult.filesQueued} files added
        </div>
      )}

      {activeBatch && (
        <div className="mt-2 p-3 bg-[#DBEAFE] border border-blue-200 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#3B82F6] animate-pulse" />
            <span className="text-xs font-medium text-[#2563EB]">Active: {activeBatch.id}</span>
          </div>
          <div className="flex gap-4 text-xs">
            <span className="text-[#6B7280]">Total: <span className="text-[#111827]">{activeBatch.total_files}</span></span>
            <span className="text-[#6B7280]">Done: <span className="text-[#16A34A]">{activeBatch.completed}</span></span>
            <span className="text-[#6B7280]">Failed: <span className="text-[#DC2626]">{activeBatch.failed}</span></span>
          </div>
        </div>
      )}

      {/* Batch History - scrollable to fill remaining space */}
      {batches.length > 0 && (
        <div className="mt-3 flex-1 flex flex-col min-h-0">
          <h3 className="text-[13px] font-medium text-[#6B7280] mb-2">Batch History</h3>
          <div className="space-y-1 flex-1 overflow-y-auto">
            {batches.slice(0, 25).map((batch) => {
              const isExpanded = expandedBatchId === batch.id;
              const bFiles = batchFilesCache[batch.id];
              const isLoading = loadingBatchFiles === batch.id;

              return (
                <div key={batch.id} className="border border-[#F3F4F6] rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleBatchExpansion(batch.id)}
                    className="w-full flex items-center justify-between text-xs p-2.5 hover:bg-[#F9FAFB] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <svg
                        className={`w-3 h-3 text-[#9CA3AF] transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="font-mono text-[#374151]">{batch.id}</span>
                      <span className="text-[#9CA3AF]">
                        {batch.total_files} files
                      </span>
                    </div>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        batchStatusConfig[batch.status] || 'bg-[#F3F4F6] text-[#6B7280]'
                      }`}
                    >
                      {batch.status}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[#F3F4F6] bg-[#F9FAFB] px-3 py-2">
                      {isLoading ? (
                        <p className="text-xs text-[#9CA3AF] py-1">Loading files...</p>
                      ) : bFiles && bFiles.length > 0 ? (
                        <div className="space-y-0.5">
                          {bFiles.map((file, idx) => {
                            const isLast = idx === bFiles.length - 1;
                            const connector = isLast ? '\u2514' : '\u251C';
                            const statusLabel = fileStatusLabels[file.status] || file.status;
                            return (
                              <div key={file.id} className="flex items-center gap-2 text-xs py-0.5 flex-wrap">
                                <span className="text-[#D1D5DB] font-mono">{connector}{"\u2500\u2500"}</span>
                                <span className="font-mono text-[#374151]">{getDisplayFilename(file.path, file.status)}</span>
                                <span className="text-[#D1D5DB]">{"\u2192"}</span>
                                <span className={`${
                                  file.status === 'merged' ? 'text-[#16A34A]' :
                                  file.status === 'failed' ? 'text-[#DC2626]' :
                                  file.status === 'needs_human' ? 'text-[#EA580C]' :
                                  'text-[#6B7280]'
                                }`}>{statusLabel}</span>
                                {file.pr_url && file.pr_number && (
                                  <a href={file.pr_url} target="_blank" rel="noopener noreferrer" className="text-[#3B82F6] hover:underline">
                                    (PR #{file.pr_number})
                                  </a>
                                )}
                                {file.devin_url && (
                                  <a href={file.devin_url} target="_blank" rel="noopener noreferrer" className="text-[#3B82F6] hover:underline">
                                    (Devin)
                                  </a>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-[#9CA3AF] py-1">No files found</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
