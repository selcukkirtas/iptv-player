import { StreamTicketService } from './stream-ticket.service';

describe('StreamTicketService', () => {
  let service: StreamTicketService;

  beforeEach(() => {
    service = new StreamTicketService();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('authorizes a URL on an origin the manifest came from', () => {
    const id = service.issue(['http://host.tv/live/index.m3u8'], 'u1');
    const result = service.authorize(id, new URL('http://host.tv/live/1.ts'));
    expect(result).toEqual({ ok: true, userId: 'u1' });
  });

  it('records the post-redirect origin as well as the requested one', () => {
    const id = service.issue([
      'http://host.tv/live/index.m3u8',
      'http://cdn.example/live/index.m3u8',
    ]);
    expect(service.authorize(id, new URL('http://cdn.example/1.ts')).ok).toBe(
      true,
    );
  });

  it('refuses a URL on any other origin', () => {
    const id = service.issue(['http://host.tv/live/index.m3u8']);
    expect(service.authorize(id, new URL('http://evil.example/x')).ok).toBe(
      false,
    );
    // The server's own network is just another foreign origin.
    expect(service.authorize(id, new URL('http://127.0.0.1:3000/api')).ok).toBe(
      false,
    );
  });

  it('refuses an unknown ticket', () => {
    expect(service.authorize('nope', new URL('http://host.tv/1.ts')).ok).toBe(
      false,
    );
  });

  it('distinguishes origin by scheme and port', () => {
    const id = service.issue(['http://host.tv:8080/index.m3u8']);
    expect(service.authorize(id, new URL('http://host.tv:8080/1.ts')).ok).toBe(
      true,
    );
    expect(service.authorize(id, new URL('https://host.tv:8080/1.ts')).ok).toBe(
      false,
    );
    expect(service.authorize(id, new URL('http://host.tv:9090/1.ts')).ok).toBe(
      false,
    );
  });

  it('extend widens a ticket onto a redirect target', () => {
    const id = service.issue(['http://host.tv/index.m3u8']);
    expect(service.authorize(id, new URL('http://cdn2.example/1.ts')).ok).toBe(
      false,
    );
    service.extend(id, 'http://cdn2.example/nested.m3u8');
    expect(service.authorize(id, new URL('http://cdn2.example/1.ts')).ok).toBe(
      true,
    );
  });

  it('issues unguessable, distinct ids', () => {
    const ids = new Set(
      Array.from({ length: 50 }, () => service.issue(['http://host.tv/a'])),
    );
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id.length).toBeGreaterThanOrEqual(32);
  });
});
