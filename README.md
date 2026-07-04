# bamboohr-skill

A self-contained [Agent Skill](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) that lets employees query BambooHR from **Claude Cowork**, **Claude Code**, or claude.ai — including a browser-based OAuth login that works inside sandboxed environments where a classic localhost OAuth callback cannot.

The repo root **is** the skill: `SKILL.md` plus a fully bundled single-file CLI at `scripts/bamboohr.js` (no npm install needed, only Node 20+). It also ships an optional static callback page you can host (e.g. on Vercel) to make the login flow friendlier.

## Repo layout

| Path | What it is |
|---|---|
| `SKILL.md` | The skill instructions Claude loads |
| `scripts/bamboohr.js` | The entire BambooHR CLI, bundled into one file (built from [dgdsouza/bamboohr-cli](https://github.com/dgdsouza/bamboohr-cli)) |
| `callback-page/` | Optional static OAuth callback page + Vercel config (not part of the skill payload) |
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
   - Redirect URI `http://localhost:19876/callback` — plus your hosted callback page URL if you deploy one (see below)
   - The scopes listed at the bottom of `SKILL.md` enabled
2. Decide how employees get the app credentials (domain, client ID, client secret):
   - **Easiest:** edit `SKILL.md` and add them under a "Company defaults" note before distributing — the secret is effectively company-internal, not truly secret, since every employee's machine needs it to exchange and refresh tokens (see Security below)
   - Or put them in a `.env`/config file in the folder employees point Cowork at
   - Or let employees paste them into chat on first login

## How employees log in (inside Cowork)

1. Claude runs `login-oauth-start`, which prints an authorization URL.
2. The employee opens it in their own browser and approves access as themselves.
3. The browser lands on the redirect URI:
   - with the default `localhost` URI, the page fails to load (expected) and they copy the full URL from the address bar;
   - with the hosted callback page, they get a clean page with a **Copy** button.
4. They paste the URL back into chat; Claude runs `login-oauth-complete`. Tokens are scoped to that employee's own BambooHR permissions.

To persist the login across Cowork sessions (the sandbox VM is wiped each time), the skill can store credentials in the mounted workspace folder via `BAMBOOHR_CONFIG_DIR` — see `SKILL.md`. The config directory writes a `.gitignore` containing `*` into itself so tokens can never be committed.

## Hosted callback page (optional)

`callback-page/` is a 100%-static page: it reads `code`/`state` from the query string, scrubs them from the address bar/history, and shows a copy button. No backend, no analytics, no external requests — the authorization code never leaves the employee's browser, and static asset requests don't appear in Vercel's user-visible logs.

Deploy:

```bash
cd callback-page && npx vercel deploy --prod
```

Then register `https://<your-domain>/callback` as a redirect URI on the BambooHR OAuth app, and have the skill pass `--redirect-uri https://<your-domain>/callback` to `login-oauth-start` (or set `BAMBOOHR_REDIRECT_URI`). Prefer a company-owned custom domain: the redirect URI is a phishing-relevant asset, and a bare `*.vercel.app` name could be re-registered by someone else if the project is ever deleted. Keep the page static — do not add serverless functions, log drains, or analytics to this project.

## Security model

- **The client secret is not really a secret.** This is a public client in OAuth terms (RFC 8252): every employee's machine needs the secret to exchange and refresh tokens. Treat it as company-internal (fine in an internally distributed skill, not for a public repo), and rotate it in the developer portal if it leaks. It grants nothing by itself — all data access requires an employee to authenticate in the browser, and tokens carry only that employee's own BambooHR permission level.
- **Authorization codes** are single-use, expire in minutes, and are useless without the client secret. The CLI verifies the OAuth `state` parameter (constant-time) before exchanging them; pending logins expire after 15 minutes.
- **Tokens** are stored with `0600` permissions and redacted from error output. Default location `~/.bamboohr-cli/`; with `BAMBOOHR_CONFIG_DIR`, a self-gitignoring folder of your choice. Avoid pointing it at synced (iCloud/Dropbox) or shared folders.
- **Egress:** the CLI honors `HTTPS_PROXY`/`HTTP_PROXY` (sandbox proxies) and needs the network policy to allow `*.bamboohr.com` and `api.bamboohr.com`. Use `NODE_EXTRA_CA_CERTS` if the proxy re-signs TLS.

## Updating the bundled CLI

`scripts/bamboohr.js` is a build artifact — don't edit it by hand. It is built from [dgdsouza/bamboohr-cli](https://github.com/dgdsouza/bamboohr-cli) (currently commit `54c83f1`):

```bash
# in a checkout of bamboohr-cli
npm install && npm run build
cp skills/bamboohr/scripts/bamboohr.js <this-repo>/scripts/bamboohr.js
```

Also copy `skills/bamboohr/SKILL.md` if the CLI's behavior or commands changed, update the commit hash above, and run `./test/smoke.sh`.

## License

MIT — see [LICENSE](LICENSE).
