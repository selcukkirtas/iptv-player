import { Injectable, OnModuleInit } from '@nestjs/common';
import { join } from 'path';
import { readJson, writeJsonAtomic } from '../common/json-file';
import { ProgressItem } from './progress.types';

/**
 * Persists "continue watching" progress to a JSON file. Reads come from an
 * in-memory cache hydrated on startup; writes are serialized and atomic.
 */
@Injectable()
export class ProgressRepository implements OnModuleInit {
  private items: ProgressItem[] = [];
  private writeChain: Promise<void> = Promise.resolve();

  private get filePath(): string {
    return (
      process.env.PROGRESS_PATH ?? join(process.cwd(), 'data', 'progress.json')
    );
  }

  async onModuleInit(): Promise<void> {
    this.items = await readJson<ProgressItem[]>(this.filePath, []);
  }

  findAll(userId?: string): ProgressItem[] {
    return this.items.filter((i) => i.userId === userId);
  }

  async upsert(item: ProgressItem): Promise<void> {
    const rest = this.items.filter(
      (i) =>
        !(i.userId === item.userId && i.kind === item.kind && i.id === item.id),
    );
    this.items = [item, ...rest];
    await this.persist();
  }

  /** Returns true if an item was removed. */
  async remove(kind: string, id: string, userId?: string): Promise<boolean> {
    const next = this.items.filter(
      (i) => !(i.userId === userId && i.kind === kind && i.id === id),
    );
    if (next.length === this.items.length) return false;
    this.items = next;
    await this.persist();
    return true;
  }

  private persist(): Promise<void> {
    this.writeChain = this.writeChain.then(() =>
      writeJsonAtomic(this.filePath, this.items),
    );
    return this.writeChain;
  }
}
