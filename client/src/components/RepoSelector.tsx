import { useState } from 'react';
import type { AnalysisResult, RepoConfig } from '../types';

interface Props {
  repoConfig: RepoConfig | null;
  onAnalyze: (repoFullName: string, branch: string) => Promise<AnalysisResult>;
}

export default function RepoSelector({ repoConfig, onAnalyze }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [repoFullName, setRepoFullName] = useState('');
  const [branch, setBranch] = useState('main');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentRepo = repoConfig?.owner && repoConfig?.repo
    ? `${repoConfig.owner}/${repoConfig.repo}`
    : null;

  const openModal = () => {
    setRepoFullName(currentRepo || '');
    setBranch(repoConfig?.branch || 'main');
    setError(null);
    setShowModal(true);
  };

  const closeModal = () => {
    if (!isAnalyzing) {
      setShowModal(false);
      setError(null);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoFullName.trim()) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      await onAnalyze(repoFullName.trim(), branch.trim());
      setShowModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze repository');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <>
      <div className="relative">
        {currentRepo ? (
          <button
            onClick={openModal}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-colors cursor-pointer"
            title="Change repository"
          >
            <span className="text-sm">{'\uD83D\uDCC1'}</span>
            <span className="text-sm font-medium text-gray-900">{currentRepo}</span>
            <span className="text-gray-300">{'\u00B7'}</span>
            <span className="text-sm text-gray-500">{repoConfig?.branch || 'main'}</span>
            <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
          </button>
        ) : (
          <button
            onClick={openModal}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-300 transition-colors cursor-pointer"
            title="Connect a repository"
          >
            <span className="text-sm">{'\uD83D\uDCC1'}</span>
            <span className="text-sm font-medium text-blue-700">Connect Repo</span>
          </button>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={closeModal} />
          <div className="relative bg-white rounded-xl border border-gray-200 shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{currentRepo ? 'Change Repository' : 'Connect Repository'}</h3>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleConnect} className="space-y-4">
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
      )}
    </>
  );
}
