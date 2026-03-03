import { useState, useRef, useEffect } from 'react';
import type { AnalysisResult, RepoConfig } from '../types';

interface RecentRepo {
  fullName: string;
  branch: string;
  connectedAt: number;
}

const STORAGE_KEY = 'ts-migration-recent-repos';
const MAX_RECENT = 10;

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

function saveRecentRepo(fullName: string, branch: string): void {
  const repos = loadRecentRepos().filter(
    (r) => !(r.fullName === fullName && r.branch === branch)
  );
  repos.unshift({ fullName, branch, connectedAt: Date.now() });
  if (repos.length > MAX_RECENT) repos.length = MAX_RECENT;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(repos));
}

interface Props {
  repoConfig: RepoConfig | null;
  onAnalyze: (repoFullName: string, branch: string) => Promise<AnalysisResult>;
}

export default function RepoSelector({ repoConfig, onAnalyze }: Props) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [repoFullName, setRepoFullName] = useState('');
  const [branch, setBranch] = useState('main');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentRepos, setRecentRepos] = useState<RecentRepo[]>(loadRecentRepos);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentRepo = repoConfig?.owner && repoConfig?.repo
    ? `${repoConfig.owner}/${repoConfig.repo}`
    : null;
  const currentBranch = repoConfig?.branch || 'main';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (currentRepo) {
      saveRecentRepo(currentRepo, currentBranch);
      setRecentRepos(loadRecentRepos());
    }
  }, [currentRepo, currentBranch]);

  const openModal = () => {
    setRepoFullName(currentRepo || '');
    setBranch(currentBranch);
    setError(null);
    setIsDropdownOpen(false);
    setShowModal(true);
  };

  const closeModal = () => {
    if (!isAnalyzing) {
      setShowModal(false);
      setError(null);
    }
  };

  const connectRepo = async (fullName: string, branchName: string) => {
    setIsAnalyzing(true);
    setError(null);
    try {
      await onAnalyze(fullName, branchName);
      saveRecentRepo(fullName, branchName);
      setRecentRepos(loadRecentRepos());
      setShowModal(false);
      setIsDropdownOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze repository');
      throw err;
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoFullName.trim()) return;
    try {
      await connectRepo(repoFullName.trim(), branch.trim());
    } catch {
      // error already set in connectRepo
    }
  };

  const handleSelectRecent = async (repo: RecentRepo) => {
    if (repo.fullName === currentRepo && repo.branch === currentBranch) {
      setIsDropdownOpen(false);
      return;
    }
    setIsDropdownOpen(false);
    try {
      await connectRepo(repo.fullName, repo.branch);
    } catch {
      // error will show in modal if opened
    }
  };

  const otherRecentRepos = recentRepos.filter(
    (r) => !(r.fullName === currentRepo && r.branch === currentBranch)
  );

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        {currentRepo ? (
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-colors cursor-pointer"
            title="Switch repository"
          >
            <span className="text-sm text-gray-900 font-medium">Connected: {currentRepo}</span>
            <span className="text-gray-300">{"\u00B7"}</span>
            <span className="text-sm text-gray-500">{currentBranch}</span>
            <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        ) : (
          <button
            onClick={openModal}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-300 transition-colors cursor-pointer"
            title="Connect a repository"
          >
            <svg className="w-4 h-4 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-medium text-blue-700">Connect Repo</span>
          </button>
        )}

        {isDropdownOpen && (
          <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-lg border border-gray-200 shadow-lg z-30 overflow-hidden">
            {currentRepo && (
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{currentRepo}</p>
                    <p className="text-xs text-gray-400">{currentBranch}</p>
                  </div>
                  <svg className="w-4 h-4 text-blue-500 flex-shrink-0 ml-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            )}

            {otherRecentRepos.length > 0 && (
              <div className="border-b border-gray-100">
                <p className="px-4 pt-2 pb-1 text-xs font-medium text-gray-400 uppercase tracking-wider">Recent</p>
                {otherRecentRepos.map((repo) => (
                  <button
                    key={`${repo.fullName}-${repo.branch}`}
                    onClick={() => handleSelectRecent(repo)}
                    disabled={isAnalyzing}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors flex items-center justify-between disabled:opacity-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-700 truncate">{repo.fullName}</p>
                      <p className="text-xs text-gray-400">{repo.branch}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={openModal}
              className="w-full text-left px-4 py-3 text-sm text-blue-600 hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Connect New Repo{"\u2026"}
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={closeModal} />
          <div className="relative bg-white rounded-xl border border-gray-200 shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {currentRepo ? 'Switch Repository' : 'Connect Repository'}
              </h3>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {currentRepo && (
              <p className="text-xs text-gray-400 mb-4">
                Currently connected to <span className="font-medium text-gray-600">{currentRepo}</span> ({currentBranch})
              </p>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Repository</label>
                <input
                  type="text"
                  value={repoFullName}
                  onChange={(e) => setRepoFullName(e.target.value)}
                  placeholder="owner/repo"
                  className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300"
                  disabled={isAnalyzing}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300"
                  disabled={isAnalyzing}
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isAnalyzing}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 font-medium rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAnalyzing || !repoFullName.trim()}
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-300 disabled:text-blue-100 text-white font-medium rounded-lg text-sm transition-colors"
                >
                  {isAnalyzing ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Analyzing{"\u2026"}
                    </span>
                  ) : (
                    'Connect & Analyze'
                  )}
                </button>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {error}
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}
