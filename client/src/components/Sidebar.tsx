import { useState, useEffect, useRef } from 'react';
import type { RepoConfig, AnalysisResult, RepoInfo } from '../types';

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
  onGoHome: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onGetRepos: () => Promise<RepoInfo[]>;
  onArchiveRepo: (repoId: string) => Promise<void>;
  onRestoreRepo: (repoId: string) => Promise<void>;
  onWipeRepo: (repoId: string) => Promise<void>;
}

export default function Sidebar({ repoConfig, onSelectRepo, onAddRepo, onGoHome, collapsed, onToggleCollapse, onGetRepos, onArchiveRepo, onRestoreRepo, onWipeRepo }: Props) {
  const [recentRepos, setRecentRepos] = useState<RecentRepo[]>(loadRecentRepos);
  const [allRepos, setAllRepos] = useState<RepoInfo[]>([]);
  const [switchingRepo, setSwitchingRepo] = useState<string | null>(null);
  const [menuOpenRepo, setMenuOpenRepo] = useState<string | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState<{ repoId: string; name: string } | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archivedRepos, setArchivedRepos] = useState<RepoInfo[]>([]);
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [archivedMenuOpenRepo, setArchivedMenuOpenRepo] = useState<string | null>(null);
  const [wipeConfirm, setWipeConfirm] = useState<{ repoId: string; name: string } | null>(null);
  const [wiping, setWiping] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentRepo = repoConfig?.owner && repoConfig?.repo
    ? `${repoConfig.owner}/${repoConfig.repo}`
    : null;
  const currentBranch = repoConfig?.branch || 'main';

  const getRepoId = (repo: RecentRepo): string => {
    return `${repo.fullName}:${repo.branch}`;
  };

  const archivedRepoIdSet = new Set(
    archivedRepos
      .map((r) => r.repoId)
      .filter((id): id is string => Boolean(id))
  );
  const activeRepoIdSet = new Set(
    allRepos
      .filter((r) => !r.archived)
      .map((r) => r.repoId)
      .filter((id): id is string => Boolean(id))
  );

  const reposToShow = [...recentRepos];
  if (currentRepo) {
    const exists = reposToShow.some((r) => r.fullName === currentRepo && r.branch === currentBranch);
    if (!exists) {
      reposToShow.unshift({ fullName: currentRepo, branch: currentBranch, connectedAt: Date.now() });
    }
  }

  // Show only active repos that still exist server-side (prevents stale localStorage entries)
  const activeReposToShow = reposToShow.filter((r) => {
    const id = getRepoId(r);
    return !archivedRepoIdSet.has(id) && activeRepoIdSet.has(id);
  });

  useEffect(() => {
    setRecentRepos(loadRecentRepos());
  }, [currentRepo, currentBranch]);

  // Load repos (active + archived)
  useEffect(() => {
    loadRepos();
  }, []);

  const loadRepos = async () => {
    try {
      const repos = await onGetRepos();
      setAllRepos(repos);
      setArchivedRepos(repos.filter(r => r.archived));
    } catch {
      // ignore
    }
  };

  const removeRecentRepoByRepoId = (repoId: string) => {
    const idx = repoId.lastIndexOf(':');
    if (idx <= 0) return;
    const fullName = repoId.slice(0, idx);
    const branch = repoId.slice(idx + 1);
    const next = recentRepos.filter((r) => !(r.fullName === fullName && r.branch === branch));
    setRecentRepos(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  };

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenRepo(null);
        setArchivedMenuOpenRepo(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const handleArchive = async () => {
    if (!archiveConfirm) return;
    setArchiving(true);
    try {
      await onArchiveRepo(archiveConfirm.repoId);
      setArchiveConfirm(null);
      setMenuOpenRepo(null);
      await loadRepos();
    } catch {
      // error handled elsewhere
    } finally {
      setArchiving(false);
    }
  };

  const handleRestore = async (repoId: string) => {
    setRestoring(repoId);
    try {
      await onRestoreRepo(repoId);
      await loadRepos();
    } catch {
      // error handled elsewhere
    } finally {
      setRestoring(null);
    }
  };

  const handleWipe = async () => {
    if (!wipeConfirm) return;
    setWiping(true);
    try {
      await onWipeRepo(wipeConfirm.repoId);
      removeRecentRepoByRepoId(wipeConfirm.repoId);
      setWipeConfirm(null);
      await loadRepos();
    } catch {
      // error handled elsewhere
    } finally {
      setWiping(false);
    }
  };

  return (
    <>
    <aside
      className={`fixed top-0 left-0 bottom-0 bg-white border-r border-[#E5E7EB] flex flex-col z-20 transition-[width] duration-200 ease-in-out ${
        collapsed ? 'w-12' : 'w-[250px]'
      }`}
    >
      {/* Header with toggle */}
      <div className={`flex items-center border-b border-[#F3F4F6] ${collapsed ? 'justify-center py-5 px-1' : 'justify-between px-5 py-5'}`}>
        {!collapsed && (
          <button
            onClick={onGoHome}
            className="text-sm font-semibold text-[#111827] tracking-tight hover:text-[#1F2937] transition-colors"
            title="Go to landing page"
          >
            TS Migrate
          </button>
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
            {activeReposToShow.map((repo) => {
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
          <div className="flex-1 overflow-y-auto px-3 py-4" ref={menuRef}>
            <h2 className="px-2 text-[11px] font-medium text-[#6B7280] uppercase tracking-wider mb-2">Repositories</h2>
            <div className="space-y-0.5">
              {activeReposToShow.map((repo) => {
                const isActive = repo.fullName === currentRepo && repo.branch === currentBranch;
                const isSwitching = switchingRepo === repo.fullName;
                const repoName = repo.fullName.split('/').pop() || repo.fullName;
                const repoId = getRepoId(repo);
                const isMenuOpen = menuOpenRepo === repoId;

                return (
                  <div key={`${repo.fullName}-${repo.branch}`} className="relative group">
                    <button
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

                    {/* Three-dot menu button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenRepo(isMenuOpen ? null : repoId);
                      }}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded flex items-center justify-center text-[#9CA3AF] hover:text-[#6B7280] hover:bg-[#E5E7EB] transition-all ${
                        isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>

                    {/* Dropdown menu */}
                    {isMenuOpen && (
                      <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-[#E5E7EB] rounded-lg shadow-lg z-30 py-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setArchiveConfirm({ repoId, name: repo.fullName });
                            setMenuOpenRepo(null);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#111827] transition-colors"
                        >
                          Archive
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {activeReposToShow.length === 0 && (
                <p className="px-3 py-4 text-xs text-[#9CA3AF] text-center">No repositories connected</p>
              )}
            </div>

            {/* Archived section */}
            <div className="mt-6 pt-3 border-t border-[#F3F4F6]">
              <button
                onClick={() => setArchivedExpanded(!archivedExpanded)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-[11px] font-medium text-[#6B7280] uppercase tracking-wider hover:bg-[#F9FAFB] hover:text-[#111827] transition-colors"
              >
                <span className="inline-flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-[#9CA3AF]" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2.5 4A1.5 1.5 0 014 2.5h12A1.5 1.5 0 0117.5 4v1a1.5 1.5 0 01-1.5 1.5h-12A1.5 1.5 0 012.5 5V4zm0 4.5A1.5 1.5 0 014 7h12a1.5 1.5 0 011.5 1.5V16A1.5 1.5 0 0116 17.5H4A1.5 1.5 0 012.5 16V8.5zm5.75 2a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5z" />
                  </svg>
                  Archived
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#F3F4F6] text-[#6B7280] text-[10px] normal-case tracking-normal">
                    {archivedRepos.length}
                  </span>
                  <svg
                    className={`w-3 h-3 transition-transform ${archivedExpanded ? 'rotate-180' : ''}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </span>
              </button>
              {archivedExpanded && (
                <div className="space-y-1 mt-1.5">
                  {archivedRepos.length === 0 ? (
                    <p className="px-3 py-2 text-[11px] text-[#9CA3AF]">No archived repos</p>
                  ) : (
                    archivedRepos.map((repo) => {
                      const repoName = repo.repo || (repo.repoId?.split('/').pop()?.split(':')[0]) || 'Unknown';
                      const repoId = repo.repoId || '';
                      const isRestoring = restoring === (repo.repoId || '');
                      const isArchivedMenuOpen = archivedMenuOpenRepo === repoId;
                      return (
                        <div
                          key={repo.repoId || repo.id}
                          className="relative flex items-center justify-between px-3 py-2 rounded-lg bg-[#FAFAFA] border border-[#F3F4F6] group"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-[#6B7280] truncate">{repoName}</p>
                            <p className="text-[10px] text-[#9CA3AF] truncate">{repo.branch}</p>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!repoId) return;
                              setArchivedMenuOpenRepo(isArchivedMenuOpen ? null : repoId);
                            }}
                            className={`ml-2 w-6 h-6 rounded flex items-center justify-center text-[#9CA3AF] hover:text-[#6B7280] hover:bg-[#E5E7EB] transition-all ${
                              isArchivedMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}
                            disabled={!repoId}
                          >
                            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                          </button>

                          {isArchivedMenuOpen && repoId && (
                            <div className="absolute right-2 top-full mt-1 w-32 bg-white border border-[#E5E7EB] rounded-lg shadow-lg z-30 py-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setArchivedMenuOpenRepo(null);
                                  handleRestore(repoId);
                                }}
                                disabled={isRestoring}
                                className="w-full text-left px-3 py-2 text-[11px] text-[#3B82F6] hover:bg-[#F9FAFB] hover:text-[#2563EB] disabled:opacity-50 transition-colors"
                              >
                                {isRestoring ? 'Restoring...' : 'Restore'}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setArchivedMenuOpenRepo(null);
                                  setWipeConfirm({ repoId, name: `${repo.owner}/${repo.repo}@${repo.branch}` });
                                }}
                                className="w-full text-left px-3 py-2 text-[11px] text-[#DC2626] hover:bg-[#F9FAFB] hover:text-[#B91C1C] transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
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

    {/* Archive confirmation modal */}
    {archiveConfirm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-2xl p-6 max-w-md mx-4" style={{ boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
          <h3 className="text-lg font-semibold text-[#111827] mb-2">
            Archive {archiveConfirm.name}?
          </h3>
          <p className="text-sm text-[#6B7280] mb-5 leading-relaxed">
            This will hide the repo from your active list. All migration data {"\u2014"} files, PRs, Devin sessions, activity history {"\u2014"} will be preserved. You can restore it anytime.
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setArchiveConfirm(null)}
              className="px-4 py-2 text-sm font-medium text-[#6B7280] hover:text-[#111827] rounded-lg hover:bg-[#F3F4F6] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleArchive}
              disabled={archiving}
              className="px-4 py-2 text-sm font-medium text-white bg-[#D97706] hover:bg-[#B45309] rounded-lg transition-colors disabled:opacity-50"
            >
              {archiving ? 'Archiving...' : 'Archive'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Delete confirmation modal */}
    {wipeConfirm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-2xl p-6 max-w-md mx-4" style={{ boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
          <h3 className="text-lg font-semibold text-[#111827] mb-2">
            Permanently delete {wipeConfirm.name}?
          </h3>
          <p className="text-sm text-[#6B7280] mb-5 leading-relaxed">
            This will permanently delete all dashboard data for this repo/branch (files, batches, activity, sessions). This cannot be undone.
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setWipeConfirm(null)}
              className="px-4 py-2 text-sm font-medium text-[#6B7280] hover:text-[#111827] rounded-lg hover:bg-[#F3F4F6] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleWipe}
              disabled={wiping}
              className="px-4 py-2 text-sm font-medium text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-lg transition-colors disabled:opacity-50"
            >
              {wiping ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
