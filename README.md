# SoftBender

[![License: MIT](https://img.shields.io/badge/License-MIT-13745B.svg)](LICENSE)
[![Atlassian Forge](https://img.shields.io/badge/Atlassian-Forge-1868DB.svg)](https://developer.atlassian.com/platform/forge/)
[![Runtime](https://img.shields.io/badge/Node.js-22.x-43853D.svg)](https://nodejs.org/)

**Incident context, where the work already happens.** SoftBender is a Jira Cloud app and Codegeist 2026 project taking a context-first approach to SRE response. Its first delivered capability is a fast, read-only issue brief in Jira; the longer-term direction is to connect operational changes to business impact and safe remediation.

> **Current status:** The Jira issue panel and Jira issue-context resolver are implemented. Teamwork Graph, Bitbucket deployment correlation, revenue-risk scoring, Rovo, MCP, and automated remediation are roadmap work, not capabilities in the current deployment.

## Why SoftBender

Incident responders lose time moving between tickets, deployments, service ownership, and business-impact tools. SoftBender starts inside the Jira issue and brings its essential operational context into one compact panel. The design is intentionally permission-aware and read-only today: it requests only the fields the panel needs and uses the viewing user's Jira access.

## What Works Today

Open the SoftBender issue panel on a Jira issue to see:

- Issue key and summary
- Status, issue type, and priority
- Assignee and last-updated time
- Loading, unavailable, rate-limited, and retry states

The panel fetches context when opened and offers a manual refresh. It does not poll, persist issue data, change Jira issues, or call third-party services.

## System Architecture

```mermaid
flowchart LR
	subgraph Jira[Atlassian Jira Cloud]
		User[Responder]
		Issue[Jira issue view]
		UI[SoftBender Custom UI<br/>React + TypeScript]
		Bridge[Forge Bridge<br/>invoke getIssueContext]
		Resolver[Forge resolver<br/>src/resolvers/index.ts]
		JiraREST[Jira REST API v3]
		User --> Issue
		Issue --> UI
		UI --> Bridge
		Bridge --> Resolver
		Resolver -->|api.asUser, selected fields| JiraREST
		JiraREST -->|normalized issue DTO| Resolver
		Resolver --> Bridge
		Bridge --> UI
	end

	subgraph Build[Build and packaging]
		Source[React and CSS source]
		Vite[Vite production build]
		Resource[static/frontend]
		Source --> Vite --> Resource
	end

	Manifest[Forge manifest] -->|binds panel, resource, resolver| Issue
	Resource --> UI

	subgraph Roadmap[Planned integrations - not in current request path]
		TWG[Teamwork Graph]
		Bitbucket[Bitbucket deployments]
		Revenue[Revenue and business impact]
		Rovo[Rovo agent and skills]
		MCP[MCP context server]
		Remediation[Approved remediation workflows]
	end
```

### Request lifecycle

1. Jira opens the Custom UI issue panel and supplies its extension context.
2. The UI invokes `getIssueContext` through `@forge/bridge`.
3. The resolver validates the issue key and calls Jira REST API v3 with `api.asUser()`.
4. Jira enforces the viewing user's access. SoftBender requests only summary, status, priority, issue type, assignee, and update time.
5. The resolver returns a small normalized response. The UI renders the issue details or a recoverable error state.

## Security and Permissions

- Jira API calls run as the current user; SoftBender does not elevate issue access.
- Issue keys are taken from Forge extension context, checked for a non-empty string, and encoded with Forge's `route` helper.
- The resolver requests a fixed list of Jira fields rather than returning the full issue payload.
- Jira authorization failures and unavailable issues are presented without exposing response bodies.
- The current resolver is read-only. The manifest includes `read:jira-work` and `write:jira-work`; **the write scope is not currently used**. Review and remove it until a feature requires write access.
- No issue data is stored by this feature.

## Performance and Resilience

- One Jira request is made when the panel loads, with a manual refresh instead of background polling.
- The API request limits its response to the fields displayed in the panel.
- Vite emits production assets with hashed filenames and relative asset paths for the Forge Custom UI resource.
- The panel handles Jira rate limiting (`429`), permission or missing-issue responses (`401`, `403`, `404`), other HTTP failures, malformed responses, and network errors.
- Retries are user initiated through the refresh control; the app does not currently run automatic retry or backoff logic.

## Technology

| Area | Technology |
| --- | --- |
| App platform | Atlassian Forge |
| Runtime | Node.js 22.x |
| Frontend | React, TypeScript, Tailwind CSS 4, Vite |
| Forge UI integration | `@forge/bridge` |
| Backend | Forge resolver and `@forge/api` |
| Current product surface | Jira Cloud issue panel |

## Repository Layout

```text
.
├── manifest.yml              # Forge modules, resource, runtime, and scopes
├── package.json              # Build and typecheck scripts
├── package-lock.json         # Reproducible npm dependency graph
├── tsconfig.json             # Strict TypeScript configuration
├── vite.config.ts            # Builds Custom UI into static/frontend
├── src/
│   ├── index.ts              # Forge resolver handler entry point
│   ├── resolvers/index.ts    # Jira issue-context resolver
│   └── frontend/
│       ├── index.html
│       ├── main.tsx          # Issue panel and state handling
│       └── styles.css
└── static/frontend/          # Built Forge Custom UI resource
```

## Requirements

- Node.js 22.x
- npm
- Atlassian Forge CLI
- An Atlassian account with a Jira Cloud site where you can install Forge apps

## Get Started

Clone the repository and install the locked dependencies:

```sh
git clone https://github.com/Bright-star-cell/SoftBender.git
cd SoftBender
npm ci
```

Authenticate the Forge CLI and check the app:

```sh
forge login
npm run typecheck
npm run build
forge lint
```

Deploy to the development environment:

```sh
forge deploy
```

For a first install, follow the CLI prompts or specify your Jira site and product:

```sh
forge install --site your-site.atlassian.net --product jira --environment development
```

After changing code, run `npm run typecheck`, `npm run build`, and `forge lint`, then deploy again. If a future change adds or removes scopes, upgrade the existing installation so the site receives the updated consent requirements:

```sh
forge install --upgrade --site your-site.atlassian.net --product jira --environment development
```

Replace `your-site.atlassian.net` with a site you administer. Forge deployment and installation require an authenticated CLI session and the appropriate site permissions.

## Development Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the exact versions in `package-lock.json` |
| `npm run typecheck` | Run strict TypeScript checking without emitting files |
| `npm run build` | Build the frontend into `static/frontend` |
| `forge lint` | Validate the Forge manifest and app configuration |
| `forge deploy` | Package and deploy to the selected Forge environment |

The Forge backend bundler must be able to emit TypeScript output. Keep `noEmit` off in the root `tsconfig.json`; the dedicated typecheck script passes `--noEmit` itself.

## Troubleshooting

### `TypeScript emitted no output`

Check that the root `tsconfig.json` does not set `"noEmit": true`. Forge's TypeScript bundler needs emitted output; `npm run typecheck` already disables emission through its command-line flag.

### `Not logged in`

Forge CLI authentication is local to the shell environment. Run `forge login` in the same terminal where you run `forge lint` or `forge deploy`, then retry.

### The panel says the issue is unavailable

Confirm that the signed-in Jira user can view the issue and that the app has been installed in the expected site and environment. The panel intentionally gives the same user-facing message for authorization failures and missing issues.

### Jira is rate limiting requests

Wait briefly and use the panel's refresh button. Automatic retries are not implemented.

## Roadmap

These are intended directions, not implemented or enabled features:

- Teamwork Graph context linking work, people, goals, decisions, and outcomes
- Bitbucket pull request and deployment correlation
- Revenue exposure and business-impact estimation
- Rovo agent and assignable skills for deployment-risk questions
- MCP-based context access with explicit authentication and authorization boundaries
- Human-reviewed remediation proposals and auditable execution controls

Each integration should add value without weakening least-privilege access, data boundaries, or responder control.

## Contributing

Issues and pull requests are welcome. Keep changes scoped, preserve strict TypeScript checking, and verify frontend changes with `npm run typecheck` and `npm run build`. Validate Forge configuration with `forge lint` before submitting deployment-related changes.

## License

SoftBender is licensed under the [MIT License](LICENSE).
