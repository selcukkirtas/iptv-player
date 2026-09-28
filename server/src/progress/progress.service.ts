import { Injectable } from '@nestjs/common';
import { SaveProgressDto } from './dto/save-progress.dto';
import { ProgressRepository } from './progress.repository';
import { ProgressItem } from './progress.types';

/** Below this fraction watched, an item is "in progress"; above it, finished. */
const FINISHED_RATIO = 0.95;
/** Ignore the first few seconds so an accidental open doesn't create an entry. */
const MIN_POSITION = 10;

@Injectable()
export class ProgressService {
  constructor(private readonly repo: ProgressRepository) {}

  /** Continue-watching list: unfinished, most-recent first. */
  list(userId?: string): ProgressItem[] {
    return this.repo
      .findAll(userId)
      .filter((i) => this.isResumable(i))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async save(
    dto: SaveProgressDto,
    userId?: string,
  ): Promise<ProgressItem | null> {
    // Finished (or basically finished) → drop it from continue-watching.
    if (dto.duration > 0 && dto.position / dto.duration >= FINISHED_RATIO) {
      await this.repo.remove(dto.kind, dto.id, userId);
      return null;
    }
    if (dto.position < MIN_POSITION) {
      return null;
    }
    const item: ProgressItem = {
      ...dto,
      userId,
      updatedAt: new Date().toISOString(),
    };
    await this.repo.upsert(item);
    return item;
  }

  async remove(kind: string, id: string, userId?: string): Promise<void> {
    await this.repo.remove(kind, id, userId);
  }

  private isResumable(i: ProgressItem): boolean {
    return (
      i.position >= MIN_POSITION &&
      i.duration > 0 &&
      i.position / i.duration < FINISHED_RATIO
    );
  }
}
