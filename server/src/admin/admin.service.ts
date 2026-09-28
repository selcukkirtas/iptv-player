import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { LoginThrottle } from '../auth/login-throttle';
import { SessionRepository } from '../auth/session.repository';
import { hashSecret, verifySecret } from '../common/secret-hash';
import { AdminRepository } from './admin.repository';

/** Administrator sessions are shorter-lived than a viewer's: this is a console. */
const IDLE_MS = Number(process.env.ADMIN_SESSION_IDLE_HOURS ?? 12) * 3_600_000;
const MAX_AGE_MS = Number(process.env.ADMIN_SESSION_MAX_DAYS ?? 7) * 86_400_000;
/** One throttle bucket — there is a single administrator credential. */
const THROTTLE_KEY = 'admin';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * The separate administrator door behind `/admin`.
 *
 * Management is not something a viewer profile can be promoted into: it has its
 * own password and its own cookie, so nobody signed in to watch television can
 * reach the profile editor or the playlist import, whatever they send.
 */
@Injectable()
export class AdminService {
  private readonly throttle = new LoginThrottle();

  constructor(
    private readonly repo: AdminRepository,
    private readonly sessions: SessionRepository,
  ) {}

  /** False until a password has been chosen; `/admin` then offers setup. */
  isConfigured(): boolean {
    return this.repo.isConfigured();
  }

  /** First-run: claim the console by choosing its password. */
  async setup(password: string): Promise<string> {
    if (this.repo.isConfigured()) {
      throw new HttpException(
        'An administrator password is already set',
        HttpStatus.CONFLICT,
      );
    }
    await this.repo.setPassword(await hashSecret(password));
    return this.mintSession();
  }

  async login(password: string): Promise<string> {
    const waitMs = this.throttle.retryAfterMs(THROTTLE_KEY);
    if (waitMs > 0) {
      throw new HttpException(
        `Too many attempts. Try again in ${Math.ceil(waitMs / 1000)}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const stored = this.repo.passwordHash();
    if (!stored || !(await verifySecret(password, stored))) {
      this.throttle.recordFailure(THROTTLE_KEY);
      throw new UnauthorizedException('Incorrect password');
    }
    this.throttle.recordSuccess(THROTTLE_KEY);
    return this.mintSession();
  }

  /** Whether a token names a live administrator session. */
  async resolve(token: string | undefined): Promise<boolean> {
    if (!token) return false;
    const tokenHash = hashToken(token);
    const session = this.sessions.find(tokenHash);
    if (!session || session.kind !== 'admin') return false;

    const now = Date.now();
    if (
      now - session.lastSeen > IDLE_MS ||
      now - session.createdAt > MAX_AGE_MS
    ) {
      await this.sessions.remove(tokenHash);
      return false;
    }
    this.sessions.touch(tokenHash, now);
    return true;
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.sessions.remove(hashToken(token));
  }

  /**
   * Change the password, then drop every administrator session — including the
   * caller's. A password change is how you lock out someone who knew the old
   * one, which only works if their console goes with it.
   */
  async changePassword(current: string, next: string): Promise<void> {
    const stored = this.repo.passwordHash();
    if (!stored || !(await verifySecret(current, stored))) {
      throw new UnauthorizedException('Incorrect password');
    }
    await this.repo.setPassword(await hashSecret(next));
    await this.sessions.removeAdminSessions();
  }

  private async mintSession(): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    await this.sessions.add({
      tokenHash: hashToken(token),
      kind: 'admin',
      createdAt: now,
      lastSeen: now,
    });
    return token;
  }
}
