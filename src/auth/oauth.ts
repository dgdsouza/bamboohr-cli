import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { URL } from 'node:url';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  saveConfig,
  savePendingOAuth,
  loadPendingOAuth,
  clearPendingOAuth,
  type Config,
} from '../config.js';
import { assertValidDomain } from './domain.js';
import { redactErrorBody } from '../utils/errors.js';

const REDIRECT_PORT = 19876;
const REDIRECT_HOST = 'localhost';
const REDIRECT_URI = `http://${REDIRECT_HOST}:${REDIRECT_PORT}/callback`;

/**
 * The manual flow can use a hosted callback page (e.g. a static Vercel site)
 * instead of the localhost URI, so users get a friendly "copy this URL" page
 * rather than a connection error. The URI must be registered on the BambooHR
 * OAuth app and must match at both the authorize and token-exchange steps.
 */
function resolveManualRedirectUri(explicit?: string): string {
  const uri = explicit ?? process.env.BAMBOOHR_REDIRECT_URI ?? REDIRECT_URI;
  if (!/^https?:\/\//.test(uri)) {
    throw new Error(`Invalid redirect URI "${uri}" — must start with http:// or https://`);
  }
  return uri;
}

function getAuthorizeUrl(domain: string): string {
  return `https://${domain}.bamboohr.com/authorize.php`;
}

function getTokenUrl(domain: string): string {
  return `https://${domain}.bamboohr.com/token.php`;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function waitForAuthCode(expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err: Error | null, code?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      if (err) reject(err);
      else resolve(code!);
    };

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://${REDIRECT_HOST}:${REDIRECT_PORT}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end();
        return;
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error || !code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Authorization failed.</h2><p>You can close this tab.</p></body></html>');
        finish(new Error(error ?? 'No authorization code received'));
        return;
      }

      if (!state || !constantTimeEquals(state, expectedState)) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Authorization rejected (state mismatch).</h2><p>You can close this tab.</p></body></html>');
        finish(new Error('OAuth state mismatch — possible CSRF; aborting'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h2>Authorized!</h2><p>You can close this tab and return to the terminal.</p></body></html>');
      finish(null, code);
    });

    server.on('error', (err) => finish(new Error(`Failed to bind auth callback server: ${err.message}`)));

    // Loopback only (RFC 8252 §8.3) — never expose the callback listener to the LAN.
    server.listen(REDIRECT_PORT, '127.0.0.1', () => {});

    const timer = setTimeout(() => finish(new Error('Authorization timed out after 120 seconds')), 120_000);
  });
}

function openBrowser(url: string): void {
  const platform = process.platform;
  let cmd: string;
  let args: string[];
  if (platform === 'darwin') {
    cmd = 'open';
    args = [url];
  } else if (platform === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', '', url];
  } else {
    cmd = 'xdg-open';
    args = [url];
  }
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // Browser open failed — user can use the printed URL
  }
}

async function exchangeCodeForToken(
  domain: string,
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<{ access_token: string; refresh_token?: string }> {
  const res = await fetch(`${getTokenUrl(domain)}?request=token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${redactErrorBody(body)}`);
  }

  return res.json() as Promise<{ access_token: string; refresh_token?: string }>;
}

export async function refreshAccessToken(config: Config): Promise<string> {
  const auth = config.auth;
  if (auth?.method !== 'oauth' || !auth.refreshToken || !auth.clientId || !auth.clientSecret || !config.companyDomain) {
    throw new Error('Cannot refresh token — missing OAuth credentials. Run: bamboohr login-oauth');
  }

  const res = await fetch(`${getTokenUrl(config.companyDomain)}?request=token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: auth.refreshToken,
      client_id: auth.clientId,
      client_secret: auth.clientSecret,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${redactErrorBody(body)}`);
  }

  const data = (await res.json()) as { access_token: string; refresh_token?: string };

  config.auth = {
    ...auth,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? auth.refreshToken,
  };
  saveConfig(config);

  return data.access_token;
}

const ALL_SCOPES = [
  'openid', 'email',
  'employee', 'employee:assets', 'employee:compensation', 'employee:contact',
  'employee:custom_fields', 'employee:custom_fields_encrypted',
  'employee:demographic', 'employee:dependent', 'employee:dependent:ssn',
  'employee:education', 'employee:emergency_contacts', 'employee:file',
  'employee:identification', 'employee:job', 'employee:management',
  'employee:name', 'employee:payroll', 'employee:photo', 'employee:providers',
  'employee:providers:payroll', 'employee_directory', 'employee_verifications',
  'esignature', 'goal', 'onboarding',
  'performance:assessments', 'performance:feedback', 'performance:one_on_ones',
  'report', 'time_off',
];

function buildAuthorizeUrl(companyDomain: string, clientId: string, state: string, redirectUri: string): string {
  return (
    `${getAuthorizeUrl(companyDomain)}?request=authorize&response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}` +
    `&scope=${encodeURIComponent(ALL_SCOPES.join(' '))}`
  );
}

const PENDING_OAUTH_TTL_MS = 15 * 60 * 1000;

/**
 * Step 1 of the manual (no-browser) OAuth flow, for headless or sandboxed
 * environments where the CLI cannot open a browser or receive the loopback
 * redirect (e.g. Claude Cowork / remote sessions). Returns the authorize URL
 * for the user to open themselves; the state and credentials are persisted
 * until `completeManualOAuth` is called.
 */
export function startManualOAuth(
  companyDomain: string,
  clientId: string,
  clientSecret: string,
  redirectUri?: string,
): { authorizeUrl: string; redirectUri: string } {
  assertValidDomain(companyDomain);

  const resolvedRedirectUri = resolveManualRedirectUri(redirectUri);
  const state = base64url(randomBytes(16));
  savePendingOAuth({
    companyDomain,
    clientId,
    clientSecret,
    state,
    redirectUri: resolvedRedirectUri,
    createdAt: Date.now(),
  });

  return {
    authorizeUrl: buildAuthorizeUrl(companyDomain, clientId, state, resolvedRedirectUri),
    redirectUri: resolvedRedirectUri,
  };
}

function parseRedirectInput(input: string): { code: string; state: string | null } {
  const trimmed = input.trim();
  if (trimmed.includes('?') || trimmed.includes('://')) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error('Could not parse the pasted redirect URL. Paste the full URL from the browser address bar.');
    }
    const error = url.searchParams.get('error');
    if (error) {
      throw new Error(`Authorization failed: ${error}`);
    }
    const code = url.searchParams.get('code');
    if (!code) {
      throw new Error('The pasted URL has no "code" parameter. Paste the full URL from the browser address bar after authorizing.');
    }
    return { code, state: url.searchParams.get('state') };
  }
  // Bare authorization code.
  return { code: trimmed, state: null };
}

/**
 * Step 2 of the manual OAuth flow. Accepts the full redirect URL the user
 * copied from the browser address bar (preferred, so state is verified) or a
 * bare authorization code with the state passed separately.
 */
export async function completeManualOAuth(redirectUrlOrCode: string, explicitState?: string): Promise<void> {
  const pending = loadPendingOAuth();
  if (!pending) {
    throw new Error('No pending OAuth login. Run: bamboohr login-oauth-start');
  }
  if (Date.now() - pending.createdAt > PENDING_OAUTH_TTL_MS) {
    clearPendingOAuth();
    throw new Error('Pending OAuth login expired. Run: bamboohr login-oauth-start again.');
  }

  const { code, state } = parseRedirectInput(redirectUrlOrCode);
  const effectiveState = state ?? explicitState;
  if (!effectiveState || !constantTimeEquals(effectiveState, pending.state)) {
    throw new Error('OAuth state mismatch — the pasted URL does not match the pending login. Run: bamboohr login-oauth-start again.');
  }

  const tokens = await exchangeCodeForToken(
    pending.companyDomain,
    code,
    pending.clientId,
    pending.clientSecret,
    pending.redirectUri ?? REDIRECT_URI,
  );

  const config: Config = {
    companyDomain: pending.companyDomain,
    auth: {
      method: 'oauth',
      clientId: pending.clientId,
      clientSecret: pending.clientSecret,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    },
  };
  saveConfig(config);
  clearPendingOAuth();
}

export async function loginWithOAuth(
  companyDomain: string,
  clientId: string,
  clientSecret: string,
): Promise<void> {
  assertValidDomain(companyDomain);

  const state = base64url(randomBytes(16));

  // The browser flow always uses the loopback URI — it binds the local server.
  const authorizeUrl = buildAuthorizeUrl(companyDomain, clientId, state, REDIRECT_URI);

  console.log('Opening browser for authorization...');
  console.log(`If it doesn't open, visit: ${authorizeUrl}`);

  const codePromise = waitForAuthCode(state);
  openBrowser(authorizeUrl);

  const code = await codePromise;
  const tokens = await exchangeCodeForToken(companyDomain, code, clientId, clientSecret, REDIRECT_URI);

  const config: Config = {
    companyDomain,
    auth: {
      method: 'oauth',
      clientId,
      clientSecret,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    },
  };
  saveConfig(config);
}
