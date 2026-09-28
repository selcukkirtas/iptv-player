import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { UsersService } from '../users/users.service';
import { User } from '../users/users.types';
import { LoginThrottle } from './login-throttle';
import { SessionRepository } from './session.repository';
import { SessionUser } from './auth.types';

/** How long a session survives without being used. */
const IDLE_MS = Number(process.env.SESSION_IDLE_DAYS ?? 30) * 86_400_000;
/** Hard ceiling regardless of activity. */
const MAX_AGE_MS = Number(process.env.SESSION_MAX_DAYS ?? 90) * 86_400_000;
/** `lastSeen` is only flushed to disk this often — one write per request would
 *  hammer an SD card for no benefit. */
const TOUCH_FLUSH_MS = 5 * 60_000;
const SWEEP_MS = 60 * 60_000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Turns "I know this profile's PIN" into a session the server can verify on
 * every later request.
 *
 * The previous design trusted an `X-User-Id` header, which meant a viewer could
 * name any profile — or none, which read as unrestricted. A session cookie the
 * server issues is the thing that makes a kids profile actually hold.
 */
@Injectable()
export class AuthService implements OnModuleDestroy {
  private readonly throttle = new LoginThrottle();
  private readonly sweeper: NodeJS.Timeout;
  private lastFlush = 0;

  constructor(
    private readonly sessions: SessionRepository,
    private readonly users: UsersService,
  ) {
    this.sweeper = setInterval(() => void this.sweep(), SWEEP_MS);
    this.sweeper.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
  }

  /** Verify a profile's PIN and mint a session token for it. */
  async login(userId: string, pin: string): Promise<string> {
    const waitMs = this.throttle.retryAfterMs(userId);
    if (waitMs > 0) {
      throw new HttpException(
        `Too many attempts. Try again in ${Math.ceil(waitMs / 1000)}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Deliberately the same failure for an unknown profile and a wrong PIN, so
    // the endpoint cannot be used to enumerate profiles.
    let ok = false;
    try {
      ok = await this.users.verifyPin(userId, pin);
    } catch {
      ok = false;
    }
    if (!ok) {
      this.throttle.recordFailure(userId);
      throw new UnauthorizedException('Incorrect PIN');
    }
    this.throttle.recordSuccess(userId);

    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    await this.sessions.add({
      tokenHash: hashToken(token),
      kind: 'user',
      userId,
      createdAt: now,
      lastSeen: now,
    });
    return token;
  }

  /** Resolve a token to its profile, or undefined when it is not (or no longer) valid. */
  async resolve(token: string | undefined): Promise<SessionUser | undefined> {
    if (!token) return undefined;
    const tokenHash = hashToken(token);
    const session = this.sessions.find(tokenHash);
    // An administrator cookie is not a viewer session and must not resolve here.
    if (!session || session.kind !== 'user' || !session.userId)
      return undefined;

    const now = Date.now();
    if (
      now - session.lastSeen > IDLE_MS ||
      now - session.createdAt > MAX_AGE_MS
    ) {
      await this.sessions.remove(tokenHash);
      return undefined;
    }

    // The profile may have been deleted — or suspended — while the cookie lived
    // on. Disabling someone has to end the session they already hold, or the
    // television on the sofa keeps working until the cookie expires.
    let user: User;
    try {
      user = this.users.getById(session.userId);
    } catch {
      await this.sessions.remove(tokenHash);
      return undefined;
    }
    if (user.disabled) {
      await this.sessions.removeForUser(user.id);
      return undefined;
    }

    this.sessions.touch(tokenHash, now);
    if (now - this.lastFlush > TOUCH_FLUSH_MS) {
      this.lastFlush = now;
      void this.sessions.flush();
    }

    return { id: user.id, name: user.name };
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.sessions.remove(hashToken(token));
  }

  /** Invalidate every session of a profile — called when it changes or is deleted. */
  revokeUser(userId: string): Promise<void> {
    return this.sessions.removeForUser(userId);
  }

  private sweep(): Promise<void> {
    const now = Date.now();
    return this.sessions.removeExpired(now - IDLE_MS, now - MAX_AGE_MS);
  }
}
