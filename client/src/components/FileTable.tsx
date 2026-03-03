import { useState, useMemo } from 'react';
import type { MigrationFile, FileStatus } from '../types';

interface Props {
  files: MigrationFile[];
  onStatusChange: (fileId: string, status: string) => void;
}

const statusConfig: Record<FileStatus, { label: string; classes: string }> = {
  pending: { label: 'Queued', classes: 'bg-[#F3F4F6] text-[#6B7280]' },
  queued: { label: 'Queued', classes: 'bg-[#DBEAFE] text-[#2563EB]' },
  in_progress: { label: 'In Progress', classes: 'bg-[#DBEAFE] text-[#2563EB]' },
  pr_open: { label: 'Ready for Review', classes: 'bg-[#FEF3C7] text-[#D97706]' },
  merged: { label: 'Completed', classes: 'bg-[#DCFCE7] text-[#16A34A]' },
  needs_human: { label: 'Feedback Needed', classes: 'bg-[#FED7AA] text-[#EA580C]' },
  failed: { label: 'Failed', classes: 'bg-[#FEE2E2] text-[#DC2626]' },
  skipped: { label: 'Skipped', classes: 'bg-[#F3F4F6] text-[#6B7280]' },
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

function getPriorityLabel(depth: number): string {
  if (depth === 0) return 'P0 (leaf)';
  return `P${depth}`;
}

export default function FileTable({ files }: Props) {
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
          const order: Record<string, number> = { low: 0, medium: 1, high: 2 };
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

  const SortHeader = ({ field, children, className: extraClass }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <th
      className={`px-4 py-3 text-left text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider cursor-pointer hover:text-[#111827] select-none ${extraClass || ''}`}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && (
          <span className="text-[#3B82F6]">{sortAsc ? '\u2191' : '\u2193'}</span>
        )}
      </div>
    </th>
  );

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB] overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
        <h2 className="text-[15px] font-semibold text-[#111827]">Files</h2>
        <div className="flex items-center gap-2">
          <label className="text-[13px] text-[#6B7280]">Filter:</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-white border border-[#E5E7EB] rounded-md px-3 py-1.5 text-[13px] text-[#374151] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
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
          <thead>
            <tr className="bg-[#F9FAFB]">
              <SortHeader field="path">File Path</SortHeader>
              <SortHeader field="complexity">Complexity</SortHeader>
              <SortHeader field="dep_depth">Priority</SortHeader>
              <SortHeader field="loc">Lines</SortHeader>
              <SortHeader field="status" className="min-w-[160px]">Status</SortHeader>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">PR Link</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">Devin Session</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6]">
            {sortedFiles.map((file) => {
              const statusCfg = statusConfig[file.status];
              const complexityCfg = complexityConfig[file.complexity] || complexityConfig.low;

              return (
                <tr key={file.id} className="hover:bg-[#F9FAFB] transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-sm font-mono text-[#111827]">{getDisplayPath(file.path, file.status)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${complexityCfg.dot}`} />
                      <span className="text-sm text-[#6B7280]">{complexityCfg.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#6B7280]">{getPriorityLabel(file.dep_depth)}</td>
                  <td className="px-4 py-3 text-sm text-[#6B7280]">{file.loc}</td>
                  <td className="px-4 py-3 min-w-[160px]">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${statusCfg.classes}`}>
                      {statusCfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {file.pr_url ? (
                      <a
                        href={file.pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#3B82F6] hover:text-[#2563EB] hover:underline"
                      >
                        #{file.pr_number}
                      </a>
                    ) : (
                      <span className="text-[#D1D5DB]">{"\u2014"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {file.devin_url ? (
                      <a
                        href={file.devin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#3B82F6] hover:text-[#2563EB] hover:underline"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-[#D1D5DB]">{"\u2014"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-6 py-3 border-t border-[#E5E7EB] text-[13px] text-[#6B7280]">
        Showing {sortedFiles.length} of {files.length} files
      </div>
    </div>
  );
}
