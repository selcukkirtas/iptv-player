import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { readJson, writeJsonAtomic } from '../common/json-file';
import { hashSecret } from '../common/secret-hash';
import { User } from './users.types';

/**
 * Shape of a profile written by an older version: PINs were stored in the
 * clear, and administration was a flag on a profile rather than its own door.
 */
type LegacyUser = User & { pin?: string; admin?: boolean };

/**
 * Persists viewer profiles to a JSON file. Reads come from an in-memory cache
 * hydrated on startup; writes are serialized and atomic — same pattern as
 * `FavoritesRepository`.
 */
@Injectable()
export class UsersRepository implements OnModuleInit {
  private users: User[] = [];
  private writeChain: Promise<void> = Promise.resolve();

  private get filePath(): string {
    return process.env.USERS_PATH ?? join(process.cwd(), 'data', 'users.json');
  }

  async onModuleInit(): Promise<void> {
    const stored = await readJson<LegacyUser[]>(this.filePath, []);
    // Seed an unrestricted admin "Default" profile so the app works out of the
    // box; restricted profiles are added later from the management screen.
    if (stored.length === 0) {
      this.users = [
        {
          id: randomUUID(),
          name: 'Default',
          color: '#4f8cff',
          allowed: { channels: null, movies: null, series: null },
          createdAt: new Date().toISOString(),
        },
      ];
      await this.persist();
      return;
    }

    const { users, changed } = await migrate(stored);
    this.users = users;
    if (changed) await this.persist();
  }

  findAll(): User[] {
    return this.users;
  }

  findById(id: string): User | undefined {
    return this.users.find((u) => u.id === id);
  }

  async add(user: User): Promise<void> {
    this.users = [...this.users, user];
    await this.persist();
  }

  /** Applies a partial update and returns the new record, or undefined. */
  async update(id: string, patch: Partial<User>): Promise<User | undefined> {
    const existing = this.findById(id);
    if (!existing) return undefined;
    const next = { ...existing, ...patch, id: existing.id };
    this.users = this.users.map((u) => (u.id === id ? next : u));
    await this.persist();
    return next;
  }

  /** Returns true if a user was removed. */
  async remove(id: string): Promise<boolean> {
    const next = this.users.filter((u) => u.id !== id);
    if (next.length === this.users.length) return false;
    this.users = next;
    await this.persist();
    return true;
  }

  private persist(): Promise<void> {
    this.writeChain = this.writeChain.then(() =>
      writeJsonAtomic(this.filePath, this.users),
    );
    return this.writeChain;
  }
}

/**
 * Brings a stored profile list up to the current shape:
 *   - a clear-text `pin` from an older version is hashed and dropped,
 *   - the old per-profile `admin` flag is dropped; administration now lives
 *     behind its own password at /admin, so leaving the flag on a profile
 *     would grant rights the rest of the app no longer reads.
 */
async function migrate(
  stored: LegacyUser[],
): Promise<{ users: User[]; changed: boolean }> {
  let changed = false;
  const users: User[] = [];

  for (const entry of stored) {
    const { pin, admin, ...user } = entry;
    if (pin) {
      user.pinHash = await hashSecret(pin);
      changed = true;
    }
    if (admin !== undefined) changed = true;
    users.push(user);
  }

  return { users, changed };
}
