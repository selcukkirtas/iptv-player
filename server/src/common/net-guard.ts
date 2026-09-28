import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * Blocks outbound requests aimed at the host's own network. The stream proxy
 * fetches URLs on behalf of LAN clients, so without this any viewer could point
 * it at the router's admin panel, another machine on the LAN, or the server's
 * own API (SSRF). Set ALLOW_PRIVATE_UPSTREAM=true only when the IPTV provider
 * really is a box on the same LAN.
 */
const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE_UPSTREAM === 'true';

/** Verdict cache — segment requests hit the same host every few seconds. */
const TTL_MS = 60_000;
const cache = new Map<string, { private: boolean; at: number }>();

function v4IsPrivate(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function v6IsPrivate(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (s === '::1' || s === '::') return true;
  if (s.startsWith('fe80')) return true; // link-local
  if (/^f[cd]/.test(s)) return true; // unique-local fc00::/7
  // IPv4-mapped (::ffff:10.0.0.1) — judge the embedded v4 address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (mapped) return v4IsPrivate(mapped[1]);
  return false;
}

/** Whether a literal IP address belongs to a private/loopback/link-local range. */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return v4IsPrivate(ip);
  if (version === 6) return v6IsPrivate(ip);
  return false;
}

/**
 * Resolves a hostname and reports whether it lands on a private address. A
 * hostname is checked through DNS rather than by name so that a public name
 * pointed at 127.0.0.1 (DNS rebinding) is caught too.
 */
export async function resolvesToPrivate(hostname: string): Promise<boolean> {
  if (isIP(hostname)) return isPrivateAddress(hostname);

  const hit = cache.get(hostname);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.private;

  let verdict = true; // fail closed: an unresolvable host is not proxied
  try {
    const addresses = await lookup(hostname, { all: true });
    verdict = addresses.some((a) => isPrivateAddress(a.address));
  } catch {
    verdict = true;
  }
  cache.set(hostname, { private: verdict, at: Date.now() });
  return verdict;
}

/** Throws-free check used before every upstream fetch. */
export async function isUpstreamAllowed(url: URL): Promise<boolean> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (ALLOW_PRIVATE) return true;
  return !(await resolvesToPrivate(url.hostname));
}
