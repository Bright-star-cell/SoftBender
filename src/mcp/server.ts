import {
  getAccountIdFromContext,
  getCurrentUserTeams,
  getIncidentStatus,
  getIssueKeyFromPayload,
} from '../resolvers/rovo';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export async function getIncidentStatusAction(payload: unknown) {
  const actionPayload = asRecord(payload);
  const issueKey = getString(actionPayload?.issueKey) ?? getIssueKeyFromPayload(payload);
  if (!issueKey) {
    return { ok: false, message: 'Provide a Jira or JSM issue key.' };
  }

  return getIncidentStatus(issueKey);
}

export async function queryTeamworkGraphAction(payload: unknown, context: unknown) {
  const actionPayload = asRecord(payload);
  if (getString(actionPayload?.queryName) !== 'current-user-teams') {
    return {
      ok: false,
      message: 'Unsupported query. The only available query is current-user-teams.',
      teams: [],
    };
  }

  return getCurrentUserTeams(getAccountIdFromContext(context));
}