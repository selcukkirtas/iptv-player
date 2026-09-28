import { Request, Response } from 'express';

/**
 * Minimal cookie read/write. The session token is a 256-bit random value looked
 * up server-side, so it needs no signing — which is the whole reason this is a
 * dozen lines instead of a dependency (one less native-free package to install
 * on a small home server).
 */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export interface CookieOptions {
  maxAgeSeconds?: number;
  /** Send only over HTTPS. Off by default: a home LAN typically serves plain HTTP. */
  secure?: boolean;
}

export function setCookie(
  res: Response,
  name: string,
  value: string,
  opts: CookieOptions = {},
): void {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly', // script on the page must never be able to read the session
    'SameSite=Lax',
  ];
  if (opts.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${Math.floor(opts.maxAgeSeconds)}`);
  }
  if (opts.secure) parts.push('Secure');
  appendSetCookie(res, parts.join('; '));
}

export function clearCookie(res: Response, name: string): void {
  appendSetCookie(res, `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function appendSetCookie(res: Response, value: string): void {
  const existing = res.getHeader('Set-Cookie');
  if (existing === undefined) {
    res.setHeader('Set-Cookie', value);
  } else if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, value]);
  } else {
    res.setHeader('Set-Cookie', [String(existing), value]);
  }
}
