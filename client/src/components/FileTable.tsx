import { useState, useMemo } from 'react';
import type { MigrationFile, FileStatus } from '../types';

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return `${hours}h ${remainMinutes}m`;
}

interface Props {
  files: MigrationFile[];
  onStatusChange: (fileId: string, status: string) => void;
}

const statusConfig: Record<FileStatus, { label: string; classes: string }> = {
  pending: { label: 'Pending', classes: 'bg-gray-100 text-gray-600' },
  queued: { label: 'Queued', classes: 'bg-blue-50 text-blue-600' },
  in_progress: { label: 'In Progress', classes: 'bg-blue-50 text-blue-700' },
  pr_open: { label: 'PR Open', classes: 'bg-amber-50 text-amber-700' },
  merged: { label: 'Merged', classes: 'bg-green-50 text-green-700' },
  needs_human: { label: 'Needs Human', classes: 'bg-orange-100 text-orange-700' },
  failed: { label: 'Failed', classes: 'bg-red-50 text-red-700' },
  skipped: { label: 'Skipped', classes: 'bg-gray-100 text-gray-500' },
};

const complexityConfig: Record<string, { dot: string; label: string }> = {
  low: { dot: 'bg-emerald-400', label: 'Low' },
  medium: { dot: 'bg-amber-400', label: 'Medium' },
  high: { dot: 'bg-rose-400', label: 'High' },
};

type SortField = 'path' | 'complexity' | 'dep_depth' | 'loc' | 'status';

const allStatuses: FileStatus[] = ['pending', 'queued', 'in_progress', 'pr_open', 'merged', 'needs_human', 'failed', 'skipped'];

function getDisplayPath(path: string, status: FileStatus): string {
  if (status === 'merged') {
    return path.replace(/\.jsx$/, '.tsx').replace(/\.js$/, '.ts');
  }
  return path;
}

export default function FileTable({ files, onStatusChange }: Props) {
  const [sortField, setSortField] = useState<SortField>('dep_depth');
  const [sortAsc, setSortAsc] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of files) {
      counts[f.status] = (counts[f.status] || 0) + 1;
    }
    return counts;
  }, [files]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const sortedFiles = useMemo(() => {
    let filtered = files;
    if (filterStatus !== 'all') {
      filtered = files.filter((f) => f.status === filterStatus);
    }

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'path':
          cmp = a.path.localeCompare(b.path);
          break;
        case 'complexity': {
          const order = { low: 0, medium: 1, high: 2 };
          cmp = (order[a.complexity] || 0) - (order[b.complexity] || 0);
          break;
        }
        case 'dep_depth':
          cmp = a.dep_depth - b.dep_depth;
          break;
        case 'loc':
          cmp = (a.loc || 0) - (b.loc || 0);
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [files, sortField, sortAsc, filterStatus]);

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-900 select-none"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && (
          <span className="text-blue-500">{sortAsc ? '↑' : '↓'}</span>
        )}
      </div>
    </th>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Files</h2>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Filter:</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300"
          >
            <option value="all">All Statuses ({files.length})</option>
            {allStatuses.map((s) => {
              const count = statusCounts[s] || 0;
              if (count === 0) return null;
              return <option key={s} value={s}>{statusConfig[s].label} ({count})</option>;
            })}
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <SortHeader field="path">File Path</SortHeader>
              <SortHeader field="complexity">Complexity</SortHeader>
              <SortHeader field="dep_depth">Depth</SortHeader>
              <SortHeader field="loc">LOC</SortHeader>
              <SortHeader field="status">Status</SortHeader>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Duration</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">PR Link</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Devin Session</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedFiles.map((file) => {
              const statusCfg = statusConfig[file.status];
              const complexityCfg = complexityConfig[file.complexity] || complexityConfig.low;

              return (
                <tr key={file.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-sm font-mono text-gray-900">{getDisplayPath(file.path, file.status)}</span>
                    {file.error_reason && (
                      <p className="text-xs text-orange-600 mt-1 max-w-md truncate" title={file.error_reason}>
                        {file.error_reason}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${complexityCfg.dot}`} />
                      <span className="text-sm text-gray-600">{complexityCfg.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{file.dep_depth}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{file.loc}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusCfg.classes}`}>
                      {statusCfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {file.session_duration != null ? formatDuration(file.session_duration) : '\u2014'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {file.pr_url ? (
                      <a
                        href={file.pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-500 hover:underline"
                      >
                        #{file.pr_number}
                      </a>
                    ) : (
                      <span className="text-gray-300">{'\u2014'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {file.devin_url ? (
                      <a
                        href={file.devin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-500 hover:underline"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-gray-300">{'\u2014'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {(file.status === 'pending' || file.status === 'needs_human' || file.status === 'failed') && (
                      <select
                        className="bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) {
                            onStatusChange(file.id, e.target.value);
                            e.target.value = '';
                          }
                        }}
                      >
                        <option value="" disabled>Change…</option>
                        <option value="skipped">Skip</option>
                        <option value="pending">Reset to Pending</option>
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-6 py-3 border-t border-gray-200 text-sm text-gray-500">
        Showing {sortedFiles.length} of {files.length} files
      </div>
    </div>
  );
}
