/**
 * Per-profile lockout for PIN attempts.
 *
 * A 4-digit PIN is only 10,000 possibilities; at LAN speed an unthrottled
 * endpoint falls in under a minute. After a handful of misses the profile stops
 * accepting attempts for a while, doubling each time, which turns that minute
 * into days without ever inconveniencing someone who fat-fingers a digit.
 */
const FREE_ATTEMPTS = 5;
const BASE_LOCK_MS = 30_000;
const MAX_LOCK_MS = 15 * 60_000;
/** A quiet spell clears the record, so yesterday's typos don't add up. */
const RESET_AFTER_MS = 30 * 60_000;

interface Attempts {
  failures: number;
  lockedUntil: number;
  lastFailure: number;
}

export class LoginThrottle {
  private readonly byUser = new Map<string, Attempts>();

  /** Milliseconds the caller must wait, or 0 when an attempt is allowed now. */
  retryAfterMs(userId: string, now = Date.now()): number {
    const entry = this.byUser.get(userId);
    if (!entry) return 0;
    if (now - entry.lastFailure > RESET_AFTER_MS) {
      this.byUser.delete(userId);
      return 0;
    }
    return Math.max(0, entry.lockedUntil - now);
  }

  recordFailure(userId: string, now = Date.now()): void {
    const entry = this.byUser.get(userId) ?? {
      failures: 0,
      lockedUntil: 0,
      lastFailure: 0,
    };
    if (now - entry.lastFailure > RESET_AFTER_MS) entry.failures = 0;

    entry.failures += 1;
    entry.lastFailure = now;
    if (entry.failures > FREE_ATTEMPTS) {
      const over = entry.failures - FREE_ATTEMPTS - 1;
      const wait = Math.min(BASE_LOCK_MS * 2 ** over, MAX_LOCK_MS);
      entry.lockedUntil = now + wait;
    }
    this.byUser.set(userId, entry);
  }

  recordSuccess(userId: string): void {
    this.byUser.delete(userId);
  }
}
