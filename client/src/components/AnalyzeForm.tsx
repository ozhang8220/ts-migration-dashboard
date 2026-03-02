import { useState } from 'react';
import type { AnalysisResult } from '../types';

interface Props {
  onAnalyze: (repoFullName: string, branch: string) => Promise<AnalysisResult>;
}

export default function AnalyzeForm({ onAnalyze }: Props) {
  const [repoFullName, setRepoFullName] = useState('');
  const [branch, setBranch] = useState('main');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoFullName.trim()) return;

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const res = await onAnalyze(repoFullName.trim(), branch.trim());
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4">
            TS
          </div>
          <h2 className="text-2xl font-bold text-gray-100">Analyze a Repository</h2>
          <p className="text-sm text-gray-400 mt-2">
            Enter a GitHub repository to scan for JavaScript/JSX files and begin the TypeScript migration.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Repository</label>
            <input
              type="text"
              value={repoFullName}
              onChange={(e) => setRepoFullName(e.target.value)}
              placeholder="owner/repo (e.g. ozhang8220/shopdirect-frontend)"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
              disabled={isAnalyzing}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Branch</label>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
              disabled={isAnalyzing}
            />
          </div>

          <button
            type="submit"
            disabled={isAnalyzing || !repoFullName.trim()}
            className="w-full px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:text-indigo-400 text-white font-medium rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          >
            {isAnalyzing ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing repository...
              </span>
            ) : (
              'Analyze Repository'
            )}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
            <h3 className="text-sm font-semibold text-emerald-300 mb-2">Analysis Complete</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-400">Total Files:</span>{' '}
                <span className="text-gray-200 font-medium">{result.totalFiles}</span>
              </div>
              {Object.entries(result.byComplexity).map(([key, count]) => (
                <div key={key}>
                  <span className="text-gray-400 capitalize">{key}:</span>{' '}
                  <span className="text-gray-200 font-medium">{count}</span>
                </div>
              ))}
            </div>
            {result.message && (
              <p className="mt-2 text-xs text-gray-400">{result.message}</p>
            )}
          </div>
        )}

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            Requires GITHUB_TOKEN to be configured on the server. Scans src/ for .js and .jsx files.
          </p>
        </div>
      </div>
    </div>
  );
}
