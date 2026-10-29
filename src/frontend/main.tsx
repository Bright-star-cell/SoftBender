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
  isLive: boolean;
  generatedAt: string;
  incidents: Array<{
    id: string;
    key: string;
    summary: string;
    status: string;
    severity: string;
    service: string;
    updated: string | null;
    relatedWorkItems: GatewayContextNode[];
    relatedGoals: GatewayContextNode[];
    relatedDeployments: GatewayContextNode[];
    graphStatus: 'live' | 'partial' | 'unavailable';
    graphMessage: string | null;
  }>;
  telemetry: {
    jira: 'live' | 'unavailable';
    teamworkGraph: 'live' | 'partial' | 'unavailable';
    errors: string[];
  };
  message: string | null;
}

interface GatewayContextNode {
  id: string;
  label: string;
  type: 'Work item' | 'Goal' | 'Deployment';
  url: string | null;
  status: string | null;
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

  const deployments = overview?.incidents.flatMap((incident) =>
    incident.relatedDeployments.map((deployment) => ({ incidentKey: incident.key, deployment })),
  ) ?? [];
  const connectedContext = overview?.incidents.flatMap((incident) => [
    ...incident.relatedWorkItems,
    ...incident.relatedGoals,
    ...incident.relatedDeployments,
  ].map((node) => ({ incidentKey: incident.key, node }))) ?? [];

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

      {overview && !overview.isLive && (
        <p className="demo-notice" role="status">
          <Activity size={15} aria-hidden="true" />
          {overview.message ?? 'Live Jira incident data is currently unavailable.'}
        </p>
      )}

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
          {overview.telemetry.teamworkGraph !== 'live' && (
            <p className="telemetry-note" role="status">
              Teamwork Graph: {overview.telemetry.teamworkGraph}. Jira incidents remain live.
            </p>
          )}

          {overview.incidents.length > 0 ? overview.incidents.map((incident) => (
            <section className="gateway-incident" aria-live="polite" key={incident.id}>
              <div className="gateway-incident-head">
                <span className="issue-key">{incident.key}</span>
                <span className="severity-pill">{incident.severity} priority</span>
              </div>
              <h2>{incident.summary}</h2>
              <div className="gateway-meta">
                <span>
                  <CircleDot size={13} aria-hidden="true" />
                  {incident.status}
                </span>
                <span>{incident.service}</span>
                <span>Graph: {incident.graphStatus}</span>
              </div>
              {incident.graphMessage && (
                <p className="relationship-description incident-graph-message">{incident.graphMessage}</p>
              )}
            </section>
          )) : (
            <section className="state-panel" aria-live="polite">
              <p>No active Jira Service Management incidents were found.</p>
            </section>
          )}

          <section className="gateway-section" aria-labelledby="deployment-heading">
            <div className="section-heading">
              <h2 id="deployment-heading">Related deployments</h2>
              <span className="deployment-state">{deployments.length} linked</span>
            </div>
            {deployments.length > 0 ? deployments.map(({ incidentKey, deployment }) => (
              <a
                className="deployment-name"
                href={deployment.url ?? undefined}
                key={`${incidentKey}-${deployment.id}`}
                rel="noreferrer"
                target={deployment.url ? '_blank' : undefined}
              >
                <span>{deployment.label}</span>
                <span className="deployment-state">{incidentKey}{deployment.status ? ` · ${deployment.status}` : ''}</span>
              </a>
            )) : (
              <p className="deployment-name">
                {overview.telemetry.teamworkGraph === 'unavailable'
                  ? 'Teamwork Graph deployment data is unavailable.'
                  : 'No directly linked deployments were found.'}
              </p>
            )}
          </section>

          <section className="gateway-section" aria-labelledby="relationships-heading">
            <div className="section-heading">
              <h2 id="relationships-heading">Connected context</h2>
              <span className="context-count">{connectedContext.length} links</span>
            </div>
            {connectedContext.length > 0 ? (
              <ul className="relationship-list">
                {connectedContext.map(({ incidentKey, node }) => (
                  <li className="relationship-row" key={`${incidentKey}-${node.id}`}>
                  <span className="relationship-node" aria-hidden="true" />
                  <div className="relationship-content">
                    <span className="relationship-type">{node.type}</span>
                    {node.url ? <a href={node.url} rel="noreferrer" target="_blank">{node.label}</a> : <strong>{node.label}</strong>}
                    <span className="relationship-description">Linked to {incidentKey}</span>
                  </div>
                </li>
                ))}
              </ul>
            ) : (
              <p className="deployment-name">
                {overview.telemetry.teamworkGraph === 'unavailable'
                  ? 'Connected graph context is unavailable.'
                  : 'No directly linked work items or goals were found.'}
              </p>
            )}
          </section>

          <footer className="issue-footer">
            Jira telemetry: {overview.telemetry.jira}. Graph telemetry: {overview.telemetry.teamworkGraph}. Updated {formatUpdated(overview.generatedAt)}
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