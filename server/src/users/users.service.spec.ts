import { hashSecret } from '../common/secret-hash';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { User } from './users.types';

const USERS: User[] = [
  {
    id: 'admin',
    name: 'Parent',
    allowed: { channels: null, movies: null, series: null },
    createdAt: '2020-01-01T00:00:00.000Z',
  },
  {
    id: 'kid',
    name: 'Kid',
    allowed: { channels: ['News'], movies: ['Kids'], series: [] },
    createdAt: '2020-01-01T00:00:00.000Z',
  },
  {
    id: 'kids-open',
    name: 'Junior',
    kids: true,
    allowed: { channels: null, movies: null, series: null },
    createdAt: '2020-01-01T00:00:00.000Z',
  },
  {
    id: 'locked',
    name: 'Locked',
    // Filled in by beforeAll — hashing is async.
    pinHash: undefined,
    allowed: { channels: null, movies: null, series: null },
    createdAt: '2020-01-01T00:00:00.000Z',
  },
];

beforeAll(async () => {
  USERS[3].pinHash = await hashSecret('4321');
});

function makeService(users = USERS): UsersService {
  const repo: Partial<UsersRepository> = {
    findAll: () => users,
    findById: (id) => users.find((u) => u.id === id),
  };
  return new UsersService(repo as UsersRepository);
}

describe('UsersService access control', () => {
  it('treats a missing user id as unrestricted (internal/admin listings)', () => {
    const service = makeService();
    expect(service.isAllowed(undefined, 'channels', 'Anything')).toBe(true);
  });

  it('shows nothing to an id that names no profile', () => {
    const service = makeService();
    expect(service.isAllowed('ghost', 'channels', 'Anything')).toBe(false);
    expect(service.filterGroups('ghost', 'channels', ['News'])).toEqual([]);
  });

  it('filterGroups keeps only allowed categories, passes all when unrestricted', () => {
    const service = makeService();
    expect(
      service.filterGroups('kid', 'channels', ['News', 'Sports', 'Movies']),
    ).toEqual(['News']);
    expect(
      service.filterGroups('admin', 'channels', ['News', 'Sports']),
    ).toEqual(['News', 'Sports']);
  });

  it('isAllowed enforces per-section membership', () => {
    const service = makeService();
    expect(service.isAllowed('kid', 'channels', 'News')).toBe(true);
    expect(service.isAllowed('kid', 'channels', 'Sports')).toBe(false);
    // An empty allowlist permits nothing.
    expect(service.isAllowed('kid', 'series', 'Anything')).toBe(false);
    // Unrestricted permits everything, including undefined groups.
    expect(service.isAllowed('admin', 'movies', undefined)).toBe(true);
  });

  it('verifyPin: passes when no PIN, enforces the PIN otherwise', async () => {
    const service = makeService();
    // No PIN set → always passes.
    await expect(service.verifyPin('admin', '')).resolves.toBe(true);
    await expect(service.verifyPin('admin', 'whatever')).resolves.toBe(true);
    // PIN set → only the exact value passes.
    await expect(service.verifyPin('locked', '4321')).resolves.toBe(true);
    await expect(service.verifyPin('locked', '0000')).resolves.toBe(false);
  });

  it('a kids profile hides adult categories even when unrestricted', () => {
    const service = makeService();
    expect(service.isAllowed('kids-open', 'movies', 'Comedy')).toBe(true);
    expect(service.isAllowed('kids-open', 'movies', 'FOR ADULTS ➾ 4K')).toBe(
      false,
    );
    expect(
      service.filterGroups('kids-open', 'channels', [
        'Cartoons',
        'FOR ADULTS',
        'XXX',
      ]),
    ).toEqual(['Cartoons']);
  });
});

describe('UsersService CRUD', () => {
  it('creates a user with normalized allowed groups and a generated id', async () => {
    const added: User[] = [];
    const repo: Partial<UsersRepository> = {
      add: async (u) => {
        added.push(u);
      },
    };
    const service = new UsersService(repo as UsersRepository);

    const user = await service.create({
      name: 'New',
      allowed: { movies: ['A'] },
    });

    expect(user.id).toBeTruthy();
    expect(user.name).toBe('New');
    expect(user.allowed).toEqual({
      channels: null,
      movies: ['A'],
      series: null,
    });
    expect(added).toHaveLength(1);
  });

  it('verifyPin refuses a suspended profile even with the right PIN', async () => {
    const suspended: User = {
      id: 'suspended',
      name: 'Suspended',
      disabled: true,
      pinHash: USERS[3].pinHash,
      allowed: { channels: null, movies: null, series: null },
      createdAt: '2020-01-01T00:00:00.000Z',
    };
    const service = makeService([...USERS, suspended]);
    await expect(service.verifyPin('suspended', '4321')).resolves.toBe(false);
  });

  it('a suspended profile sees no categories', () => {
    const suspended: User = {
      id: 'suspended',
      name: 'Suspended',
      disabled: true,
      allowed: { channels: null, movies: null, series: null },
      createdAt: '2020-01-01T00:00:00.000Z',
    };
    const service = makeService([...USERS, suspended]);
    // Unrestricted `allowed`, but suspension overrides it.
    expect(service.isAllowed('suspended', 'channels', 'News')).toBe(false);
    expect(service.filterGroups('suspended', 'movies', ['Action'])).toEqual([]);
  });

  it('hideAdult hides age-restricted categories without the kids flag', () => {
    const grownUp: User = {
      id: 'grown',
      name: 'Grown up',
      hideAdult: true,
      allowed: { channels: null, movies: null, series: null },
      createdAt: '2020-01-01T00:00:00.000Z',
    };
    const service = makeService([...USERS, grownUp]);
    expect(service.isAllowed('grown', 'movies', 'FOR ADULTS')).toBe(false);
    expect(service.isAllowed('grown', 'movies', 'Aksiyon')).toBe(true);
    // And an ordinary profile still sees them.
    expect(service.isAllowed('admin', 'movies', 'FOR ADULTS')).toBe(true);
  });
});
