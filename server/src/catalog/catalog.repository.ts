import { Injectable, OnModuleInit } from '@nestjs/common';
import { join } from 'path';
import { readJson, writeJsonAtomic } from '../common/json-file';
import { Movie, Series, XtreamAccount } from '../types/catalog.types';

interface CatalogStore {
  movies: Movie[];
  series: Series[];
  /** Persisted so series episodes can be fetched on demand after a restart. */
  account?: XtreamAccount;
}

const EMPTY: CatalogStore = { movies: [], series: [] };

/**
 * Persists the VOD catalog (movies + series metadata) and the Xtream account.
 * Reads come from an in-memory cache hydrated on startup; writes are serialized
 * and atomic.
 */
@Injectable()
export class CatalogRepository implements OnModuleInit {
  private store: CatalogStore = EMPTY;
  /**
   * Id → entry lookups, rebuilt whenever the catalogue is replaced.
   *
   * A provider catalogue runs to tens of thousands of titles, and the grouped
   * browse resolves one entry per metadata row — scanning the array each time
   * turned a single page of the Database screen into billions of comparisons
   * (~11s on a Raspberry Pi-class CPU).
   */
  private movieIndex = new Map<string, Movie>();
  private seriesIndex = new Map<string, Series>();
  private writeChain: Promise<void> = Promise.resolve();

  private get filePath(): string {
    return process.env.VOD_PATH ?? join(process.cwd(), 'data', 'vod.json');
  }

  async onModuleInit(): Promise<void> {
    this.store = await readJson<CatalogStore>(this.filePath, EMPTY);
    this.reindex();
  }

  movies(): Movie[] {
    return this.store.movies;
  }

  series(): Series[] {
    return this.store.series;
  }

  findMovie(id: string): Movie | undefined {
    return this.movieIndex.get(id);
  }

  findSeries(id: string): Series | undefined {
    return this.seriesIndex.get(id);
  }

  account(): XtreamAccount | undefined {
    return this.store.account;
  }

  movieGroups(): string[] {
    return this.distinctGroups(this.store.movies);
  }

  seriesGroups(): string[] {
    return this.distinctGroups(this.store.series);
  }

  async replace(
    movies: Movie[],
    series: Series[],
    account: XtreamAccount,
  ): Promise<void> {
    this.store = { movies, series, account };
    this.reindex();
    await this.persist();
  }

  private reindex(): void {
    this.movieIndex = new Map(this.store.movies.map((m) => [m.id, m]));
    this.seriesIndex = new Map(this.store.series.map((s) => [s.id, s]));
  }

  private distinctGroups(items: { group?: string }[]): string[] {
    const set = new Set<string>();
    for (const item of items) {
      if (item.group) set.add(item.group);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  private persist(): Promise<void> {
    this.writeChain = this.writeChain.then(() =>
      writeJsonAtomic(this.filePath, this.store),
    );
    return this.writeChain;
  }
}
