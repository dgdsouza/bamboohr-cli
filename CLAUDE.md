# CLAUDE.md

Guidance for Claude when working in this repository.

## What this repo is

The distributable **BambooHR skill** for Claude Cowork / Claude Code. The repo root is the skill itself: `SKILL.md` + `scripts/bamboohr.js`. Everything else (packaging script, tests, docs) supports distribution. The CLI's *source code* does not live here.

## Hard rules

- **Never hand-edit `scripts/bamboohr.js`.** It is a generated single-file bundle vendored from [dgdsouza/bamboohr-cli](https://github.com/dgdsouza/bamboohr-cli). To change CLI behavior: change that repo, run `npm run build` there, copy `skills/bamboohr/scripts/bamboohr.js` here, and update the source commit hash in README.md ("Updating the bundled CLI" section).
- **Keep `SKILL.md` truthful to the bundled CLI.** If you update the bundle, re-check every command, flag, and env var mentioned in SKILL.md against `node scripts/bamboohr.js <cmd> --help`. The upstream repo has its own copy of SKILL.md — keep the two in sync.
- **No hosted OAuth callback page for BambooHR.** A hosted callback was deliberately rejected: BambooHR is a confidential client with no PKCE and a company-wide client secret, so a code reaching any server's logs is replayable by an insider. The login must keep the authorization code client-side (localhost flow). Do not add a callback page, a `--redirect-uri` default pointing at a hosted URL, or anything that sends the code to a server.
- **Never commit credentials** — no real client IDs/secrets, tokens, or company subdomains in examples. Use placeholders like `<subdomain>`.

## Environment variables the CLI understands

`BAMBOOHR_DOMAIN`, `BAMBOOHR_API_KEY`, `BAMBOOHR_CLIENT_ID`, `BAMBOOHR_CLIENT_SECRET`, `BAMBOOHR_REDIRECT_URI` (custom OAuth callback, default `http://localhost:19876/callback`), `BAMBOOHR_CONFIG_DIR` (relocate token storage, e.g. into a Cowork-mounted folder), plus standard `HTTPS_PROXY`/`HTTP_PROXY`/`NO_PROXY` and `NODE_EXTRA_CA_CERTS`.

## Testing

```bash
./test/smoke.sh        # offline smoke tests (also run by CI)
node scripts/bamboohr.js --help
```

The smoke tests cover: help output, unauthenticated status, `login-oauth-start` (default + custom redirect URI), state-mismatch rejection in `login-oauth-complete`, and `BAMBOOHR_CONFIG_DIR` (including its self-written `.gitignore`). They use a temp `HOME` and never touch the network. For deeper OAuth testing, the upstream repo's approach is a local HTTPS mock of `<sub>.bamboohr.com/token.php` with a self-signed cert, `NO_PROXY`, and `NODE_EXTRA_CA_CERTS`.

## Packaging

`./make-skill-zip.sh` builds `dist/bamboohr.zip` (a `bamboohr/` folder containing `SKILL.md` + `scripts/`) for upload to Cowork / claude.ai. `dist/` is gitignored.
