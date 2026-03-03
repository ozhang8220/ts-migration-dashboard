import { useState, useRef, useEffect } from 'react';
import type { Stats, MigrationFile } from '../types';

interface Props {
  stats: Stats;
  files: MigrationFile[];
}

const statusCards = [
  { key: 'merged', label: 'Completed', bg: 'bg-[#DCFCE7]', text: 'text-[#16A34A]', count: 'text-[#16A34A]' },
  { key: 'pr_open', label: 'Ready for Review', bg: 'bg-[#FEF3C7]', text: 'text-[#D97706]', count: 'text-[#D97706]' },
  { key: 'needs_human', label: 'Feedback Needed', bg: 'bg-[#FED7AA]', text: 'text-[#EA580C]', count: 'text-[#EA580C]' },
  { key: 'in_progress', label: 'In Progress', bg: 'bg-[#DBEAFE]', text: 'text-[#2563EB]', count: 'text-[#2563EB]' },
  { key: 'pending', label: 'Queued', bg: 'bg-[#F3F4F6]', text: 'text-[#6B7280]', count: 'text-[#6B7280]' },
];

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return `${hours}h ${remainMinutes}m`;
}

function getDisplayPath(path: string, status: string): string {
  if (status === 'merged') {
    return path.replace(/\.jsx$/, '.tsx').replace(/\.js$/, '.ts');
  }
  return path;
}

export default function ProgressSection({ stats, files }: Props) {
  const { progressPercent, byStatus, totalFiles, totalSessionDurationSeconds, sessionCount, rateLimit } = stats;
  const merged = byStatus['merged'] || 0;
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setExpandedCard(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleCard = (key: string) => {
    setExpandedCard(expandedCard === key ? null : key);
  };

  return (
    <div className="space-y-6">
      {/* Progress Bar */}
      <div className="bg-white rounded-lg border border-[#E5E7EB] p-6" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[15px] font-semibold text-[#111827]">Migration Progress</h2>
            <p className="text-sm text-[#6B7280] mt-0.5">
              {merged} of {totalFiles} files migrated to TypeScript
            </p>
          </div>
          <div className="flex items-center gap-4">
            {rateLimit.remaining !== null && (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
                  rateLimit.remaining < 100
                    ? 'bg-red-50 border-red-200 text-red-600'
                    : rateLimit.remaining < 500
                    ? 'bg-amber-50 border-amber-200 text-amber-600'
                    : 'bg-[#F3F4F6] border-[#E5E7EB] text-[#6B7280]'
                }`}
                title={rateLimit.resetsAt ? `Resets at ${new Date(rateLimit.resetsAt).toLocaleTimeString()}` : ''}
              >
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
                {rateLimit.remaining}/{rateLimit.total || '?'}
              </span>
            )}
            {sessionCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[#F3F4F6] border border-[#E5E7EB] text-[#6B7280]">
                Devin: {formatDuration(totalSessionDurationSeconds)} ({sessionCount} sessions)
              </span>
            )}
            <span className="text-3xl font-bold text-[#3B82F6]">{progressPercent}%</span>
          </div>
        </div>
        <div className="w-full bg-[#F3F4F6] rounded-full h-2.5 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#3B82F6] transition-all duration-700 ease-out"
            style={{ width: `${Math.max(progressPercent, 1)}%` }}
          />
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-5 gap-4" ref={dropdownRef}>
        {statusCards.map((card) => {
          const cardCount = byStatus[card.key] || 0;
          const isExpanded = expandedCard === card.key;
          const cardFiles = files.filter((f) => f.status === card.key);

          return (
            <div key={card.key} className="relative">
              <button
                onClick={() => cardCount > 0 && toggleCard(card.key)}
                className={`w-full text-left rounded-lg p-4 ${card.bg} transition-all hover:shadow-sm ${
                  cardCount > 0 ? 'cursor-pointer' : 'cursor-default'
                } ${isExpanded ? 'ring-2 ring-[#3B82F6]/30' : ''}`}
              >
                <p className={`text-xs font-medium ${card.text} mb-1`}>{card.label}</p>
                <span className={`text-2xl font-bold ${card.count}`}>{cardCount}</span>
              </button>

              {isExpanded && cardFiles.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg border border-[#E5E7EB] shadow-lg z-20 max-h-64 overflow-y-auto">
                  {cardFiles.map((file) => (
                    <div key={file.id} className="px-3 py-2 border-b border-[#F3F4F6] last:border-0 hover:bg-[#F9FAFB]">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-[#374151] truncate flex-1">
                          {getDisplayPath(file.path, file.status)}
                        </span>
                        {file.pr_url && file.pr_number && (
                          <a
                            href={file.pr_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[#3B82F6] hover:underline ml-2 whitespace-nowrap"
                          >
                            PR #{file.pr_number}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
