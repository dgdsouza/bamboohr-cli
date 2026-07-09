# bamboohr-skill

A self-contained [Agent Skill](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) that lets employees query BambooHR from **Claude Cowork**, **Claude Code**, or claude.ai — including a browser-based OAuth login designed to work inside sandboxed environments where the CLI can't receive the localhost redirect directly.

The repo root **is** the skill: `SKILL.md` plus a fully bundled single-file CLI at `scripts/bamboohr.js` (no npm install needed, only Node 20+).

## Repo layout

| Path | What it is |
|---|---|
| `SKILL.md` | The skill instructions Claude loads |
| `scripts/bamboohr.js` | The entire BambooHR CLI, bundled into one file (built from [dgdsouza/bamboohr-cli](https://github.com/dgdsouza/bamboohr-cli)) |
| `make-skill-zip.sh` | Packages `dist/bamboohr.zip` for uploading to Cowork / claude.ai |
| `test/smoke.sh` | Offline smoke tests run by CI |

## Installing the skill

**Claude Cowork / claude.ai:** run `./make-skill-zip.sh` and upload `dist/bamboohr.zip` as a skill (Settings → Capabilities/Skills).

**Claude Code:** clone into your skills directory:

```bash
git clone https://github.com/dgdsouza/bamboohr-skill ~/.claude/skills/bamboohr
```

(or `.claude/skills/bamboohr` inside a project.)

## One-time admin setup

1. In the BambooHR developer portal, create an OAuth application with:
   - Redirect URI `http://localhost:19876/callback`
   - The scopes listed at the bottom of `SKILL.md` enabled
2. On **Claude Cowork / claude.ai**, have an org admin **allowlist `*.bamboohr.com` and `api.bamboohr.com`** in the org's network/Capabilities settings. Sandbox egress defaults to "package managers only", so without this the OAuth token exchange and every API call are blocked. (Claude Code has full egress and needs nothing.)
3. Decide how employees get the app credentials (domain, client ID, client secret):
   - **Easiest:** edit `SKILL.md` and add them under a "Company defaults" note before distributing — the secret is effectively company-internal, not truly secret, since every employee's machine needs it to exchange and refresh tokens (see Security below)
   - Or put them in a `.env`/config file in the folder employees point Cowork at
   - Or let employees paste them into chat on first login

## How employees log in (inside Cowork)

1. Claude runs `login-oauth-start`, which prints an authorization URL.
2. The employee opens it in their own browser and approves access as themselves.
3. The browser lands on `http://localhost:19876/callback`, which fails to load (expected); they copy the full URL from the address bar.
4. They paste the URL back into chat; Claude runs `login-oauth-complete`. Tokens are scoped to that employee's own BambooHR permissions.

The authorization code never leaves the employee's machine — it sits in their browser's address bar and is pasted back; it's never sent to any server. To persist the login across Cowork sessions (the sandbox VM is wiped each time), point `BAMBOOHR_CONFIG_DIR` at a mounted workspace folder — see `SKILL.md`. The config directory writes a `.gitignore` containing `*` into itself so tokens can never be committed.

## Why there's no hosted callback page

A hosted "copy this URL" page would be friendlier than the localhost error screen, but it's deliberately avoided for BambooHR. BambooHR is a confidential-client OAuth provider with **no PKCE**, and in practice the client secret is shared across the whole company. If an authorization code ever reached a hosted page's request logs, an insider with log access and the (company-wide) secret could replay it to impersonate a user — and without PKCE there's no way to make the code inert. Keeping the code in the user's browser/address bar (the localhost flow) means it never reaches a server, which removes that risk structurally rather than just reducing it. `--redirect-uri` / `BAMBOOHR_REDIRECT_URI` exists for advanced users who run their own trusted, non-logging callback, but the localhost default is what we recommend.

## Security model

- **The client secret is not really a secret.** This is a public client in OAuth terms (RFC 8252): every employee's machine needs the secret to exchange and refresh tokens, and it's typically shared company-wide. Treat it as company-internal (fine in an internally distributed skill, not for a public repo), and rotate it in the developer portal if it leaks. It grants nothing by itself — all data access requires an employee to authenticate in the browser, and tokens carry only that employee's own BambooHR permission level.
- **Authorization codes** are single-use and expire in minutes. Because the company-wide secret is *not* a reliable barrier, the real protection is that the localhost flow keeps the code on the user's machine — it's never transmitted to a server that could log it. The CLI also verifies the OAuth `state` parameter (constant-time) before exchanging; pending logins expire after 15 minutes.
- **Tokens** are stored with `0600` permissions and redacted from error output. Default location `~/.bamboohr-cli/`; with `BAMBOOHR_CONFIG_DIR`, a self-gitignoring folder of your choice. Avoid pointing it at synced (iCloud/Dropbox) or shared folders.
- **Egress:** the CLI honors `HTTPS_PROXY`/`HTTP_PROXY` (sandbox proxies) and needs the network policy to allow `*.bamboohr.com` and `api.bamboohr.com`. Use `NODE_EXTRA_CA_CERTS` if the proxy re-signs TLS.

## Updating the bundled CLI

`scripts/bamboohr.js` is a build artifact — don't edit it by hand. It is built from [dgdsouza/bamboohr-cli](https://github.com/dgdsouza/bamboohr-cli) (currently commit `e158ed9`):

```bash
# in a checkout of bamboohr-cli
npm install && npm run build
cp skills/bamboohr/scripts/bamboohr.js <this-repo>/scripts/bamboohr.js
```

Also copy `skills/bamboohr/SKILL.md` if the CLI's behavior or commands changed, update the commit hash above, and run `./test/smoke.sh`.

## License

MIT — see [LICENSE](LICENSE).
