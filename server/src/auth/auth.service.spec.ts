import { HttpException, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { User } from '../users/users.types';
import { AuthService } from './auth.service';
import { SessionRecord, SessionRepository } from './session.repository';

const PARENT: User = {
  id: 'parent',
  name: 'Parent',
  allowed: { channels: null, movies: null, series: null },
  createdAt: '2020-01-01T00:00:00.000Z',
};
const KID: User = {
  id: 'kid',
  name: 'Kid',
  allowed: { channels: ['Cartoons'], movies: null, series: null },
  createdAt: '2020-01-02T00:00:00.000Z',
};

function makeAuth(users: User[] = [PARENT, KID]) {
  let store: SessionRecord[] = [];
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
    removeForUser: async (id) => {
      store = store.filter((s) => s.userId !== id);
    },
    removeExpired: async () => {},
    flush: async () => {},
  };
  // Only the two methods AuthService leans on; PINs are checked by name here.
  const pins: Record<string, string | undefined> = {
    parent: '1234',
    kid: undefined,
  };
  const usersService: Partial<UsersService> = {
    verifyPin: async (id, pin) => {
      const user = users.find((u) => u.id === id);
      if (!user) throw new Error('unknown');
      // Mirrors the real service: a suspended profile accepts no PIN.
      if (user.disabled) return false;
      return pins[id] === undefined || pins[id] === pin;
    },
    getById: (id) => {
      const user = users.find((u) => u.id === id);
      if (!user) throw new Error('unknown');
      return user;
    },
  };
  const auth = new AuthService(
    sessions as SessionRepository,
    usersService as UsersService,
  );
  return { auth, store: () => store };
}

describe('AuthService', () => {
  afterEach(() => jest.useRealTimers());

  it('issues a token for the right PIN and resolves it back to the profile', async () => {
    const { auth } = makeAuth();
    const token = await auth.login('parent', '1234');
    await expect(auth.resolve(token)).resolves.toEqual({
      id: 'parent',
      name: 'Parent',
    });
  });

  it('resolves a PIN-less profile too', async () => {
    const { auth } = makeAuth();
    const token = await auth.login('kid', '');
    await expect(auth.resolve(token)).resolves.toMatchObject({ id: 'kid' });
  });

  it('refuses to resolve an administrator session as a viewer', async () => {
    const { auth, store } = makeAuth();
    const token = await auth.login('parent', '1234');
    // Same store, but minted by the separate /admin door.
    store()[0].kind = 'admin';
    store()[0].userId = undefined;
    await expect(auth.resolve(token)).resolves.toBeUndefined();
  });

  it('rejects a wrong PIN and mints nothing', async () => {
    const { auth, store } = makeAuth();
    await expect(auth.login('parent', '0000')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(store()).toHaveLength(0);
  });

  it('fails an unknown profile exactly like a wrong PIN', async () => {
    const { auth } = makeAuth();
    await expect(auth.login('ghost', '1234')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('issues a distinct, high-entropy token each time', async () => {
    const { auth } = makeAuth();
    const a = await auth.login('parent', '1234');
    const b = await auth.login('parent', '1234');
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });

  it('never stores the raw token', async () => {
    const { auth, store } = makeAuth();
    const token = await auth.login('parent', '1234');
    expect(store()[0].tokenHash).not.toBe(token);
    expect(JSON.stringify(store())).not.toContain(token);
  });

  it('resolves nothing for an absent, unknown or logged-out token', async () => {
    const { auth } = makeAuth();
    await expect(auth.resolve(undefined)).resolves.toBeUndefined();
    await expect(auth.resolve('made-up')).resolves.toBeUndefined();

    const token = await auth.login('parent', '1234');
    await auth.logout(token);
    await expect(auth.resolve(token)).resolves.toBeUndefined();
  });

  it('drops a session whose profile has been deleted', async () => {
    const users = [{ ...PARENT }, { ...KID }];
    const { auth, store } = makeAuth(users);
    const token = await auth.login('kid', '');
    users.splice(1, 1);
    await expect(auth.resolve(token)).resolves.toBeUndefined();
    expect(store()).toHaveLength(0);
  });

  it('revokes every session of one profile', async () => {
    const { auth, store } = makeAuth();
    const a = await auth.login('parent', '1234');
    const b = await auth.login('parent', '1234');
    await auth.revokeUser('parent');
    expect(store()).toHaveLength(0);
    await expect(auth.resolve(a)).resolves.toBeUndefined();
    await expect(auth.resolve(b)).resolves.toBeUndefined();
  });

  it('locks a profile out after repeated wrong PINs', async () => {
    const { auth } = makeAuth();
    for (let i = 0; i < 6; i++) {
      await expect(auth.login('parent', '0000')).rejects.toThrow();
    }
    // Even the correct PIN is refused while the lockout stands.
    const err = await auth.login('parent', '1234').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
  });

  it('expires a session that has gone unused too long', async () => {
    const { auth } = makeAuth();
    const token = await auth.login('parent', '1234');
    const later = Date.now() + 31 * 86_400_000;
    jest.spyOn(Date, 'now').mockReturnValue(later);
    await expect(auth.resolve(token)).resolves.toBeUndefined();
  });
});

describe('AuthService and disabled profiles', () => {
  it('refuses to sign in to a suspended profile', async () => {
    const parent = { ...PARENT, disabled: true };
    const { auth } = makeAuth([parent, KID]);
    await expect(auth.login('parent', '1234')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('drops the session of a profile suspended mid-use', async () => {
    const users = [{ ...PARENT }, { ...KID }];
    const { auth, store } = makeAuth(users);
    const token = await auth.login('kid', '');
    await expect(auth.resolve(token)).resolves.toMatchObject({ id: 'kid' });

    // The administrator suspends them while the television is still on.
    users[1].disabled = true;
    await expect(auth.resolve(token)).resolves.toBeUndefined();
    expect(store()).toHaveLength(0);
  });
});
