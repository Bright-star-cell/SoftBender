import api, { route } from '@forge/api';
import Resolver from '@forge/resolver';

interface JiraIssueResponse {
  key: string;
  fields?: {
    summary?: string;
    status?: { name?: string };
    priority?: { name?: string } | null;
    issuetype?: { name?: string };
    assignee?: { displayName?: string } | null;
    updated?: string;
  };
}

interface ResolverContext {
  accountId?: string;
  extension?: {
    issue?: {
      key?: unknown;
    };
  };
}

interface JiraSearchResponse {
  issues?: Array<{
    id?: string;
    key?: string;
    fields?: {
      summary?: string;
      status?: { name?: string };
      priority?: { name?: string } | null;
      issuetype?: { name?: string };
      project?: { key?: string; name?: string };
      updated?: string;
    };
  }>;
}

interface GraphNodeData {
  id?: string;
  key?: string;
  name?: string;
  title?: string;
  summary?: string;
  description?: string;
  webUrl?: string;
  url?: string;
  status?: { name?: string } | string;
  issueType?: { name?: string };
}

interface GraphNode {
  id?: string;
  data?: GraphNodeData;
}

interface GraphColumn {
  key?: string;
  value?: {
    data?: GraphNodeData;
    nodes?: GraphNode[];
  };
}

interface IncidentGraphResponse {
  data?: {
    cypherQuery?: {
      edges?: Array<{
        node?: {
          columns?: GraphColumn[];
        };
      }>;
    };
  };
  errors?: Array<{ message?: string }>;
}

interface GatewayContextNode {
  id: string;
  label: string;
  type: 'Work item' | 'Goal' | 'Deployment' | 'Team';
  url: string | null;
  status: string | null;
  source: 'live' | 'demo';
  relationship: string;
}

interface GatewayIncident {
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
  relatedTeams: GatewayContextNode[];
  graphStatus: 'live' | 'partial' | 'demo';
}

interface GatewayOverview {
  isLive: boolean;
  dataMode: 'live' | 'demo' | 'mixed';
  displayState: 'ready';
  generatedAt: string;
  incidents: GatewayIncident[];
  telemetry: {
    jira: 'live' | 'demo';
    teamworkGraph: 'live' | 'partial' | 'demo';
    errors: string[];
  };
  message: string | null;
}

const resolver = new Resolver();

const incidentGraphQl = `
  query IncidentContext($cypherQuery: String!, $params: CypherRequestParams) {
    cypherQuery(query: $cypherQuery, params: $params) {
      edges {
        node {
          columns {
            key
            value {
              __typename
              ... on CypherQueryResultNode {
                id
                data {
                  __typename
                  ... on JiraWorkItem {
                    id
                    key
                    summary
                    webUrl
                    status { name }
                    issueType { name }
                  }
                }
              }
              ... on CypherQueryResultListNode {
                nodes {
                  id
                  data {
                    __typename
                    ... on JiraWorkItem {
                      id
                      key
                      summary
                      webUrl
                      status { name }
                      issueType { name }
                    }
                    ... on AtlassianGoal {
                      id
                      name
                      key
                      description
                    }
                    ... on ExternalDeployment {
                      id
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

const incidentGraphCypher = `
  MATCH (incident:JiraWorkItem {key: $issueKey})
  OPTIONAL MATCH (incident)-[]-(workItem:JiraWorkItem)
  WHERE workItem.key <> incident.key
  OPTIONAL MATCH (incident)-[]-(goal:AtlassianGoal)
  OPTIONAL MATCH (incident)-[]-(deployment:ExternalDeployment)
  RETURN incident,
    collect(distinct workItem) AS workItems,
    collect(distinct goal) AS goals,
    collect(distinct deployment) AS deployments
`;

function getGraphNodes(columns: GraphColumn[], key: string): GraphNodeData[] {
  const value = columns.find((column) => column.key === key)?.value;
  if (!value) return [];
  if (value.nodes) return value.nodes.flatMap((node) => (node.data ? [node.data] : []));
  return value.data ? [value.data] : [];
}

function toContextNodes(
  nodes: GraphNodeData[],
  type: GatewayContextNode['type'],
): GatewayContextNode[] {
  return nodes.flatMap((node) => {
    const id = node.id;
    const label = node.summary ?? node.name ?? node.title ?? node.key ?? id;
    if (!id || !label) return [];
    const status = typeof node.status === 'string' ? node.status : node.status?.name ?? null;
    return [{
      id,
      label,
      type,
      url: node.webUrl ?? node.url ?? null,
      status,
      source: 'live' as const,
      relationship: 'Connected in Teamwork Graph',
    }];
  });
}

function createDemoContext(): Pick<GatewayIncident, 'relatedWorkItems' | 'relatedGoals' | 'relatedDeployments' | 'relatedTeams'> {
  return {
    relatedWorkItems: [
      {
        id: 'demo-work-item-ops-318',
        label: 'Review checkout API latency regression',
        type: 'Work item',
        url: null,
        status: 'In progress',
        source: 'demo',
        relationship: 'Incident response follow-up',
      },
    ],
    relatedGoals: [
      {
        id: 'demo-goal-reliable-checkout',
        label: 'Reliable checkout experience',
        type: 'Goal',
        url: null,
        status: 'At risk',
        source: 'demo',
        relationship: 'Business goal',
      },
    ],
    relatedDeployments: [
      {
        id: 'demo-deployment-checkout-2026-10-29-4',
        label: 'checkout-api 2026.10.29.4',
        type: 'Deployment',
        url: null,
        status: 'Monitoring',
        source: 'demo',
        relationship: 'Deployment under monitoring',
      },
    ],
    relatedTeams: [
      {
        id: 'demo-team-payments-on-call',
        label: 'Payments on-call',
        type: 'Team',
        url: null,
        status: 'On call',
        source: 'demo',
        relationship: 'Service ownership',
      },
    ],
  };
}

function createDemoOverview(): GatewayOverview {
  const now = new Date().toISOString();
  return {
    isLive: false,
    dataMode: 'demo',
    displayState: 'ready',
    generatedAt: now,
    incidents: [
      {
        id: 'INC-2048',
        key: 'INC-2048',
        summary: 'Elevated checkout latency',
        status: 'Investigating',
        severity: 'High',
        service: 'Checkout API',
        updated: now,
        ...createDemoContext(),
        graphStatus: 'demo',
      },
    ],
    telemetry: { jira: 'demo', teamworkGraph: 'demo', errors: [] },
    message: null,
  };
}

async function getJsmIncidents(): Promise<
  | { ok: true; incidents: NonNullable<JiraSearchResponse['issues']> }
  | { ok: false; message: string }
> {
  const jql = 'issuetype = Incident AND statusCategory != Done ORDER BY updated DESC';
  try {
    const response = await api.asApp().requestJira(
      route`/rest/api/3/search/jql?jql=${jql}&fields=summary,status,priority,issuetype,project,updated&maxResults=10`,
    );

    if (response.status === 429) {
      return { ok: false, message: 'Jira is rate limiting the incident query. Try again shortly.' };
    }
    if ([401, 403].includes(response.status)) {
      return { ok: false, message: 'The app cannot read Jira incidents. Check the installed Jira read scope.' };
    }
    if (!response.ok) {
      return { ok: false, message: `Jira incident search returned HTTP ${response.status}.` };
    }

    const result = (await response.json()) as JiraSearchResponse;
    return { ok: true, incidents: Array.isArray(result.issues) ? result.issues : [] };
  } catch {
    return { ok: false, message: 'Jira incident search could not be reached.' };
  }
}

async function getIncidentGraphContext(issueKey: string): Promise<{
  workItems: GatewayContextNode[];
  goals: GatewayContextNode[];
  deployments: GatewayContextNode[];
  message: string | null;
}> {
  try {
    const response = await api.asUser().requestTeamworkGraph(incidentGraphQl, {
      cypherQuery: incidentGraphCypher,
      params: { issueKey },
    });
    if (response.status === 429) {
      return { workItems: [], goals: [], deployments: [], message: 'Teamwork Graph rate limited this incident.' };
    }
    if (!response.ok) {
      return {
        workItems: [],
        goals: [],
        deployments: [],
        message: `Teamwork Graph returned HTTP ${response.status} for ${issueKey}.`,
      };
    }

    const result = (await response.json()) as IncidentGraphResponse;
    if (result.errors?.length) {
      return {
        workItems: [],
        goals: [],
        deployments: [],
        message: result.errors.map((error) => error.message).filter(Boolean).join('; ') || `Graph lookup failed for ${issueKey}.`,
      };
    }

    const columns = result.data?.cypherQuery?.edges?.flatMap((edge) => edge.node?.columns ?? []) ?? [];
    const workItems = toContextNodes(getGraphNodes(columns, 'workItems'), 'Work item');
    const goals = toContextNodes(getGraphNodes(columns, 'goals'), 'Goal');
    const deployments = toContextNodes(getGraphNodes(columns, 'deployments'), 'Deployment');

    return {
      workItems,
      goals,
      deployments,
      message: workItems.length + goals.length + deployments.length === 0
        ? `No linked work items, goals, or deployments were found for ${issueKey}.`
        : null,
    };
  } catch {
    return { workItems: [], goals: [], deployments: [], message: `Teamwork Graph could not be reached for ${issueKey}.` };
  }
}

resolver.define('getGatewayOverview', async (): Promise<GatewayOverview> => {
  const incidentResult = await getJsmIncidents();
  if (!incidentResult.ok || incidentResult.incidents.length === 0) {
    return createDemoOverview();
  }

  const graphCandidates = incidentResult.incidents.slice(0, 5);
  const graphResults = await Promise.all(
    graphCandidates.map(async (issue) => ({ issue, context: await getIncidentGraphContext(issue.key ?? '') })),
  );
  const graphByKey = new Map(graphResults.map(({ issue, context }) => [issue.key, context]));
  const successfulGraphResults = graphResults.filter(({ context }) => context.message === null).length;
  let hasDemoContext = false;

  const incidents = incidentResult.incidents.flatMap((issue) => {
    if (!issue.key || !issue.fields?.summary) return [];
    const graphContext = graphByKey.get(issue.key);
    const sampleContext = createDemoContext();
    const hasMissingGraphCategory = !graphContext ||
      graphContext.workItems.length === 0 ||
      graphContext.goals.length === 0 ||
      graphContext.deployments.length === 0;
    const context = {
      workItems: graphContext?.workItems.length ? graphContext.workItems : sampleContext.relatedWorkItems,
      goals: graphContext?.goals.length ? graphContext.goals : sampleContext.relatedGoals,
      deployments: graphContext?.deployments.length ? graphContext.deployments : sampleContext.relatedDeployments,
      teams: hasMissingGraphCategory ? sampleContext.relatedTeams : [],
    };
    if (hasMissingGraphCategory) hasDemoContext = true;

    return [{
      id: issue.id ?? issue.key,
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status?.name ?? 'Unknown',
      severity: issue.fields.priority?.name ?? 'Unspecified',
      service: issue.fields.project?.name ?? issue.fields.project?.key ?? 'Jira Service Management',
      updated: issue.fields.updated ?? null,
      relatedWorkItems: context.workItems,
      relatedGoals: context.goals,
      relatedDeployments: context.deployments,
      relatedTeams: context.teams,
      graphStatus: hasMissingGraphCategory ? 'partial' : 'live',
    } satisfies GatewayIncident];
  });

  if (incidents.length === 0) return createDemoOverview();

  const teamworkGraphStatus = graphResults.length === 0 || successfulGraphResults === 0
    ? 'demo'
    : successfulGraphResults === graphResults.length
      ? 'live'
      : 'partial';

  return {
    isLive: true,
    dataMode: hasDemoContext ? 'mixed' : 'live',
    displayState: 'ready',
    generatedAt: new Date().toISOString(),
    incidents,
    telemetry: { jira: 'live', teamworkGraph: teamworkGraphStatus, errors: [] },
    message: null,
  };
});

resolver.define('getIssueContext', async ({ context }) => {
  const issueKey = (context as ResolverContext).extension?.issue?.key;
  if (typeof issueKey !== 'string' || issueKey.length === 0) {
    return { ok: false, message: 'Open an issue to view its context.' };
  }

  try {
    const response = await api.asUser().requestJira(
      route`/rest/api/3/issue/${issueKey}?fields=summary,status,priority,issuetype,assignee,updated`,
    );

    if (response.status === 429) {
      return { ok: false, message: 'Jira is rate limiting requests. Try again shortly.' };
    }
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      return { ok: false, message: 'This issue is unavailable to your Jira account.' };
    }
    if (!response.ok) {
      return { ok: false, message: `Jira could not load this issue (HTTP ${response.status}).` };
    }

    const issue = (await response.json()) as JiraIssueResponse;
    if (typeof issue.key !== 'string' || typeof issue.fields?.summary !== 'string') {
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
        assignee: issue.fields.assignee?.displayName ?? null,
        updated: issue.fields.updated ?? null,
      },
    };
  } catch {
    return { ok: false, message: 'Jira could not be reached. Try again shortly.' };
  }
});

export const handler = resolver.getDefinitions();