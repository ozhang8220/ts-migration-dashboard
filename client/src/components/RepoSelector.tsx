import { useState } from 'react';
import type { AnalysisResult, RepoConfig } from '../types';

interface Props {
  repoConfig: RepoConfig | null;
  onAnalyze: (repoFullName: string, branch: string) => Promise<AnalysisResult>;
}

export default function RepoSelector({ repoConfig, onAnalyze }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [repoFullName, setRepoFullName] = useState('');
  const [branch, setBranch] = useState('main');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentRepo = repoConfig?.owner && repoConfig?.repo
    ? `${repoConfig.owner}/${repoConfig.repo}`
    : null;

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoFullName.trim()) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      await onAnalyze(repoFullName.trim(), branch.trim());
      setIsEditing(false);
      setRepoFullName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze repository');
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!currentRepo) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <svg className="w-4 h-4 text-gray-400" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          <span className="text-gray-500">Connected:</span>
          <span className="font-mono font-medium text-gray-900">{currentRepo}</span>
          <span className="text-gray-300">@</span>
          <span className="text-gray-500">{repoConfig?.branch || 'main'}</span>
        </div>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="text-sm text-blue-600 hover:text-blue-500 font-medium"
        >
          {isEditing ? 'Cancel' : 'Change Repo'}
        </button>
      </div>

      {isEditing && (
        <form onSubmit={handleConnect} className="mt-3 flex items-end gap-3 pt-3 border-t border-gray-100">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Repository</label>
            <input
              type="text"
              value={repoFullName}
              onChange={(e) => setRepoFullName(e.target.value)}
              placeholder="owner/repo"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300"
              disabled={isAnalyzing}
            />
          </div>
          <div className="w-32">
            <label className="block text-xs text-gray-500 mb-1">Branch</label>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300"
              disabled={isAnalyzing}
            />
          </div>
          <button
            type="submit"
            disabled={isAnalyzing || !repoFullName.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-300 text-white font-medium rounded-lg text-sm transition-colors"
          >
            {isAnalyzing ? 'Connecting...' : 'Connect'}
          </button>
          {error && (
            <span className="text-xs text-red-500">{error}</span>
          )}
        </form>
      )}
    </div>
  );
}
