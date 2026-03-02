import type { ActivityEntry } from '../types';

interface Props {
  activity: ActivityEntry[];
}

function formatTime(dateStr: string): string {
  try {
    // SQLite datetime format: "YYYY-MM-DD HH:MM:SS"
    const date = new Date(dateStr.replace(' ', 'T') + 'Z');
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return dateStr;
  }
}

const statusEmojis: Record<string, string> = {
  pending: '⏳',
  queued: '📋',
  in_progress: '🔄',
  pr_open: '🟡',
  merged: '✅',
  needs_human: '⚠️',
  failed: '❌',
  skipped: '⏭️',
};

export default function ActivityFeed({ activity }: Props) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <h2 className="text-lg font-semibold text-gray-100 mb-4">Activity Feed</h2>
      <div className="space-y-1 max-h-80 overflow-y-auto pr-2">
        {activity.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No activity yet</p>
        ) : (
          activity.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-gray-800/30 transition-colors"
            >
              <span className="text-xs text-gray-500 whitespace-nowrap mt-0.5 min-w-[70px]">
                {formatTime(entry.created_at)}
              </span>
              <span className="text-sm text-gray-300">
                {entry.message} {statusEmojis[entry.new_status] || ''}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
