import { useState, useEffect } from 'react';
import type { RepoConfig, AnalysisResult } from '../types';

interface RecentRepo {
  fullName: string;
  branch: string;
  connectedAt: number;
}

const STORAGE_KEY = 'ts-migration-recent-repos';

function loadRecentRepos(): RecentRepo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

interface Props {
  repoConfig: RepoConfig | null;
  onSelectRepo: (fullName: string, branch: string) => Promise<AnalysisResult>;
  onAddRepo: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({ repoConfig, onSelectRepo, onAddRepo, collapsed, onToggleCollapse }: Props) {
  const [recentRepos, setRecentRepos] = useState<RecentRepo[]>(loadRecentRepos);
  const [switchingRepo, setSwitchingRepo] = useState<string | null>(null);

  const currentRepo = repoConfig?.owner && repoConfig?.repo
    ? `${repoConfig.owner}/${repoConfig.repo}`
    : null;
  const currentBranch = repoConfig?.branch || 'main';

  const reposToShow = [...recentRepos];
  if (currentRepo) {
    const exists = reposToShow.some((r) => r.fullName === currentRepo && r.branch === currentBranch);
    if (!exists) {
      reposToShow.unshift({ fullName: currentRepo, branch: currentBranch, connectedAt: Date.now() });
    }
  }

  useEffect(() => {
    setRecentRepos(loadRecentRepos());
  }, [currentRepo, currentBranch]);

  const handleSelectRepo = async (repo: RecentRepo) => {
    if (repo.fullName === currentRepo && repo.branch === currentBranch) return;
    setSwitchingRepo(repo.fullName);
    try {
      await onSelectRepo(repo.fullName, repo.branch);
    } catch {
      // errors handled elsewhere
    } finally {
      setSwitchingRepo(null);
    }
  };

  return (
    <aside
      className={`fixed top-0 left-0 bottom-0 bg-white border-r border-[#E5E7EB] flex flex-col z-20 transition-[width] duration-200 ease-in-out ${
        collapsed ? 'w-12' : 'w-[250px]'
      }`}
    >
      {/* Header with toggle */}
      <div className={`flex items-center border-b border-[#F3F4F6] ${collapsed ? 'justify-center py-5 px-1' : 'justify-between px-5 py-5'}`}>
        {!collapsed && (
          <h1 className="text-sm font-semibold text-[#111827] tracking-tight">TS Migrate</h1>
        )}
        <button
          onClick={onToggleCollapse}
          className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors p-0.5 rounded hover:bg-[#F3F4F6]"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            {collapsed ? (
              /* >> arrow (expand) */
              <>
                <path d="M7 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M13 4l0 12" strokeLinecap="round" />
              </>
            ) : (
              /* << arrow (collapse) */
              <>
                <path d="M13 4l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M7 4l0 12" strokeLinecap="round" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Collapsed state: just show icons */}
      {collapsed ? (
        <>
          <div className="flex-1 flex flex-col items-center pt-4 gap-1">
            {reposToShow.map((repo) => {
              const isActive = repo.fullName === currentRepo && repo.branch === currentBranch;
              const repoName = repo.fullName.split('/').pop() || repo.fullName;
              return (
                <button
                  key={`${repo.fullName}-${repo.branch}`}
                  onClick={() => handleSelectRepo(repo)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-[#F3F4F6] text-[#111827]'
                      : 'text-[#9CA3AF] hover:bg-[#F9FAFB] hover:text-[#111827]'
                  }`}
                  title={`${repoName} (${repo.branch})`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1h-8a1 1 0 00-1 1v6.708A2.486 2.486 0 014.5 9h8V1.5z" />
                  </svg>
                </button>
              );
            })}
          </div>
          <div className="py-3 flex justify-center border-t border-[#F3F4F6]">
            <button
              onClick={onAddRepo}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#6B7280] hover:text-[#111827] hover:bg-[#F9FAFB] transition-colors"
              title="Add Repository"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </>
      ) : (
        /* Expanded state */
        <>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <h2 className="px-2 text-[11px] font-medium text-[#6B7280] uppercase tracking-wider mb-2">Repositories</h2>
            <div className="space-y-0.5">
              {reposToShow.map((repo) => {
                const isActive = repo.fullName === currentRepo && repo.branch === currentBranch;
                const isSwitching = switchingRepo === repo.fullName;
                const repoName = repo.fullName.split('/').pop() || repo.fullName;

                return (
                  <button
                    key={`${repo.fullName}-${repo.branch}`}
                    onClick={() => handleSelectRepo(repo)}
                    disabled={isSwitching}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-[#F3F4F6] text-[#111827]'
                        : 'text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#111827]'
                    } ${isSwitching ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <svg className="w-4 h-4 text-[#9CA3AF] flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1h-8a1 1 0 00-1 1v6.708A2.486 2.486 0 014.5 9h8V1.5z" />
                      </svg>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{repoName}</p>
                        <p className="text-[11px] text-[#9CA3AF] truncate">{repo.branch}</p>
                      </div>
                      {isSwitching && (
                        <svg className="animate-spin h-3.5 w-3.5 text-[#9CA3AF]" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
              {reposToShow.length === 0 && (
                <p className="px-3 py-4 text-xs text-[#9CA3AF] text-center">No repositories connected</p>
              )}
            </div>
          </div>

          <div className="px-3 py-3 border-t border-[#F3F4F6]">
            <button
              onClick={onAddRepo}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#6B7280] hover:text-[#111827] hover:bg-[#F9FAFB] rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Add Repository
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
