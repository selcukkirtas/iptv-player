import { Injectable, OnModuleInit } from '@nestjs/common';
import { join } from 'path';
import { readJson, writeJsonAtomic } from '../common/json-file';

export interface SessionRecord {
  /** sha256 of the token; the token itself is never written to disk. */
  tokenHash: string;
  /**
   * Which door this session came through. Administrator sessions are minted by
   * the separate /admin password and are never tied to a viewer profile, so a
   * viewer's cookie can never be mistaken for one.
   */
  kind: 'user' | 'admin';
  /** Owning profile — viewer sessions only. */
  userId?: string;
  createdAt: number;
  lastSeen: number;
}

/**
 * Sessions live on disk so a reboot — routine on a home server running off an
 * SD card — does not sign every TV in the house out. Only the token's hash is
 * stored, so the file cannot be replayed as a set of credentials.
 */
@Injectable()
export class SessionRepository implements OnModuleInit {
  private sessions: SessionRecord[] = [];
  private writeChain: Promise<void> = Promise.resolve();

  private get filePath(): string {
    return (
      process.env.SESSIONS_PATH ?? join(process.cwd(), 'data', 'sessions.json')
    );
  }

  async onModuleInit(): Promise<void> {
    this.sessions = await readJson<SessionRecord[]>(this.filePath, []);
  }

  find(tokenHash: string): SessionRecord | undefined {
    return this.sessions.find((s) => s.tokenHash === tokenHash);
  }

  /** Drops every administrator session — used when the password changes. */
  async removeAdminSessions(): Promise<void> {
    const before = this.sessions.length;
    this.sessions = this.sessions.filter((s) => s.kind !== 'admin');
    if (this.sessions.length !== before) await this.persist();
  }

  async add(session: SessionRecord): Promise<void> {
    this.sessions = [...this.sessions, session];
    await this.persist();
  }

  /** Records activity without an immediate disk write (see `flush`). */
  touch(tokenHash: string, at: number): void {
    const session = this.find(tokenHash);
    if (session) session.lastSeen = at;
  }

  async remove(tokenHash: string): Promise<void> {
    this.sessions = this.sessions.filter((s) => s.tokenHash !== tokenHash);
    await this.persist();
  }

  /** Drops every session of one profile — used when it is deleted or locked. */
  async removeForUser(userId: string): Promise<void> {
    const before = this.sessions.length;
    this.sessions = this.sessions.filter((s) => s.userId !== userId);
    if (this.sessions.length !== before) await this.persist();
  }

  async removeExpired(cutoffLastSeen: number, cutoffCreated: number) {
    const before = this.sessions.length;
    this.sessions = this.sessions.filter(
      (s) => s.lastSeen >= cutoffLastSeen && s.createdAt >= cutoffCreated,
    );
    if (this.sessions.length !== before) await this.persist();
  }

  flush(): Promise<void> {
    return this.persist();
  }

  private persist(): Promise<void> {
    this.writeChain = this.writeChain.then(() =>
      writeJsonAtomic(this.filePath, this.sessions),
    );
    return this.writeChain;
  }
}
