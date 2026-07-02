import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';

export interface AuthConfig {
  method: 'api-key' | 'oauth';
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface Config {
  companyDomain?: string;
  auth?: AuthConfig;
}

// BAMBOOHR_CONFIG_DIR relocates stored credentials, e.g. into a host-mounted
// project folder so logins survive ephemeral sandboxes (Claude Cowork).
const CONFIG_DIR = process.env.BAMBOOHR_CONFIG_DIR || join(homedir(), '.bamboohr-cli');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const PENDING_OAUTH_FILE = join(CONFIG_DIR, 'oauth-pending.json');

export interface PendingOAuth {
  companyDomain: string;
  clientId: string;
  clientSecret: string;
  state: string;
  createdAt: number;
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  // The config dir may live inside a project repo (BAMBOOHR_CONFIG_DIR);
  // make it self-excluding so credentials can never be committed.
  const gitignore = join(CONFIG_DIR, '.gitignore');
  if (!existsSync(gitignore)) {
    writeFileSync(gitignore, '*\n', { encoding: 'utf-8', mode: 0o600 });
  }
}

export function loadConfig(): Config {
  try {
    const data = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export function saveConfig(config: Config): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

export function clearConfig(): void {
  saveConfig({});
  clearPendingOAuth();
}

export function savePendingOAuth(pending: PendingOAuth): void {
  ensureConfigDir();
  writeFileSync(PENDING_OAUTH_FILE, JSON.stringify(pending, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

export function loadPendingOAuth(): PendingOAuth | null {
  try {
    const data = readFileSync(PENDING_OAUTH_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function clearPendingOAuth(): void {
  try {
    unlinkSync(PENDING_OAUTH_FILE);
  } catch {
    // Nothing pending.
  }
}

export function getBaseUrl(config: Config): string {
  if (!config.companyDomain) {
    throw new Error('Not logged in. Run: bamboohr login');
  }
  return `https://api.bamboohr.com/api/gateway.php/${config.companyDomain}/v1`;
}
