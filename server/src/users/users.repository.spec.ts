import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { UsersRepository } from './users.repository';

async function makeTempFile(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'iptv-users-'));
  return join(dir, name);
}

describe('UsersRepository', () => {
  const originalPath = process.env.USERS_PATH;

  afterEach(() => {
    if (originalPath === undefined) delete process.env.USERS_PATH;
    else process.env.USERS_PATH = originalPath;
  });

  it('seeds a default profile when no users file exists', async () => {
    const path = await makeTempFile('users.json');
    process.env.USERS_PATH = path;

    const repo = new UsersRepository();
    await repo.onModuleInit();

    expect(repo.findAll()).toHaveLength(1);
    expect(repo.findAll()[0].name).toBe('Default');

    const file = JSON.parse(await readFile(path, 'utf-8')) as Array<{
      name: string;
    }>;
    expect(file).toHaveLength(1);
    expect(file[0].name).toBe('Default');

    await rm(dirname(path), { recursive: true, force: true });
  });

  it('preserves existing users and supports add/update/remove', async () => {
    const path = await makeTempFile('users.json');
    process.env.USERS_PATH = path;

    await writeFile(
      path,
      JSON.stringify(
        [
          {
            id: 'existing',
            name: 'Existing',
            allowed: { channels: null, movies: null, series: null },
            createdAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        null,
        2,
      ),
      'utf-8',
    );

    const repo = new UsersRepository();
    await repo.onModuleInit();

    expect(repo.findAll()).toHaveLength(1);
    expect(repo.findById('existing')?.name).toBe('Existing');

    await repo.add({
      id: 'new',
      name: 'New',
      allowed: { channels: null, movies: null, series: null },
      createdAt: '2024-01-02T00:00:00.000Z',
    });
    expect(repo.findAll()).toHaveLength(2);

    const updated = await repo.update('new', { name: 'Updated' });
    expect(updated?.name).toBe('Updated');

    await expect(repo.update('missing', { name: 'Nope' })).resolves.toBe(
      undefined,
    );

    expect(await repo.remove('new')).toBe(true);
    expect(await repo.remove('missing')).toBe(false);
    expect(repo.findById('new')).toBeUndefined();

    await rm(dirname(path), { recursive: true, force: true });
  });
});
