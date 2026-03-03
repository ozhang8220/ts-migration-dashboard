import type { Stats } from '../types';

interface Props {
  stats: Stats;
}

const statusCards = [
  { key: 'merged', label: 'Merged', icon: '\u2705', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', count: 'text-green-600' },
  { key: 'pr_open', label: 'PR Open', icon: '\uD83D\uDD17', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', count: 'text-amber-600' },
  { key: 'in_progress', label: 'In Progress', icon: '\uD83D\uDD04', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', count: 'text-blue-600' },
  { key: 'pending', label: 'Pending', icon: '\u23F3', bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-500', count: 'text-gray-600' },
  { key: 'needs_human', label: 'Needs Attention', icon: '\u26A0\uFE0F', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', count: 'text-orange-600' },
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

export default function ProgressSection({ stats }: Props) {
  const { progressPercent, byStatus, totalFiles, totalSessionDurationSeconds, sessionCount, rateLimit } = stats;
  const merged = byStatus['merged'] || 0;

  return (
    <div className="space-y-6">
      {/* Progress Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Migration Progress</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {merged} of {totalFiles} files migrated to TypeScript
            </p>
          </div>
          <div className="flex items-center gap-4">
            {rateLimit.remaining !== null && (
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                  rateLimit.remaining < 100
                    ? 'bg-red-50 border-red-200 text-red-600'
                    : rateLimit.remaining < 500
                    ? 'bg-amber-50 border-amber-200 text-amber-600'
                    : 'bg-gray-50 border-gray-200 text-gray-500'
                }`}
                title={rateLimit.resetsAt ? `Resets at ${new Date(rateLimit.resetsAt).toLocaleTimeString()}` : ''}
              >
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
                {rateLimit.remaining}/{rateLimit.total || '?'}
              </span>
            )}
            {sessionCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 border border-blue-200 text-blue-600">
                Devin: {formatDuration(totalSessionDurationSeconds)} ({sessionCount} sessions)
              </span>
            )}
            <span className="text-3xl font-bold text-blue-600">{progressPercent}%</span>
          </div>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-700 ease-out"
            style={{ width: `${Math.max(progressPercent, 1)}%` }}
          />
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-5 gap-4">
        {statusCards.map((card) => (
          <div
            key={card.key}
            className={`rounded-xl border p-4 ${card.bg} ${card.border} transition-all hover:shadow-sm`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">{card.icon}</span>
              <span className={`text-sm font-medium ${card.text}`}>{card.label}</span>
            </div>
            <span className={`text-3xl font-bold ${card.count}`}>{byStatus[card.key] || 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
