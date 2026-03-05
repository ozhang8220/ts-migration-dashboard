import { useState } from 'react';
import { useDashboardData } from './hooks/useApi';
import ProgressSection from './components/ProgressSection';
import FileTable from './components/FileTable';
import ActionPanel from './components/ActionPanel';
import ActivityFeed from './components/ActivityFeed';
import AnalyzeForm from './components/AnalyzeForm';
import RepoSelector from './components/RepoSelector';
import Sidebar from './components/Sidebar';

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
    analyzeRepo,
    toggleAutoProgress,
    resumeBatch,
    getBatchFiles,
    getRepos,
    archiveRepo,
    restoreRepo,
    wipeRepo,
  } = useDashboardData();

  const [showRepoModal, setShowRepoModal] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showLandingOverride, setShowLandingOverride] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <svg className="animate-spin h-5 w-5 text-[#9CA3AF]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-[#6B7280]">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <div className="bg-white border border-red-200 rounded-lg p-8 max-w-md text-center" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h2 className="text-lg font-semibold text-red-600 mb-2">Connection Error</h2>
          <p className="text-sm text-[#6B7280]">{error}</p>
          <p className="text-xs text-[#9CA3AF] mt-2">Make sure the server is running on port 3001</p>
        </div>
      </div>
    );
  }

  const repoConfig = stats?.repoConfig;
  const hasActiveRepo = Boolean(repoConfig?.owner && repoConfig?.repo);
  const showAddRepoLanding = !hasActiveRepo || showLandingOverride;
  const showAnalyzeForm = hasActiveRepo && stats && stats.totalFiles === 0;
  const autoProgress = repoConfig?.autoProgress ?? false;

  const handleSelectRepo = async (fullName: string, branch: string) => {
    setShowLandingOverride(false);
    return analyzeRepo(fullName, branch);
  };

  const handleAnalyzeRepo = async (repoFullName: string, branch: string) => {
    setShowLandingOverride(false);
    return analyzeRepo(repoFullName, branch);
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Sidebar */}
      <Sidebar
        repoConfig={repoConfig ?? null}
        onSelectRepo={handleSelectRepo}
        onAddRepo={() => setShowRepoModal(true)}
        onGoHome={() => setShowLandingOverride(true)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onGetRepos={getRepos}
        onArchiveRepo={archiveRepo}
        onRestoreRepo={restoreRepo}
        onWipeRepo={wipeRepo}
      />

      {/* Main content area */}
      <div className={`transition-[margin-left] duration-200 ease-in-out ${sidebarCollapsed ? 'ml-12' : 'ml-[250px]'}`}>
        {/* Header */}
        <header className="border-b border-[#E5E7EB] bg-white sticky top-0 z-10">
          <div className="px-8 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-[15px] font-bold text-[#111827]">TypeScript Migration</h1>
              {repoConfig?.owner && repoConfig?.repo && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-[#F3F4F6] text-[#6B7280]">
                  {repoConfig.owner}/{repoConfig.repo}
                  {repoConfig.branch && repoConfig.branch !== 'main' && (
                    <span className="ml-1.5 text-[#9CA3AF]">@{repoConfig.branch}</span>
                  )}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[13px] text-[#6B7280]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Last updated: {formatTimestamp(lastUpdated)}</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="px-8 py-6 space-y-6">
          {error && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              Warning: Failed to refresh data. Showing cached results. ({error})
            </div>
          )}

          {showAddRepoLanding ? (
            <div className="max-w-xl mx-auto">
              <div className="bg-white rounded-lg border border-[#E5E7EB] p-8 text-center" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <h2 className="text-xl font-semibold text-[#111827] mb-2">No active repository</h2>
                <p className="text-sm text-[#6B7280] mb-6">
                  Add a repository to start tracking migration progress and batches.
                </p>
                <button
                  onClick={() => setShowRepoModal(true)}
                  className="px-5 py-2.5 bg-[#111827] hover:bg-[#1F2937] text-white font-medium rounded-lg text-sm transition-colors"
                >
                  Add Repository
                </button>
              </div>
            </div>
          ) : showAnalyzeForm ? (
            <AnalyzeForm onAnalyze={handleAnalyzeRepo} />
          ) : (
            <>
              {stats && <ProgressSection stats={stats} files={files} />}

              <div className="grid grid-cols-5 gap-6">
                <div className="col-span-2 h-[400px]">
                  <ActionPanel
                    batches={batches}
                    autoProgress={autoProgress}
                    onStartBatch={startBatch}
                    onToggleAutoProgress={toggleAutoProgress}
                    onResumeBatch={resumeBatch}
                    onGetBatchFiles={getBatchFiles}
                  />
                </div>
                <div className="col-span-3 h-[400px]">
                  <ActivityFeed activity={activity} />
                </div>
              </div>

              <FileTable files={files} onStatusChange={updateFileStatus} />
            </>
          )}
        </main>
      </div>

      {/* Repo modal (rendered outside layout flow) */}
      <RepoSelector
        repoConfig={repoConfig ?? null}
        onAnalyze={handleAnalyzeRepo}
        showModal={showRepoModal}
        onCloseModal={() => setShowRepoModal(false)}
      />
    </div>
  );
}
