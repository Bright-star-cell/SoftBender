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
  extension?: {
    issue?: {
      key?: unknown;
    };
  };
}

const resolver = new Resolver();

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