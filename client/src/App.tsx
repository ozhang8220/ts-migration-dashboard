import { useDashboardData } from './hooks/useApi';
import ProgressSection from './components/ProgressSection';
import FileTable from './components/FileTable';
import ActionPanel from './components/ActionPanel';
import ActivityFeed from './components/ActivityFeed';

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export default function App() {
  const {
    stats,
    files,
    batches,
    activity,
    lastUpdated,
    loading,
    error,
    startBatch,
    updateFileStatus,
  } = useDashboardData();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-lg">Loading dashboard…</span>
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-8 max-w-md text-center">
          <h2 className="text-lg font-semibold text-red-400 mb-2">Connection Error</h2>
          <p className="text-sm text-gray-400">{error}</p>
          <p className="text-xs text-gray-500 mt-2">Make sure the server is running on port 3001</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
              TS
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-100">ShopDirect TypeScript Migration</h1>
              <p className="text-xs text-gray-500">Automated JS → TS migration tracking</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Last updated: {formatTimestamp(lastUpdated)}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {error && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-400">
            Warning: Failed to refresh data. Showing cached results. ({error})
          </div>
        )}

        {stats && <ProgressSection stats={stats} />}

        <div className="grid grid-cols-3 gap-8">
          <div className="col-span-2">
            <ActionPanel batches={batches} onStartBatch={startBatch} />
          </div>
          <div className="col-span-1">
            <ActivityFeed activity={activity} />
          </div>
        </div>

        <FileTable files={files} onStatusChange={updateFileStatus} />
      </main>
    </div>
  );
}
