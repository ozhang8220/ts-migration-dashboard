import { useState, useEffect } from 'react';
import type { AnalysisResult, RepoConfig } from '../types';

const STORAGE_KEY = 'ts-migration-recent-repos';
const MAX_RECENT = 10;

function saveRecentRepo(fullName: string, branch: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const repos: Array<{ fullName: string; branch: string; connectedAt: number }> = raw ? JSON.parse(raw) : [];
    const filtered = repos.filter(
      (r) => !(r.fullName === fullName && r.branch === branch)
    );
    filtered.unshift({ fullName, branch, connectedAt: Date.now() });
    if (filtered.length > MAX_RECENT) filtered.length = MAX_RECENT;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // ignore storage errors
  }
}

interface Props {
  repoConfig: RepoConfig | null;
  onAnalyze: (repoFullName: string, branch: string) => Promise<AnalysisResult>;
  showModal: boolean;
  onCloseModal: () => void;
}

export default function RepoSelector({ repoConfig, onAnalyze, showModal, onCloseModal }: Props) {
  const [repoFullName, setRepoFullName] = useState('');
  const [branch, setBranch] = useState('main');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentRepo = repoConfig?.owner && repoConfig?.repo
    ? `${repoConfig.owner}/${repoConfig.repo}`
    : null;
  const currentBranch = repoConfig?.branch || 'main';

  useEffect(() => {
    if (showModal) {
      setRepoFullName('');
      setBranch(currentBranch);
      setError(null);
    }
  }, [showModal, currentBranch]);

  const closeModal = () => {
    if (!isAnalyzing) {
      onCloseModal();
      setError(null);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoFullName.trim()) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      await onAnalyze(repoFullName.trim(), branch.trim());
      saveRecentRepo(repoFullName.trim(), branch.trim());
      onCloseModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze repository');
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!showModal) return null;

  return (
    <>
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px]" onClick={closeModal} />
          <div className="relative bg-white rounded-lg border border-[#E5E7EB] shadow-xl p-6 w-full max-w-[480px] mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-[#111827]">
                {currentRepo ? 'Add Repo' : 'Connect Repository'}
              </h3>
              <button
                onClick={closeModal}
                className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1.5">Repository</label>
                <input
                  type="text"
                  value={repoFullName}
                  onChange={(e) => setRepoFullName(e.target.value)}
                  placeholder="owner/repo"
                  className="w-full bg-white border border-[#E5E7EB] rounded-lg px-4 py-2.5 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  disabled={isAnalyzing}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1.5">Branch</label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="w-full bg-white border border-[#E5E7EB] rounded-lg px-4 py-2.5 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  disabled={isAnalyzing}
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isAnalyzing}
                  className="flex-1 px-4 py-2.5 border border-[#E5E7EB] text-[#374151] hover:bg-[#F9FAFB] disabled:opacity-50 font-medium rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAnalyzing || !repoFullName.trim()}
                  className="flex-1 px-4 py-2.5 bg-[#111827] hover:bg-[#1F2937] disabled:bg-[#D1D5DB] disabled:text-white text-white font-medium rounded-lg text-sm transition-colors"
                >
                  {isAnalyzing ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Analyzing...
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
    </>
  );
}
