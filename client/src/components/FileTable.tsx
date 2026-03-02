import { useState, useMemo } from 'react';
import type { MigrationFile, FileStatus } from '../types';

interface Props {
  files: MigrationFile[];
  onStatusChange: (fileId: string, status: string) => void;
}

const statusConfig: Record<FileStatus, { label: string; classes: string }> = {
  pending: { label: 'Pending', classes: 'bg-gray-700/50 text-gray-300 border-gray-600' },
  queued: { label: 'Queued', classes: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  in_progress: { label: 'In Progress', classes: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' },
  pr_open: { label: 'PR Open', classes: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  merged: { label: 'Merged', classes: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  needs_human: { label: 'Needs Human', classes: 'bg-orange-500/20 text-orange-300 border-orange-500/40' },
  failed: { label: 'Failed', classes: 'bg-red-500/20 text-red-300 border-red-500/40' },
  skipped: { label: 'Skipped', classes: 'bg-gray-600/50 text-gray-400 border-gray-500' },
};

const complexityConfig: Record<string, { dot: string; label: string }> = {
  low: { dot: 'bg-emerald-400', label: 'Low' },
  medium: { dot: 'bg-yellow-400', label: 'Medium' },
  high: { dot: 'bg-red-400', label: 'High' },
};

type SortField = 'path' | 'complexity' | 'dep_depth' | 'loc' | 'status';

const allStatuses: FileStatus[] = ['pending', 'queued', 'in_progress', 'pr_open', 'merged', 'needs_human', 'failed', 'skipped'];

export default function FileTable({ files, onStatusChange }: Props) {
  const [sortField, setSortField] = useState<SortField>('dep_depth');
  const [sortAsc, setSortAsc] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');

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
      className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200 select-none"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && (
          <span className="text-indigo-400">{sortAsc ? '↑' : '↓'}</span>
        )}
      </div>
    </th>
  );

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <h2 className="text-lg font-semibold text-gray-100">Files</h2>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">Filter:</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          >
            <option value="all">All Statuses</option>
            {allStatuses.map((s) => (
              <option key={s} value={s}>{statusConfig[s].label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-800/50">
            <tr>
              <SortHeader field="path">File Path</SortHeader>
              <SortHeader field="complexity">Complexity</SortHeader>
              <SortHeader field="dep_depth">Depth</SortHeader>
              <SortHeader field="loc">LOC</SortHeader>
              <SortHeader field="status">Status</SortHeader>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">PR Link</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {sortedFiles.map((file) => {
              const statusCfg = statusConfig[file.status];
              const complexityCfg = complexityConfig[file.complexity] || complexityConfig.low;

              return (
                <tr key={file.id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-sm font-mono text-gray-200">{file.path}</span>
                    {file.error_reason && (
                      <p className="text-xs text-orange-400 mt-1 max-w-md truncate" title={file.error_reason}>
                        {file.error_reason}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${complexityCfg.dot}`} />
                      <span className="text-sm text-gray-300">{complexityCfg.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">{file.dep_depth}</td>
                  <td className="px-4 py-3 text-sm text-gray-300">{file.loc}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusCfg.classes}`}>
                      {statusCfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {file.pr_url ? (
                      <a
                        href={file.pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 hover:text-indigo-300 hover:underline"
                      >
                        #{file.pr_number}
                      </a>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {(file.status === 'pending' || file.status === 'needs_human' || file.status === 'failed') && (
                      <select
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
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
      <div className="px-6 py-3 border-t border-gray-800 text-sm text-gray-500">
        Showing {sortedFiles.length} of {files.length} files
      </div>
    </div>
  );
}
