import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

/**
 * Sandboxed environments (Claude Cowork, Claude Code on the web, CI) route
 * egress through an HTTP proxy declared in HTTPS_PROXY/HTTP_PROXY. Node's
 * built-in fetch ignores those variables, so requests fail even to allowed
 * domains unless a proxy-aware dispatcher is installed. setGlobalDispatcher
 * uses a registered global symbol, so this applies to built-in fetch too.
 */
export function configureProxyFromEnv(): void {
  const proxy =
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy;
  if (proxy) {
    setGlobalDispatcher(new EnvHttpProxyAgent());
  }
}
