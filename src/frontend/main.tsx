import { invoke } from '@forge/bridge';
import { AlertCircle, CircleDot, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

interface IssueContext {
  key: string;
  summary: string;
  status: string;
  priority: string | null;
  issueType: string;
  assignee: string | null;
  updated: string | null;
}

type IssueContextResult =
  | { ok: true; issue: IssueContext }
  | { ok: false; message: string };

function formatUpdated(value: string | null): string {
  if (!value) return 'Update time unavailable';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Update time unavailable';

  return `Updated ${new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)}`;
}

function IssuePanel() {
  const [result, setResult] = useState<IssueContextResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadIssue() {
    setIsLoading(true);
    try {
      const response = await invoke<IssueContextResult>('getIssueContext', {});
      setResult('body' in response ? response.body : response);
    } catch {
      setResult({
        ok: false,
        message: 'SoftBender could not load Jira context. Try again shortly.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadIssue();
  }, []);

  return (
    <main className="panel-shell">
      <header className="panel-header">
        <div>
          <p className="eyebrow">SOFTBENDER / LIVE CONTEXT</p>
          <h1>Incident brief</h1>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Refresh issue context"
          title="Refresh issue context"
          disabled={isLoading}
          onClick={() => void loadIssue()}
        >
          <RefreshCw size={17} aria-hidden="true" />
        </button>
      </header>

      {isLoading ? (
        <section className="state-panel" aria-live="polite">
          <span className="loading-mark" aria-hidden="true" />
          <p>Loading Jira issue…</p>
        </section>
      ) : result?.ok ? (
        <section className="issue-panel" aria-live="polite">
          <div className="issue-topline">
            <span className="issue-key">{result.issue.key}</span>
            <span className="issue-status">
              <CircleDot size={13} aria-hidden="true" />
              {result.issue.status}
            </span>
          </div>
          <h2>{result.issue.summary}</h2>

          <dl className="detail-grid">
            <div className="detail-cell">
              <dt>Issue type</dt>
              <dd>{result.issue.issueType}</dd>
            </div>
            <div className="detail-cell">
              <dt>Priority</dt>
              <dd>{result.issue.priority ?? 'Not set'}</dd>
            </div>
            <div className="detail-cell detail-cell-wide">
              <dt>Assignee</dt>
              <dd>{result.issue.assignee ?? 'Unassigned'}</dd>
            </div>
          </dl>

          <footer className="issue-footer">{formatUpdated(result.issue.updated)}</footer>
        </section>
      ) : (
        <section className="state-panel error-panel" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <p>{result?.message ?? 'Issue context is unavailable.'}</p>
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<IssuePanel />);