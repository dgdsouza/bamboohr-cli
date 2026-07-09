# BambooHR CLI

A command-line interface for the BambooHR API. Designed for agentic AI usage with structured JSON output for every command.

## Installation

One-liner — installs dependencies, builds, and links `bamboohr` globally:

```bash
npm run install-cli
```

After this, `bamboohr` is on your `PATH`:

```bash
bamboohr --help
```

To uninstall:

```bash
npm run uninstall-cli
```

If you'd rather not link globally, you can run it directly from the repo:

```bash
npm install && npm run build
node bin/bamboohr.js --help
```

## Use as a Claude skill (Claude Cowork / Claude Code)

The `skills/bamboohr/` folder is a self-contained [Agent Skill](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview): it bundles the entire CLI as a single file (`skills/bamboohr/scripts/bamboohr.js`, built by `npm run build`) alongside the `SKILL.md` instructions, so it needs no npm install in the target environment — just Node 20+.

- **Claude Code**: copy the folder to `.claude/skills/bamboohr/` (project) or `~/.claude/skills/bamboohr/` (user).
- **Claude Cowork / claude.ai**: zip the `skills/bamboohr/` folder and upload it as a skill.

Employees authenticate with the browser-based manual OAuth flow described below (`login-oauth-start` / `login-oauth-complete`) — the skill walks Claude through it. The environment's network policy must allow `*.bamboohr.com` and `api.bamboohr.com`.

## Authentication

The CLI supports two authentication methods.

### API Key

```bash
bamboohr login --domain <your-subdomain> --api-key <your-api-key>
```

Or set environment variables to avoid leaking secrets via `ps`:

```bash
export BAMBOOHR_DOMAIN=your-subdomain
export BAMBOOHR_API_KEY=your-api-key
bamboohr login
```

### OAuth

Requires an OAuth application registered in your BambooHR developer portal with:
- Redirect URI: `http://localhost:19876/callback`
- Scopes assigned to the app (see below)

```bash
bamboohr login-oauth --domain <subdomain> --client-id <id> --client-secret <secret>
```

Or via environment variables: `BAMBOOHR_DOMAIN`, `BAMBOOHR_CLIENT_ID`, `BAMBOOHR_CLIENT_SECRET`.

A browser will open to the BambooHR authorization page. After approval, tokens are stored in `~/.bamboohr-cli/config.json` (mode 0600) and used automatically for subsequent requests.

#### Available scopes

The CLI requests all scopes BambooHR offers. The app must have these enabled in the developer portal for the request to succeed:

**Employee:** `employee`, `employee:assets`, `employee:compensation`, `employee:contact`, `employee:custom_fields`, `employee:custom_fields_encrypted`, `employee:demographic`, `employee:dependent`, `employee:dependent:ssn`, `employee:education`, `employee:emergency_contacts`, `employee:file`, `employee:identification`, `employee:job`, `employee:management`, `employee:name`, `employee:payroll`, `employee:photo`, `employee:providers`, `employee:providers:payroll`, `employee_directory`, `employee_verifications`, `esignature`, `goal`, `onboarding`, `performance:assessments`, `performance:feedback`, `performance:one_on_ones`

**Reports:** `report`

**Time Off:** `time_off`

Plus the OpenID Connect basics: `openid`, `email`.

If a request returns 401 on a specific endpoint (e.g. `/employees/directory` works but compensation fails), the app likely needs the corresponding scope enabled — update the app in the developer portal, then re-run `login-oauth`.

#### OAuth without a browser (sandboxed / headless environments)

In environments that can't open a browser or receive the `localhost` redirect — Claude Cowork, Claude Code on the web, SSH sessions, CI — use the two-step manual flow:

```bash
# 1. Prints an authorize URL and remembers the pending login (15 min)
bamboohr login-oauth-start --domain <subdomain> --client-id <id> --client-secret <secret>

# 2. Open the URL in any browser, approve, then copy the full redirect URL
#    from the address bar (the localhost page failing to load is expected)
bamboohr login-oauth-complete --redirect-url 'http://localhost:19876/callback?code=...&state=...'
```

The authorization code stays on the user's machine (it lands in the browser address bar and is pasted back — never sent to a server). Avoid hosting a callback page for BambooHR: it's a confidential client with no PKCE and the client secret is typically shared company-wide, so a code reaching a hosted page's logs could be replayed by an insider. `--redirect-uri` / `BAMBOOHR_REDIRECT_URI` exists for advanced users running their own trusted, non-logging callback, but the localhost default is recommended.

The CLI also honors `HTTPS_PROXY`/`HTTP_PROXY`, so it works behind sandbox egress proxies (use `NODE_EXTRA_CA_CERTS` if the proxy re-signs TLS).

By default credentials live in `~/.bamboohr-cli/`. In ephemeral sandboxes the home directory is wiped between sessions; set `BAMBOOHR_CONFIG_DIR` to a host-mounted folder (e.g. `<project>/.bamboohr`) to persist logins. The CLI drops a `.gitignore` with `*` into the config dir so tokens can't be committed — still, avoid pointing it at synced or shared folders.

### Other auth commands

```bash
bamboohr status   # Show current authentication
bamboohr logout   # Clear stored credentials
```

## Command Reference

Every command returns JSON. Use `--help` on any subcommand for full option details.

### Employees

| Command | Description |
|---|---|
| `employees directory` | Employee directory |
| `employees list` | List all employees (IDs only) |
| `employees get <id>` | Get employee by ID. Use `--fields` for custom fields |
| `employees create` | Create a new employee |
| `employees update <id>` | Update an employee |
| `employees changed` | Employees whose data has changed since a date |
| `employees photo <id>` | Get employee photo URL |

### Time Off

| Command | Description |
|---|---|
| `time-off requests` | List time off requests |
| `time-off create-request` | Create a time off request |
| `time-off update-request <id>` | Update request status |
| `time-off types` | List time off types |
| `time-off policies` | List time off policies |
| `time-off employee-policies <id>` | Policies for an employee |
| `time-off assign-policies <id>` | Assign policies to an employee |
| `time-off balance <id>` | Get an employee's balance |
| `time-off adjust-balance <id>` | Adjust an employee's balance |
| `time-off history <id>` | Create a history entry |
| `time-off whos-out` | Who is currently out |

### Time Tracking

| Command | Description |
|---|---|
| `time-tracking entries` | List timesheet entries |
| `time-tracking clock-in` | Clock in an employee |
| `time-tracking clock-out` | Clock out an employee |
| `time-tracking clock-entries` | Create/update clock entries |
| `time-tracking hour-entries` | Create/update hour entries |
| `time-tracking delete-clock-entries` | Delete clock entries |
| `time-tracking delete-hour-entries` | Delete hour entries |
| `time-tracking create-project` | Create a time tracking project |
| `time-tracking breaks` | Manage meal & rest break policies |

### Hours

| Command | Description |
|---|---|
| `hours get <id>` | Get an hour record |
| `hours create` | Create an hour record |
| `hours update <id>` | Update an hour record |
| `hours delete <id>` | Delete an hour record |
| `hours bulk` | Bulk create/update hour records |

### Metadata

| Command | Description |
|---|---|
| `meta fields` | List configured employee fields (includes custom fields) |
| `meta list-fields` | List custom list fields |
| `meta update-list-field <id>` | Update list field values |
| `meta tabular-fields` | List tabular data fields |
| `meta countries` | List countries |
| `meta states <countryId>` | List states for a country |
| `meta timezones` | List timezones |
| `meta users` | List system users |
| `meta integrations` | Integration settings |

### Files

| Command | Description |
|---|---|
| `files company` | Company files |
| `files employee` | Employee files |

### Reports

| Command | Description |
|---|---|
| `reports list` | List available reports |
| `reports get <id>` | Get a specific report |
| `reports custom` | Run a custom report (specify fields and filters) |

### Datasets

| Command | Description |
|---|---|
| `datasets list` | List available datasets |
| `datasets fields <id>` | List fields for a dataset |
| `datasets field-options <id>` | Get field options |
| `datasets query <id>` | Query a dataset |

### Tables

Tabular employee data (compensation, jobInfo, employmentStatus, etc.).

| Command | Description |
|---|---|
| `tables get <employeeId> <tableName>` | Get table data |
| `tables create <employeeId> <tableName>` | Add a row |
| `tables update <employeeId> <tableName> <rowId>` | Update a row |
| `tables delete <employeeId> <tableName> <rowId>` | Delete a row |
| `tables changed <employeeId> <tableName>` | Changed rows since a date |

### Goals

`goals list`, `goals create`, `goals update`, `goals delete`, `goals close`, `goals reopen`, `goals progress`, `goals milestone-progress`, `goals sharing`, `goals aggregate`, `goals status-counts`, `goals filters`, `goals creation-permission`, `goals sharing-options`, `goals alignable-options`, `goals comments`, `goals add-comment`, `goals update-comment`, `goals delete-comment`.

### Training

`training list-types`, `training create-type`, `training update-type`, `training delete-type`, `training list-categories`, `training create-category`, `training update-category`, `training delete-category`, `training list <employeeId>`, `training create <employeeId>`, `training update <employeeId> <trainingId>`, `training delete <employeeId> <trainingId>`.

### Benefits

`benefits list`, `benefits coverages`, `benefits deduction-types`, `benefits employee <id>`, `benefits member <id>`, `benefits member-events <id>`, `benefits dependents <id>`, `benefits get-dependent`, `benefits create-dependent`, `benefits update-dependent`.

### Recruiting

`recruiting jobs`, `recruiting create-job`, `recruiting applicants`, `recruiting get-applicant <id>`, `recruiting add-comment <id>`, `recruiting statuses`, `recruiting update-status <id>`, `recruiting locations`, `recruiting hiring-leads`, `recruiting create-candidate`.

### Webhooks

`webhooks list`, `webhooks get <id>`, `webhooks create`, `webhooks update <id>`, `webhooks delete <id>`, `webhooks logs <id>`, `webhooks monitor-fields`, `webhooks post-fields`.

### Photos

`photos get <employeeId>`, `photos upload <employeeId>`.

## Output Format

All commands emit JSON to stdout. Errors emit a JSON object with `error` to stderr and exit with a non-zero code. This makes the CLI safe to pipe into `jq`, `node`, or another script.

## Configuration

Stored at `~/.bamboohr-cli/config.json` (created with mode 0700, file mode 0600). Contains:

- `companyDomain` — your BambooHR subdomain
- `auth.method` — `api-key` or `oauth`
- Credentials specific to the method (API key, OAuth tokens)

## Notes on custom fields

`employees get <id>` returns only 8 default fields. To retrieve custom fields, pass them via `--fields`:

```bash
bamboohr employees get 113 --fields "firstName,lastName,payRate,customHiringManager"
```

To discover available field names (including custom fields), use `bamboohr meta fields`. Field IDs are also valid in `--fields`.

## Skill for AI agents

A `bamboohr` skill is bundled in `skills/bamboohr/` for use with Claude Code and the Claude Agent SDK. See [skills/bamboohr/SKILL.md](skills/bamboohr/SKILL.md).
