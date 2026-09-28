import { LoginThrottle } from './login-throttle';

describe('LoginThrottle', () => {
  const NOW = 1_700_000_000_000;

  it('allows the first attempts without delay', () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 5; i++) {
      expect(t.retryAfterMs('u1', NOW)).toBe(0);
      t.recordFailure('u1', NOW);
    }
    expect(t.retryAfterMs('u1', NOW)).toBe(0);
  });

  it('locks out after too many failures', () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 6; i++) t.recordFailure('u1', NOW);
    expect(t.retryAfterMs('u1', NOW)).toBeGreaterThan(0);
  });

  it('doubles the wait on each further failure, up to a ceiling', () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 6; i++) t.recordFailure('u1', NOW);
    const first = t.retryAfterMs('u1', NOW);
    t.recordFailure('u1', NOW);
    const second = t.retryAfterMs('u1', NOW);
    expect(second).toBe(first * 2);

    for (let i = 0; i < 20; i++) t.recordFailure('u1', NOW);
    expect(t.retryAfterMs('u1', NOW)).toBeLessThanOrEqual(15 * 60_000);
  });

  it('lets the attempt through once the lock elapses', () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 6; i++) t.recordFailure('u1', NOW);
    const wait = t.retryAfterMs('u1', NOW);
    expect(t.retryAfterMs('u1', NOW + wait)).toBe(0);
  });

  it('a success clears the record', () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 6; i++) t.recordFailure('u1', NOW);
    t.recordSuccess('u1');
    expect(t.retryAfterMs('u1', NOW)).toBe(0);
  });

  it('forgets stale failures after a quiet spell', () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 6; i++) t.recordFailure('u1', NOW);
    expect(t.retryAfterMs('u1', NOW + 31 * 60_000)).toBe(0);
  });

  it('throttles each profile separately', () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 6; i++) t.recordFailure('u1', NOW);
    expect(t.retryAfterMs('u2', NOW)).toBe(0);
  });
});
