import { Command } from 'commander';
import { loginWithApiKey } from '../auth/api-key.js';
import { loginWithOAuth, startManualOAuth, completeManualOAuth } from '../auth/oauth.js';
import { loadConfig, clearConfig } from '../config.js';
import { output } from '../utils/output.js';
import { handleError } from '../utils/errors.js';

function resolveSecret(flagValue: string | undefined, envVar: string, label: string): string {
  const value = flagValue ?? process.env[envVar];
  if (!value) {
    throw new Error(`Missing ${label}. Provide --${label.toLowerCase().replace(/\s+/g, '-')} or set ${envVar}.`);
  }
  return value;
}

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Authenticate with BambooHR using an API key')
    .option('--domain <domain>', 'Your BambooHR company domain (or set BAMBOOHR_DOMAIN)')
    .option('--api-key <key>', 'Your BambooHR API key (or set BAMBOOHR_API_KEY)')
    .action(async (opts) => {
      try {
        const domain = opts.domain ?? process.env.BAMBOOHR_DOMAIN;
        if (!domain) throw new Error('Missing domain. Provide --domain or set BAMBOOHR_DOMAIN.');
        const apiKey = resolveSecret(opts.apiKey, 'BAMBOOHR_API_KEY', 'api key');
        await loginWithApiKey(domain, apiKey);
        output({ status: 'ok', method: 'api-key', domain });
      } catch (err) {
        handleError(err);
      }
    });

  program
    .command('login-oauth')
    .description('Authenticate with BambooHR using OAuth')
    .option('--domain <domain>', 'Your BambooHR company domain (or set BAMBOOHR_DOMAIN)')
    .option('--client-id <id>', 'OAuth application client ID (or set BAMBOOHR_CLIENT_ID)')
    .option('--client-secret <secret>', 'OAuth application client secret (or set BAMBOOHR_CLIENT_SECRET)')
    .action(async (opts) => {
      try {
        const domain = opts.domain ?? process.env.BAMBOOHR_DOMAIN;
        if (!domain) throw new Error('Missing domain. Provide --domain or set BAMBOOHR_DOMAIN.');
        const clientId = resolveSecret(opts.clientId, 'BAMBOOHR_CLIENT_ID', 'client id');
        const clientSecret = resolveSecret(opts.clientSecret, 'BAMBOOHR_CLIENT_SECRET', 'client secret');
        await loginWithOAuth(domain, clientId, clientSecret);
        output({ status: 'ok', method: 'oauth', domain });
      } catch (err) {
        handleError(err);
      }
    });

  program
    .command('login-oauth-start')
    .description('Start OAuth login without a browser (for sandboxed/headless environments like Claude Cowork). Prints the URL to authorize in your own browser.')
    .option('--domain <domain>', 'Your BambooHR company domain (or set BAMBOOHR_DOMAIN)')
    .option('--client-id <id>', 'OAuth application client ID (or set BAMBOOHR_CLIENT_ID)')
    .option('--client-secret <secret>', 'OAuth application client secret (or set BAMBOOHR_CLIENT_SECRET)')
    .action((opts) => {
      try {
        const domain = opts.domain ?? process.env.BAMBOOHR_DOMAIN;
        if (!domain) throw new Error('Missing domain. Provide --domain or set BAMBOOHR_DOMAIN.');
        const clientId = resolveSecret(opts.clientId, 'BAMBOOHR_CLIENT_ID', 'client id');
        const clientSecret = resolveSecret(opts.clientSecret, 'BAMBOOHR_CLIENT_SECRET', 'client secret');
        const { authorizeUrl, redirectUri } = startManualOAuth(domain, clientId, clientSecret);
        output({
          status: 'pending',
          authorize_url: authorizeUrl,
          instructions: [
            'Open authorize_url in a browser and approve access.',
            `The browser will then be redirected to ${redirectUri}, which will fail to load — that is expected.`,
            'Copy the FULL URL from the browser address bar (it contains code=... and state=...).',
            "Finish with: bamboohr login-oauth-complete --redirect-url '<pasted url>'",
            'The pending login expires after 15 minutes.',
          ],
        });
      } catch (err) {
        handleError(err);
      }
    });

  program
    .command('login-oauth-complete')
    .description('Finish an OAuth login started with login-oauth-start by pasting the redirect URL from the browser address bar')
    .option('--redirect-url <url>', 'Full redirect URL copied from the browser address bar (contains code and state)')
    .option('--code <code>', 'Bare authorization code (requires --state)')
    .option('--state <state>', 'State parameter, if passing a bare --code')
    .action(async (opts) => {
      try {
        const input = opts.redirectUrl ?? opts.code;
        if (!input) throw new Error('Missing input. Provide --redirect-url (preferred) or --code with --state.');
        await completeManualOAuth(input, opts.state);
        const config = loadConfig();
        output({ status: 'ok', method: 'oauth', domain: config.companyDomain });
      } catch (err) {
        handleError(err);
      }
    });

  program
    .command('logout')
    .description('Clear stored credentials')
    .action(() => {
      try {
        clearConfig();
        output({ status: 'logged out' });
      } catch (err) {
        handleError(err);
      }
    });

  program
    .command('status')
    .description('Show current authentication status')
    .action(() => {
      try {
        const config = loadConfig();
        if (!config.companyDomain || !config.auth) {
          output({ authenticated: false });
        } else {
          output({
            authenticated: true,
            domain: config.companyDomain,
            method: config.auth.method,
          });
        }
      } catch (err) {
        handleError(err);
      }
    });
}
