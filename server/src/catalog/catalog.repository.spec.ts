import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { CatalogRepository } from './catalog.repository';
import { Movie, Series, XtreamAccount } from '../types/catalog.types';

const ACCOUNT: XtreamAccount = {
  host: 'http://p',
  username: 'u',
  password: 'p',
};

function movie(id: string, group = 'Action'): Movie {
  return {
    id,
    name: `Movie ${id}`,
    url: `http://p/${id}.mkv`,
    ext: 'mkv',
    group,
  };
}
function series(id: string): Series {
  return { id, name: `Series ${id}`, group: 'Drama' };
}

describe('CatalogRepository lookups', () => {
  let repo: CatalogRepository;
  let dir: string;

  beforeEach(async () => {
    // `replace` persists, so the repository needs somewhere real to write.
    dir = await mkdtemp(join(tmpdir(), 'catalog-repo-'));
    process.env.VOD_PATH = join(dir, 'vod.json');
    repo = new CatalogRepository();
    await repo.onModuleInit();
  });

  afterEach(async () => {
    delete process.env.VOD_PATH;
    await rm(dir, { recursive: true, force: true });
  });

  it('finds nothing before a catalogue is loaded', () => {
    expect(repo.findMovie('1')).toBeUndefined();
    expect(repo.findSeries('1')).toBeUndefined();
  });

  it('finds entries by id after replace', async () => {
    await repo.replace([movie('1'), movie('2')], [series('9')], ACCOUNT);
    expect(repo.findMovie('2')?.name).toBe('Movie 2');
    expect(repo.findSeries('9')?.name).toBe('Series 9');
    expect(repo.findMovie('nope')).toBeUndefined();
  });

  it('forgets entries that a later import dropped', async () => {
    await repo.replace([movie('1'), movie('2')], [series('9')], ACCOUNT);
    await repo.replace([movie('2')], [], ACCOUNT);
    expect(repo.findMovie('1')).toBeUndefined();
    expect(repo.findMovie('2')).toBeDefined();
    expect(repo.findSeries('9')).toBeUndefined();
  });

  it('resolves by id without scanning the catalogue', async () => {
    // The grouped browse resolves one entry per metadata row, so this must not
    // be O(n): a linear scan over a real 64k catalogue made a single page of
    // the Database screen take ~11s on a Pi-class CPU.
    const many = Array.from({ length: 20_000 }, (_, i) => movie(String(i)));
    await repo.replace(many, [], ACCOUNT);

    const started = Date.now();
    for (let i = 0; i < 20_000; i++) repo.findMovie(String(i));
    // 20k lookups against 20k entries is 400M comparisons when scanning, and
    // milliseconds when indexed.
    expect(Date.now() - started).toBeLessThan(500);
  });
});
