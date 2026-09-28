import { HttpException, UnauthorizedException } from '@nestjs/common';
import { SessionRecord, SessionRepository } from '../auth/session.repository';
import { AdminRepository } from './admin.repository';
import { AdminService } from './admin.service';

function makeAdmin() {
  let store: SessionRecord[] = [];
  let hash: string | undefined;

  const sessions: Partial<SessionRepository> = {
    find: (h) => store.find((s) => s.tokenHash === h),
    add: async (s) => {
      store = [...store, s];
    },
    touch: (h, at) => {
      const s = store.find((x) => x.tokenHash === h);
      if (s) s.lastSeen = at;
    },
    remove: async (h) => {
      store = store.filter((s) => s.tokenHash !== h);
    },
    removeAdminSessions: async () => {
      store = store.filter((s) => s.kind !== 'admin');
    },
  };
  const repo: Partial<AdminRepository> = {
    isConfigured: () => Boolean(hash),
    passwordHash: () => hash,
    setPassword: async (h) => {
      hash = h;
    },
  };
  return {
    admin: new AdminService(
      repo as AdminRepository,
      sessions as SessionRepository,
    ),
    store: () => store,
  };
}

describe('AdminService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('starts unconfigured, so /admin can offer setup', () => {
    const { admin } = makeAdmin();
    expect(admin.isConfigured()).toBe(false);
  });

  it('setup chooses the password and signs straight in', async () => {
    const { admin } = makeAdmin();
    const token = await admin.setup('kor4kt3r!');
    expect(admin.isConfigured()).toBe(true);
    await expect(admin.resolve(token)).resolves.toBe(true);
  });

  it('setup cannot be replayed to seize an existing installation', async () => {
    const { admin } = makeAdmin();
    await admin.setup('kor4kt3r!');
    await expect(admin.setup('attacker-chosen')).rejects.toThrow(HttpException);
  });

  it('logs in with the right password and refuses the wrong one', async () => {
    const { admin } = makeAdmin();
    await admin.setup('kor4kt3r!');
    await expect(admin.login('kor4kt3r!')).resolves.toEqual(expect.any(String));
    await expect(admin.login('guesswork')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuses every login while no password is configured', async () => {
    const { admin } = makeAdmin();
    await expect(admin.login('')).rejects.toThrow(UnauthorizedException);
    await expect(admin.login('anything')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('stores the password hashed, never in the clear', async () => {
    const { admin, store } = makeAdmin();
    await admin.setup('kor4kt3r!');
    expect(JSON.stringify(store())).not.toContain('kor4kt3r!');
  });

  it('marks its sessions as admin, with no profile attached', async () => {
    const { admin, store } = makeAdmin();
    await admin.setup('kor4kt3r!');
    expect(store()[0].kind).toBe('admin');
    expect(store()[0].userId).toBeUndefined();
  });

  it('does not accept an unknown or logged-out token', async () => {
    const { admin } = makeAdmin();
    const token = await admin.setup('kor4kt3r!');
    await expect(admin.resolve('made-up')).resolves.toBe(false);
    await expect(admin.resolve(undefined)).resolves.toBe(false);
    await admin.logout(token);
    await expect(admin.resolve(token)).resolves.toBe(false);
  });

  it('does not accept a viewer session as administrator', async () => {
    const { admin, store } = makeAdmin();
    const token = await admin.setup('kor4kt3r!');
    store()[0].kind = 'user';
    await expect(admin.resolve(token)).resolves.toBe(false);
  });

  it('throttles repeated password guesses', async () => {
    const { admin } = makeAdmin();
    await admin.setup('kor4kt3r!');
    for (let i = 0; i < 6; i++) {
      await expect(admin.login('nope')).rejects.toThrow();
    }
    const err = await admin.login('kor4kt3r!').catch((e: unknown) => e);
    expect((err as HttpException).getStatus()).toBe(429);
  });

  it('changing the password signs every console out', async () => {
    const { admin, store } = makeAdmin();
    const token = await admin.setup('kor4kt3r!');
    await admin.changePassword('kor4kt3r!', 'y3n1-p4rol4');
    expect(store()).toHaveLength(0);
    await expect(admin.resolve(token)).resolves.toBe(false);
    await expect(admin.login('y3n1-p4rol4')).resolves.toEqual(
      expect.any(String),
    );
  });

  it('refuses a password change that cannot prove the current one', async () => {
    const { admin } = makeAdmin();
    await admin.setup('kor4kt3r!');
    await expect(admin.changePassword('wrong', 'y3n1-p4rol4')).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(admin.login('kor4kt3r!')).resolves.toEqual(expect.any(String));
  });

  it('expires a console left idle too long', async () => {
    const { admin } = makeAdmin();
    const token = await admin.setup('kor4kt3r!');
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 13 * 3_600_000);
    await expect(admin.resolve(token)).resolves.toBe(false);
  });
});
