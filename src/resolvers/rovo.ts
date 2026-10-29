import api, { route } from '@forge/api';

interface ActionPayload {
  pullRequestUrl?: unknown;
  jiraIssueKey?: unknown;
  issueKey?: unknown;
  queryName?: unknown;
  context?: {
    jira?: {
      issueKey?: unknown;
    };
  };
}

interface ActionContext {
  accountId?: unknown;
  principal?: {
    accountId?: unknown;
  };
}

interface JiraIssueResponse {
  key?: string;
  fields?: {
    summary?: string;
    status?: { name?: string };
    priority?: { name?: string } | null;
    issuetype?: { name?: string };
    labels?: string[];
  };
}

interface BitbucketPullRequestResponse {
  id?: string;
  title?: string;
  url?: string;
  status?: string;
}

interface TeamworkGraphResponse {
  data?: {
    cypherQuery?: {
      edges?: Array<{
        node?: {
          columns?: Array<{
            key?: string;
            value?: {
              nodes?: Array<{
                id?: string;
                data?: {
                  id?: string;
                  displayName?: string;
                  title?: string;
                  url?: string;
                  status?: string;
                };
              }>;
            };
          }>;
        };
      }>;
    };
  };
  errors?: Array<{ message?: string }>;
}

export interface IncidentStatusResult {
  ok: boolean;
  message?: string;
  issue?: {
    key: string;
    summary: string;
    status: string;
    priority: string | null;
    issueType: string;
    labels: string[];
  };
}

export interface TeamworkGraphTeamsResult {
  ok: boolean;
  message?: string;
  teams: Array<{ id: string; displayName: string }>;
}

const currentUserTeamsGraphQl = `
  query CurrentUserTeams($cypherQuery: String!, $params: CypherRequestParams) {
    cypherQuery(query: $cypherQuery, params: $params) {
      edges {
        node {
          columns {
            key
            value {
              __typename
              ... on CypherQueryResultListNode {
                nodes {
                  id
                  data {
                    __typename
                    ... on AtlassianTeam {
                      id
                      displayName
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const currentUserTeamsCypher =
  'MATCH (user:AtlassianUser {ari: $id})-[:atlassian_user_is_in_atlassian_team]->(team:AtlassianTeam) RETURN collect(distinct team) as teams';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function getIssueKeyFromPayload(payload: unknown): string | null {
  const actionPayload = asRecord(payload) as ActionPayload | null;
  const nestedContext = asRecord(actionPayload?.context);
  const jiraContext = asRecord(nestedContext?.jira);
  return (
    getString(actionPayload?.issueKey) ??
    getString(jiraContext?.issueKey)
  );
}

export function getAccountIdFromContext(context: unknown): string | null {
  const actionContext = asRecord(context) as ActionContext | null;
  const principal = asRecord(actionContext?.principal);
  return getString(actionContext?.accountId) ?? getString(principal?.accountId);
}

export async function getIncidentStatus(issueKeyInput: unknown): Promise<IncidentStatusResult> {
  const issueKey = getString(issueKeyInput);
  if (!issueKey || !/^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(issueKey)) {
    return { ok: false, message: 'Provide a valid Jira issue key, for example OPS-42.' };
  }

  try {
    const response = await api.asUser().requestJira(
      route`/rest/api/3/issue/${issueKey}?fields=summary,status,priority,issuetype,labels`,
    );

    if (response.status === 429) {
      return { ok: false, message: 'Jira is rate limiting requests. Try again shortly.' };
    }
    if ([401, 403, 404].includes(response.status)) {
      return { ok: false, message: 'This issue is unavailable to the current Jira user.' };
    }
    if (!response.ok) {
      return { ok: false, message: `Jira returned HTTP ${response.status} for this issue.` };
    }

    const issue = (await response.json()) as JiraIssueResponse;
    if (!issue.key || !issue.fields?.summary) {
      return { ok: false, message: 'Jira returned incomplete issue details.' };
    }

    return {
      ok: true,
      issue: {
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status?.name ?? 'Unknown',
        priority: issue.fields.priority?.name ?? null,
        issueType: issue.fields.issuetype?.name ?? 'Unknown',
        labels: Array.isArray(issue.fields.labels) ? issue.fields.labels : [],
      },
    };
  } catch {
    return { ok: false, message: 'Jira could not be reached. Try again shortly.' };
  }
}

export async function getCurrentUserTeams(accountIdInput: unknown): Promise<TeamworkGraphTeamsResult> {
  const accountId = getString(accountIdInput);
  if (!accountId) {
    return { ok: false, message: 'The current Atlassian user context is unavailable.', teams: [] };
  }

  try {
    const response = await api.asUser().requestTeamworkGraph(currentUserTeamsGraphQl, {
      cypherQuery: currentUserTeamsCypher,
      params: { id: `ari:cloud:identity::user/${accountId}` },
    });

    if (response.status === 429) {
      return { ok: false, message: 'Teamwork Graph is rate limiting requests. Try again shortly.', teams: [] };
    }
    if (!response.ok) {
      return { ok: false, message: `Teamwork Graph returned HTTP ${response.status}.`, teams: [] };
    }

    const result = (await response.json()) as TeamworkGraphResponse;
    if (result.errors?.length) {
      return {
        ok: false,
        message: result.errors.map((error) => error.message).filter(Boolean).join('; ') || 'Teamwork Graph query failed.',
        teams: [],
      };
    }

    const columns = result.data?.cypherQuery?.edges?.flatMap((edge) => edge.node?.columns ?? []) ?? [];
    const teamNodes = columns.find((column) => column.key === 'teams')?.value?.nodes ?? [];
    const teams = teamNodes.flatMap((node) => {
      const id = node.data?.id ?? node.id;
      const displayName = node.data?.displayName;
      return id && displayName ? [{ id, displayName }] : [];
    });

    return { ok: true, teams };
  } catch {
    return { ok: false, message: 'Teamwork Graph could not be reached.', teams: [] };
  }
}

const pullRequestByUrlGraphQl = `
  query PullRequestByUrl($cypherQuery: String!, $params: CypherRequestParams) {
    cypherQuery(query: $cypherQuery, params: $params) {
      edges {
        node {
          columns {
            key
            value {
              __typename
              ... on CypherQueryResultListNode {
                nodes {
                  id
                  data {
                    __typename
                    ... on ExternalPullRequest {
                      id
                      title
                      url
                      status
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const pullRequestByUrlCypher =
  'MATCH (pullRequest:ExternalPullRequest {url: $url}) RETURN collect(distinct pullRequest) as pullRequests';

function parseBitbucketPullRequestUrl(value: unknown): {
  url: string;
} | null {
  const input = getString(value);
  if (!input) return null;

  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'bitbucket.org' || url.username || url.password) {
      return null;
    }

    const match = url.pathname.match(/^\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/pull-requests\/(\d+)\/?$/);
    if (!match) return null;

    return { url: `https://bitbucket.org${url.pathname.replace(/\/$/, '')}` };
  } catch {
    return null;
  }
}

async function getBitbucketPullRequest(input: unknown): Promise<
  | { ok: true; pullRequest: BitbucketPullRequestResponse }
  | { ok: false; message: string }
> {
  const parsed = parseBitbucketPullRequestUrl(input);
  if (!parsed) {
    return { ok: false, message: 'Provide a full HTTPS Bitbucket pull request URL.' };
  }

  try {
    const response = await api.asUser().requestTeamworkGraph(pullRequestByUrlGraphQl, {
      cypherQuery: pullRequestByUrlCypher,
      params: { url: parsed.url },
    });

    if (response.status === 429) {
      return { ok: false, message: 'Teamwork Graph is rate limiting requests. Try again shortly.' };
    }
    if ([401, 403, 404].includes(response.status)) {
      return { ok: false, message: 'This pull request is unavailable in Teamwork Graph to the current user.' };
    }
    if (!response.ok) {
      return { ok: false, message: `Teamwork Graph returned HTTP ${response.status} for this pull request.` };
    }

    const result = (await response.json()) as TeamworkGraphResponse;
    if (result.errors?.length) {
      return {
        ok: false,
        message: result.errors.map((error) => error.message).filter(Boolean).join('; ') || 'Teamwork Graph query failed.',
      };
    }

    const columns = result.data?.cypherQuery?.edges?.flatMap((edge) => edge.node?.columns ?? []) ?? [];
    const nodes = columns.find((column) => column.key === 'pullRequests')?.value?.nodes ?? [];
    const pullRequest = nodes[0]?.data;
    if (!pullRequest?.id || !pullRequest.title || !pullRequest.url) {
      return { ok: false, message: 'No matching pull request was found in Teamwork Graph.' };
    }

    return { ok: true, pullRequest };
  } catch {
    return { ok: false, message: 'Teamwork Graph could not be reached. Try again shortly.' };
  }
}

function riskLevel(score: number): 'low' | 'moderate' | 'high' | 'critical' {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'moderate';
  return 'low';
}

export async function calculateRiskAction(payload: unknown, context: unknown) {
  const actionPayload = asRecord(payload) as ActionPayload | null;
  const pullRequestResult = await getBitbucketPullRequest(actionPayload?.pullRequestUrl);
  if (!pullRequestResult.ok) return { ok: false, message: pullRequestResult.message };

  const jiraIssueKey = getString(actionPayload?.jiraIssueKey) ?? getIssueKeyFromPayload(payload);
  const [incident, teamworkGraph] = await Promise.all([
    jiraIssueKey ? getIncidentStatus(jiraIssueKey) : Promise.resolve(null),
    getCurrentUserTeams(getAccountIdFromContext(context)),
  ]);

  const factors: Array<{ signal: string; points: number; detail: string }> = [];
  let score = 10;
  if (pullRequestResult.pullRequest.status?.toUpperCase() === 'OPEN') {
    factors.push({ signal: 'open_pull_request', points: 15, detail: 'The pull request is still open.' });
    score += 15;
  }

  if (incident?.ok && incident.issue) {
    const priority = (incident.issue.priority ?? '').toLowerCase();
    const priorityPoints = ['highest', 'blocker', 'critical'].includes(priority)
      ? 45
      : priority === 'high'
        ? 30
        : priority === 'medium'
          ? 15
          : 0;
    if (priorityPoints > 0) {
      factors.push({
        signal: 'jira_priority',
        points: priorityPoints,
        detail: `${incident.issue.key} has ${incident.issue.priority} priority.`,
      });
      score += priorityPoints;
    }

    if (!['done', 'resolved', 'closed'].includes(incident.issue.status.toLowerCase())) {
      factors.push({ signal: 'incident_unresolved', points: 10, detail: `${incident.issue.key} is ${incident.issue.status}.` });
      score += 10;
    }
  } else if (jiraIssueKey) {
    factors.push({ signal: 'jira_context_unavailable', points: 0, detail: incident?.message ?? 'Jira context is unavailable.' });
  } else {
    factors.push({ signal: 'jira_context_not_supplied', points: 0, detail: 'No related Jira issue key was supplied.' });
  }

  score = Math.min(100, score);
  const level = riskLevel(score);
  const pullRequest = pullRequestResult.pullRequest;
  const summary = `Operational risk is ${level} (${score}/100) based on the visible pull request and Jira signals. Revenue exposure is not assessed because no revenue data source is connected.`;

  return {
    ok: true,
    source: 'live-user-authorized-data',
    pullRequest: {
      id: pullRequest.id,
      title: pullRequest.title,
      status: pullRequest.status ?? 'unknown',
      url: pullRequest.url,
    },
    jiraIssue: incident?.ok ? incident.issue : null,
    teamworkGraph: {
      status: teamworkGraph.ok ? 'available' : 'unavailable',
      teams: teamworkGraph.teams,
      message: teamworkGraph.message ?? null,
    },
    risk: {
      score,
      level,
      factors,
      method: 'Heuristic operational indicator: 10 base points, +15 when Teamwork Graph reports an open pull request, +15/+30/+45 for medium/high/critical Jira priority, and +10 for an unresolved Jira issue. This is not a revenue-risk estimate.',
      revenueExposure: 'not-assessed',
    },
    summary,
  };
}