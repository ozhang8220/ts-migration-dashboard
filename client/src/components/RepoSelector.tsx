import { useState, useRef, useEffect } from 'react';
import type { AnalysisResult, RepoConfig } from '../types';

interface Props {
  repoConfig: RepoConfig | null;
  onAnalyze: (repoFullName: string, branch: string) => Promise<AnalysisResult>;
}

export default function RepoSelector({ repoConfig, onAnalyze }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [repoFullName, setRepoFullName] = useState('');
  const [branch, setBranch] = useState('main');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentRepo = repoConfig?.owner && repoConfig?.repo
    ? `${repoConfig.owner}/${repoConfig.repo}`
    : null;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoFullName.trim()) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      await onAnalyze(repoFullName.trim(), branch.trim());
      setShowModal(false);
      setIsOpen(false);
      setRepoFullName('');
      setBranch('main');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze repository');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm hover:bg-blue-500 transition-colors cursor-pointer"
          title="Switch repository"
        >
          TS
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-lg border border-gray-200 shadow-lg z-30">
            {currentRepo && (
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{currentRepo}</p>
                    <p className="text-xs text-gray-400">{repoConfig?.branch || 'main'}</p>
                  </div>
                  <svg className="w-4 h-4 text-blue-500 flex-shrink-0 ml-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            )}
            <button
              onClick={() => { setShowModal(true); setIsOpen(false); }}
              className="w-full text-left px-4 py-3 text-sm text-blue-600 hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Connect New Repo
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => !isAnalyzing && setShowModal(false)} />
          <div className="relative bg-white rounded-xl border border-gray-200 shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Connect New Repository</h3>
              <button
                onClick={() => !isAnalyzing && setShowModal(false)}
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
              <button
                type="submit"
                disabled={isAnalyzing || !repoFullName.trim()}
                className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-300 disabled:text-blue-100 text-white font-medium rounded-lg text-sm transition-colors"
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
