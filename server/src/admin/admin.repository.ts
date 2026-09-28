import { Injectable, OnModuleInit } from '@nestjs/common';
import { join } from 'path';
import { readJson, writeJsonAtomic } from '../common/json-file';

interface AdminRecord {
  /** scrypt hash of the administrator password; absent until first setup. */
  passwordHash?: string;
  updatedAt?: string;
}

/**
 * The single administrator credential, kept apart from viewer profiles.
 *
 * Administration is not a profile you watch television as — it is a separate
 * door with its own password, so the household's picker shows only real
 * viewers and nobody can stumble into the management screens.
 */
@Injectable()
export class AdminRepository implements OnModuleInit {
  private record: AdminRecord = {};
  private writeChain: Promise<void> = Promise.resolve();

  private get filePath(): string {
    return process.env.ADMIN_PATH ?? join(process.cwd(), 'data', 'admin.json');
  }

  async onModuleInit(): Promise<void> {
    this.record = await readJson<AdminRecord>(this.filePath, {});
  }

  /** False until someone has chosen a password — the app is then in setup. */
  isConfigured(): boolean {
    return Boolean(this.record.passwordHash);
  }

  passwordHash(): string | undefined {
    return this.record.passwordHash;
  }

  async setPassword(passwordHash: string): Promise<void> {
    this.record = { passwordHash, updatedAt: new Date().toISOString() };
    await this.persist();
  }

  private persist(): Promise<void> {
    this.writeChain = this.writeChain.then(() =>
      writeJsonAtomic(this.filePath, this.record),
    );
    return this.writeChain;
  }
}
