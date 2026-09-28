import { Request, Response } from 'express';
import { clearCookie, readCookie, setCookie } from './cookies';

function reqWith(cookie?: string): Request {
  return { headers: cookie === undefined ? {} : { cookie } } as Request;
}

function fakeRes() {
  const headers: Record<string, string | string[]> = {};
  const res = {
    getHeader: (n: string) => headers[n],
    setHeader: (n: string, v: string | string[]) => {
      headers[n] = v;
    },
  } as unknown as Response;
  return {
    res,
    cookies: () => {
      const v = headers['Set-Cookie'];
      return v === undefined ? [] : Array.isArray(v) ? v : [v];
    },
  };
}

describe('readCookie', () => {
  it('reads a named cookie out of the header', () => {
    expect(readCookie(reqWith('a=1; iptv_sid=tok3n; b=2'), 'iptv_sid')).toBe(
      'tok3n',
    );
  });

  it('decodes percent-encoded values', () => {
    expect(readCookie(reqWith('iptv_sid=a%2Fb'), 'iptv_sid')).toBe('a/b');
  });

  it('returns undefined when absent or headerless', () => {
    expect(readCookie(reqWith('other=1'), 'iptv_sid')).toBeUndefined();
    expect(readCookie(reqWith(), 'iptv_sid')).toBeUndefined();
  });

  it('does not match a cookie whose name merely ends with the one asked for', () => {
    expect(readCookie(reqWith('xiptv_sid=nope'), 'iptv_sid')).toBeUndefined();
  });
});

describe('setCookie', () => {
  it('marks the session HttpOnly and SameSite=Lax', () => {
    const { res, cookies } = fakeRes();
    setCookie(res, 'iptv_sid', 'tok', { maxAgeSeconds: 60 });
    const [cookie] = cookies();
    expect(cookie).toContain('iptv_sid=tok');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=60');
    expect(cookie).not.toContain('Secure');
  });

  it('adds Secure only when asked', () => {
    const { res, cookies } = fakeRes();
    setCookie(res, 'iptv_sid', 'tok', { secure: true });
    expect(cookies()[0]).toContain('Secure');
  });

  it('keeps earlier Set-Cookie headers', () => {
    const { res, cookies } = fakeRes();
    setCookie(res, 'a', '1');
    setCookie(res, 'b', '2');
    expect(cookies()).toHaveLength(2);
  });

  it('clearCookie expires the value immediately', () => {
    const { res, cookies } = fakeRes();
    clearCookie(res, 'iptv_sid');
    expect(cookies()[0]).toContain('Max-Age=0');
  });
});
