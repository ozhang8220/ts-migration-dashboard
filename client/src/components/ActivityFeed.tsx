import type { ActivityEntry } from '../types';

interface Props {
  activity: ActivityEntry[];
}

function formatTime(dateStr: string): string {
  try {
    const date = new Date(dateStr.replace(' ', 'T') + 'Z');
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return dateStr;
  }
}

const statusEmojis: Record<string, string> = {
  pending: '\u23F3',
  queued: '\u23F3',
  in_progress: '\uD83D\uDD04',
  pr_open: '\uD83D\uDC40',
  merged: '\u2705',
  needs_human: '\uD83D\uDCAC',
  failed: '\u274C',
  skipped: '\u23ED\uFE0F',
};

const statusLabels: Record<string, string> = {
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

export default function ActivityFeed({ activity }: Props) {
  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB] p-5 flex flex-col h-full" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <h2 className="text-[15px] font-semibold text-[#111827] mb-3">Activity Feed</h2>
      <div className="space-y-0.5 flex-1 overflow-y-auto pr-2">
        {activity.length === 0 ? (
          <p className="text-sm text-[#9CA3AF] text-center py-8">No activity yet</p>
        ) : (
          activity.map((entry) => {
            const emoji = statusEmojis[entry.new_status] || '';
            const label = statusLabels[entry.new_status] || entry.new_status;

            return (
              <div
                key={entry.id}
                className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-[#F9FAFB] transition-colors text-sm"
              >
                <span className="text-xs text-[#9CA3AF] whitespace-nowrap min-w-[70px]">
                  {formatTime(entry.created_at)}
                </span>
                <span className="text-[#D1D5DB]">{"\u2014"}</span>
                {entry.file_path ? (
                  <>
                    <span className="font-mono text-[#374151]">{getDisplayFilename(entry.file_path, entry.new_status)}</span>
                    <span className="text-[#D1D5DB]">{"\u2192"}</span>
                    <span className="text-[#6B7280]">{label}</span>
                    <span>{emoji}</span>
                  </>
                ) : (
                  <span className="text-[#6B7280]">{entry.message}</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
