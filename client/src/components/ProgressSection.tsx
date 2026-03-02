import type { Stats } from '../types';

interface Props {
  stats: Stats;
}

const statusCards = [
  { key: 'merged', label: 'Merged', icon: '✅', color: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' },
  { key: 'pr_open', label: 'PR Open', icon: '🟡', color: 'bg-amber-500/10 border-amber-500/30 text-amber-400' },
  { key: 'in_progress', label: 'In Progress', icon: '🔄', color: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' },
  { key: 'pending', label: 'Pending', icon: '⏳', color: 'bg-gray-500/10 border-gray-500/30 text-gray-400' },
  { key: 'needs_human', label: 'Needs Attention', icon: '⚠️', color: 'bg-orange-500/10 border-orange-500/30 text-orange-400' },
];

export default function ProgressSection({ stats }: Props) {
  const { progressPercent, byStatus, totalFiles } = stats;
  const merged = byStatus['merged'] || 0;

  return (
    <div className="space-y-6">
      {/* Progress Bar */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-100">Migration Progress</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              {merged} of {totalFiles} files migrated to TypeScript
            </p>
          </div>
          <span className="text-3xl font-bold text-emerald-400">{progressPercent}%</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-4 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-700 ease-out"
            style={{ width: `${Math.max(progressPercent, 1)}%` }}
          />
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-5 gap-4">
        {statusCards.map((card) => (
          <div
            key={card.key}
            className={`rounded-xl border p-4 ${card.color} transition-all hover:scale-[1.02]`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{card.icon}</span>
              <span className="text-sm font-medium opacity-80">{card.label}</span>
            </div>
            <span className="text-3xl font-bold">{byStatus[card.key] || 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
