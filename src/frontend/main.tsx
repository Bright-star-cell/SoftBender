import { invoke, view } from '@forge/bridge';
import { Activity, AlertCircle, CircleDot, RefreshCw } from 'lucide-react';
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

interface GatewayOverview {
  source: 'demo';
  generatedAt: string;
  incident: {
    key: string;
    summary: string;
    status: string;
    severity: string;
    service: string;
  };
  deployment: {
    name: string;
    status: string;
  };
  relationships: Array<{
    id: string;
    label: string;
    type: string;
    relationship: string;
  }>;
}

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

function GatewayPage() {
  const [overview, setOverview] = useState<GatewayOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadOverview() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await invoke<GatewayOverview>('getGatewayOverview', {});
      setOverview('body' in response ? response.body : response);
    } catch {
      setError('SoftBender could not load the gateway overview. Try again shortly.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
  }, []);

  return (
    <main className="panel-shell gateway-shell">
      <header className="panel-header">
        <div>
          <p className="eyebrow">SOFTBENDER / OPERATIONS</p>
          <h1>Gateway overview</h1>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Refresh gateway overview"
          title="Refresh gateway overview"
          disabled={isLoading}
          onClick={() => void loadOverview()}
        >
          <RefreshCw size={17} aria-hidden="true" />
        </button>
      </header>

      <p className="demo-notice">
        <Activity size={15} aria-hidden="true" />
        Demonstration data. Live Teamwork Graph and deployment connections are not configured.
      </p>

      {isLoading ? (
        <section className="state-panel" aria-live="polite">
          <span className="loading-mark" aria-hidden="true" />
          <p>Loading gateway context…</p>
        </section>
      ) : error ? (
        <section className="state-panel error-panel" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <p>{error}</p>
        </section>
      ) : overview ? (
        <>
          <section className="gateway-incident" aria-live="polite">
            <div className="gateway-incident-head">
              <span className="issue-key">{overview.incident.key}</span>
              <span className="severity-pill">{overview.incident.severity} severity</span>
            </div>
            <h2>{overview.incident.summary}</h2>
            <div className="gateway-meta">
              <span>
                <CircleDot size={13} aria-hidden="true" />
                {overview.incident.status}
              </span>
              <span>{overview.incident.service}</span>
            </div>
          </section>

          <section className="gateway-section" aria-labelledby="deployment-heading">
            <div className="section-heading">
              <h2 id="deployment-heading">Related deployment</h2>
              <span className="deployment-state">{overview.deployment.status}</span>
            </div>
            <p className="deployment-name">{overview.deployment.name}</p>
          </section>

          <section className="gateway-section" aria-labelledby="relationships-heading">
            <div className="section-heading">
              <h2 id="relationships-heading">Connected context</h2>
              <span className="context-count">{overview.relationships.length} links</span>
            </div>
            <ul className="relationship-list">
              {overview.relationships.map((relationship) => (
                <li className="relationship-row" key={relationship.id}>
                  <span className="relationship-node" aria-hidden="true" />
                  <div className="relationship-content">
                    <span className="relationship-type">{relationship.type}</span>
                    <strong>{relationship.label}</strong>
                    <span className="relationship-description">{relationship.relationship}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <footer className="issue-footer">
            {overview.source === 'demo' ? 'Illustrative context, not live incident data.' : ''}
          </footer>
        </>
      ) : null}
    </main>
  );
}

function App() {
  const [isGlobalPage, setIsGlobalPage] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;

    view.getContext()
      .then((context) => {
        if (isMounted) {
          setIsGlobalPage(context.moduleKey === 'softbender-global-page');
        }
      })
      .catch(() => {
        if (isMounted) setIsGlobalPage(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (isGlobalPage === null) {
    return (
      <main className="panel-shell">
        <section className="state-panel" aria-live="polite">
          <span className="loading-mark" aria-hidden="true" />
          <p>Opening SoftBender…</p>
        </section>
      </main>
    );
  }

  return isGlobalPage ? <GatewayPage /> : <IssuePanel />;
}

createRoot(document.getElementById('root')!).render(<App />);