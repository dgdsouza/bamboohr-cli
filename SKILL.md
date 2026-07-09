---
name: bamboohr
description: Query and update BambooHR data (employees, time off, compensation, reports, custom fields) using the `bamboohr` CLI. Use whenever the user asks about people in the company, HR data, time off / who's out, salaries, hiring history, org structure, training, benefits, or anything that lives in BambooHR.
---

# BambooHR

You have access to a `bamboohr` CLI that talks to the BambooHR API. Every command emits JSON to stdout, so pipe results into `node -e` or `jq` to filter and aggregate.

## Running the CLI

This skill is self-contained: the full CLI is bundled at `scripts/bamboohr.js` next to this SKILL.md (single file, no npm install, requires Node 20+). Set up an alias once per session, using the directory this SKILL.md lives in:

```bash
bamboohr() { node "<this skill's directory>/scripts/bamboohr.js" "$@"; }
```

If a global `bamboohr` command is already on `PATH`, use that instead. All examples below assume `bamboohr` resolves one way or the other.

The CLI automatically routes through `HTTPS_PROXY`/`HTTP_PROXY` when set, so it works behind sandbox egress proxies.

## Supported surfaces & prerequisites

Check these first — the skill silently fails without them:

- **Network egress.** On **claude.ai chat** and **Claude Cowork**, the sandbox's outbound traffic is allowlisted and defaults to "package managers only". An **org admin must allowlist `*.bamboohr.com` and `api.bamboohr.com`** (org Capabilities / network settings) or *both* the OAuth token exchange and every API call are blocked. A `fetch failed` error on login almost always means this hasn't been done. **Claude Code** has full network access and needs nothing. Behind a TLS-inspecting proxy, point `NODE_EXTRA_CA_CERTS` at the proxy's CA bundle.
- **Login persistence.** On claude.ai chat and **Cowork without a mounted folder**, the environment is per-session and wiped when the session ends — the user re-authenticates each session. To persist the login, use a **mounted Cowork folder** with `BAMBOOHR_CONFIG_DIR` (see below), or run on **Claude Code** (real disk). This is expected, not a bug.

## Before you start

Check authentication first:

```bash
bamboohr status
```

If unauthenticated, pick the flow that fits the environment. Never invent credentials — if the user hasn't provided them, ask.

- **API key** (any environment): `bamboohr login --domain <subdomain> --api-key <key>` (or via `BAMBOOHR_DOMAIN` / `BAMBOOHR_API_KEY`).
- **OAuth, sandboxed (Claude Cowork, claude.ai, SSH)** — the manual paste flow below. This is the normal path in Cowork.
- **OAuth, on the user's own machine (Claude Code / local terminal)** — the automatic local flow, or the local-run recipe to seed a mounted folder.

### Manual OAuth (paste flow) — use this in Claude Cowork

The authorization code stays on the user's machine the whole time (it lands in their browser's address bar, never on a server), so nothing sensitive is ever logged remotely.

1. Get the company subdomain, OAuth client ID, and client secret (from the user, or from `BAMBOOHR_DOMAIN` / `BAMBOOHR_CLIENT_ID` / `BAMBOOHR_CLIENT_SECRET` if the environment defines them).
2. Start the login — prints an `authorize_url` and remembers the pending login for 15 minutes:

   ```bash
   bamboohr login-oauth-start --domain <subdomain> --client-id <id> --client-secret <secret>
   ```

3. Show the `authorize_url` to the user as a clickable link and tell them to:
   - open it in their browser and approve access;
   - expect the browser to land on `http://localhost:19876/callback` and **fail to load — that is normal**;
   - copy the **full URL** from the address bar (it contains `code=` and `state=`) and paste it back into the chat.
4. Finish the login (single-quote the URL — it contains `&`):

   ```bash
   bamboohr login-oauth-complete --redirect-url '<pasted url>'
   ```

5. Confirm with `bamboohr status`. Tokens are stored in the config dir and refreshed automatically.

The authorization code is single-use and expires in minutes — if `login-oauth-complete` reports an expired/invalid code, just restart from step 2. The BambooHR OAuth app must have `http://localhost:19876/callback` registered as a redirect URI and the scopes listed at the bottom of this file enabled.

### Fully-automatic login (on the user's own machine)

If the CLI runs directly on the user's computer (Claude Code, or a terminal on their Mac), skip the paste flow entirely:

```bash
bamboohr login-oauth --domain <subdomain> --client-id <id> --client-secret <secret>
```

This opens the browser and catches the redirect on a temporary `127.0.0.1:19876` server — no copy/paste. To *seed a Cowork-mounted folder* so future Cowork sessions inherit the login, run it on the Mac with `BAMBOOHR_CONFIG_DIR` pointed into that mounted folder (needs Node on the Mac):

```bash
BAMBOOHR_CONFIG_DIR="<mounted folder>/.bamboohr" bamboohr login-oauth --domain <subdomain> --client-id <id> --client-secret <secret>
```

### Persisting the login across sessions (`BAMBOOHR_CONFIG_DIR`)

By default the config lives in `~/.bamboohr-cli/`, which is wiped between Cowork sessions. Point `BAMBOOHR_CONFIG_DIR` at a **mounted** folder to keep the login (export it at the very start of the session, before any `bamboohr` command including login):

```bash
export BAMBOOHR_CONFIG_DIR="<mounted folder>/.bamboohr"
```

The CLI auto-creates the directory (`0700`), stores files `0600`, and writes a `.gitignore` containing `*` inside it so the tokens can't be committed. The directory must be **inside a mounted folder** to actually persist — anywhere else lands on the ephemeral VM disk and is wiped at session end.

**Ask the user before enabling this the first time.** It writes their refresh token to their real disk, and the sandbox won't prompt (the mounted folder was already granted). Warn them not to use a folder that is synced (iCloud/Dropbox) or shared with other people.

### Why there's no hosted login page

You might wonder why the flow uses a "copy from the address bar" step instead of a nice hosted callback page. It's deliberate: BambooHR is a confidential-client OAuth provider with **no PKCE**, and the client secret is typically shared across everyone in the company — so an authorization code that reached any hosted page's request logs could be replayed by an insider to impersonate a user. Keeping the code in the user's browser/address bar (never sending it to a server) removes that risk entirely. Do **not** introduce a hosted callback for BambooHR. (`--redirect-uri` / `BAMBOOHR_REDIRECT_URI` exists for advanced users who run their own trusted, non-logging callback, but the localhost default is recommended.)

## Core workflows

### Find an employee by name or email

The directory is the only listing endpoint — there is no search. Pull the directory and filter in JS:

```bash
bamboohr employees directory | node -e "
const d = JSON.parse(require('fs').readFileSync(0,'utf8'));
const emps = d.employees || d;
const q = 'NAME OR EMAIL'.toLowerCase();
console.log(JSON.stringify(emps.filter(e =>
  (e.displayName||'').toLowerCase().includes(q) ||
  (e.workEmail||'').toLowerCase().includes(q)
), null, 2));
"
```

Common ambiguity: surnames like `D'souza` can match multiple people (e.g. Dwayne and Mike). Always verify the full name, email, or ID before reporting results.

### Get an employee's details

`bamboohr employees get <id>` returns only 8 default fields. To get more, pass `--fields` with a comma-separated list:

```bash
bamboohr employees get 113 --fields "firstName,lastName,payRate,payType,hireDate,customHiringManager"
```

To discover field names (including custom fields like `customHiringManager`, `customHiringTalentPartner1`, etc.):

```bash
bamboohr meta fields
```

There are typically hundreds of custom fields. Filter the metadata output to find what you need.

### Salary / compensation

Salary is in the `compensation` table or via specific fields:

```bash
# Via fields
bamboohr employees get <id> --fields "payRate,payType,payPer,payRateEffectiveDate"

# Or via the compensation table (history of changes)
bamboohr tables get <id> compensation
```

Requires the `employee:compensation` scope if using OAuth (see Scopes section below).

### Time off

```bash
bamboohr time-off whos-out --start 2026-05-12 --end 2026-12-31
bamboohr time-off requests --employee-id <id> --start <date> --end <date>
bamboohr time-off balance <id>
```

`whos-out` returns confirmed/approved time off only. If `requests` returns an empty array for a future range, the person genuinely has nothing booked — don't infer otherwise.

### Custom reports

For data that spans many fields or filters across the whole company, use custom reports instead of iterating the directory:

```bash
bamboohr reports custom --fields "firstName,lastName,department,hireDate,customHiringManager" --title "Hiring history"
```

The output is `{ employees: { "<key>": { ... } } }`. **The outer key is NOT the employee ID** — it's an arbitrary internal key. The real employee ID is in `record.id` inside each entry. Always re-index by `record.id` if you need to join with directory data:

```js
const byId = {};
Object.values(rep.employees).forEach(e => { byId[e.id] = e; });
```

Convert to an array with `Object.values()` for filtering.

### Hiring manager / who hired whom

The hiring manager is in `customHiringManager` (a string, not an ID). Pull a report including that field and filter:

```bash
bamboohr reports custom --fields "firstName,lastName,jobTitle,department,hireDate,customHiringManager,status" --title "Hires" | node -e "
const d = JSON.parse(require('fs').readFileSync(0,'utf8'));
const target = 'EXACT NAME';
const hires = Object.values(d.employees).filter(e => e.customHiringManager === target);
console.log(hires.length, 'hires');
hires.forEach(e => console.log(e.hireDate, e.firstName, e.lastName, '-', e.jobTitle));
"
```

**Watch out for partial-name matching.** `(s||'').includes('d\\'souza')` will match both "Dwayne D'Souza" and "Mike D'Souza". Prefer exact equality on the full name when filtering hiring manager fields.

### Org structure / reporting lines

The `supervisor` field on each directory entry is the manager's display name (string). To count direct reports:

```bash
bamboohr employees directory | node -e "
const d = JSON.parse(require('fs').readFileSync(0,'utf8'));
const emps = d.employees || d;
const target = 'EXACT MANAGER NAME';
const directs = emps.filter(e => e.supervisor === target);
console.log('Direct reports:', directs.length);
"
```

For transitive reports (whole org under someone), recurse over `supervisor === <name>` until no new employees are found.

## Output and error handling

- All commands print JSON. Pipe through `node -e` or `jq` for filtering. Don't rely on regex over the human-readable output.
- Errors print a JSON object with an `error` field to stderr and exit non-zero.
- 401 errors on OAuth will trigger an auto-refresh if a refresh token is stored; otherwise the user must re-login.

## Things to avoid

- **Don't guess employee IDs.** Always look them up via the directory first.
- **Don't query `/employees/directory` if you only need one person's basic info** — it returns the entire company. Use `employees get <id>` once you have the ID.
- **Don't assume scopes.** OAuth tokens are scoped to what the developer-portal app has enabled. If a request returns 401 on a specific endpoint (e.g. `/employees/directory` works but compensation fails), the corresponding scope is missing from the app — the user must enable it in the developer portal and re-run `login-oauth`. The CLI itself already requests every available scope.
- **Don't try to write data without explicit user confirmation.** `create`, `update`, `delete`, `clock-in/out`, `adjust-balance` etc. mutate live HR records.

## OAuth scopes (full list)

The CLI requests every scope BambooHR offers. The app in the developer portal must have these enabled, or BambooHR returns `invalid_scope` at login. There are no other scopes (no `offline_access`, no wildcards).

**Employee group:** `employee`, `employee:assets`, `employee:compensation`, `employee:contact`, `employee:custom_fields`, `employee:custom_fields_encrypted`, `employee:demographic`, `employee:dependent`, `employee:dependent:ssn`, `employee:education`, `employee:emergency_contacts`, `employee:file`, `employee:identification`, `employee:job`, `employee:management`, `employee:name`, `employee:payroll`, `employee:photo`, `employee:providers`, `employee:providers:payroll`, `employee_directory`, `employee_verifications`, `esignature`, `goal`, `onboarding`, `performance:assessments`, `performance:feedback`, `performance:one_on_ones`

**Reports group:** `report`

**Time Off group:** `time_off`

**OIDC basics:** `openid`, `email`

Mapping: if a command 401s, infer the scope from the endpoint it hits — `tables get <id> compensation` needs `employee:compensation`; `time-off whos-out` needs `time_off`; `reports custom` needs `report`; `employees directory` needs `employee_directory`. Tell the user to enable the missing scope in the developer portal and re-run `login-oauth`.

## Discovery

When unsure which fields, tables, or endpoints exist, ask the CLI:

```bash
bamboohr --help
bamboohr <group> --help
bamboohr meta fields            # all employee fields including custom
bamboohr meta tabular-fields    # all table names
bamboohr datasets list          # all queryable datasets
```
