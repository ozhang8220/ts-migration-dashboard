import { useState } from 'react';
import type { ErrorLogEntry } from '../types';

interface Props {
  errors: ErrorLogEntry[];
}

function formatTime(dateStr: string): string {
  try {
    const date = new Date(dateStr.replace(' ', 'T') + 'Z');
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return dateStr;
  }
}

export default function ErrorsPanel({ errors }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (errors.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB] overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-[#F9FAFB] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-[#DC2626]">Error Log</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#FEE2E2] text-[#DC2626]">
            {errors.length}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-[#9CA3AF] transition-transform ${expanded ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-[#E5E7EB] max-h-64 overflow-y-auto">
          {errors.map((err) => (
            <div key={err.id} className="px-5 py-3 border-b border-[#F3F4F6] last:border-0">
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#9CA3AF] min-w-[70px]">{formatTime(err.created_at)}</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-[#F3F4F6] text-[#6B7280]">
                  {err.source}
                </span>
                <span className="text-sm text-[#DC2626] truncate">{err.message}</span>
              </div>
              {err.details && (
                <p className="mt-1 text-xs text-[#9CA3AF] ml-[86px] truncate" title={err.details}>
                  {err.details}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
