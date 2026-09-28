import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomBytes } from 'crypto';

/** A ticket dies this long after its last segment request. */
const IDLE_MS = 30 * 60_000;
/** Hard ceiling regardless of activity, so a leaked ticket cannot live forever. */
const MAX_AGE_MS = 12 * 60 * 60_000;
const SWEEP_MS = 60_000;

interface Ticket {
  userId?: string;
  /** Origins the manifest's children may live on (upstream + post-redirect CDN). */
  origins: Set<string>;
  issuedAt: number;
  lastUsed: number;
}

/**
 * Short-lived capability for the sub-resources of one HLS manifest.
 *
 * A manifest's segments and keys must still be proxied, but the browser cannot
 * be handed a proxy that fetches any URL it likes. So each manifest response
 * mints a ticket pinned to the origins that manifest actually came from, and
 * segment requests are only honoured when their URL sits on one of them.
 */
@Injectable()
export class StreamTicketService implements OnModuleDestroy {
  private readonly tickets = new Map<string, Ticket>();
  private readonly sweeper: NodeJS.Timeout;

  constructor() {
    this.sweeper = setInterval(() => this.sweep(), SWEEP_MS);
    this.sweeper.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
    this.tickets.clear();
  }

  /** Mint a ticket for a manifest fetched from `urls` (request + final URL). */
  issue(urls: string[], userId?: string): string {
    const origins = new Set<string>();
    for (const u of urls) {
      try {
        origins.add(new URL(u).origin);
      } catch {
        // A URL we cannot parse simply grants no origin.
      }
    }
    const id = randomBytes(24).toString('base64url');
    const now = Date.now();
    this.tickets.set(id, { userId, origins, issuedAt: now, lastUsed: now });
    return id;
  }

  /**
   * Whether `url` may be fetched under `ticketId`, refreshing the ticket's idle
   * timer when it may. Returns the owning profile so the caller can keep
   * enforcing per-profile behaviour on sub-resources.
   */
  authorize(
    ticketId: string,
    url: URL,
  ): { ok: false } | { ok: true; userId?: string } {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return { ok: false };

    const now = Date.now();
    if (now - ticket.lastUsed > IDLE_MS || now - ticket.issuedAt > MAX_AGE_MS) {
      this.tickets.delete(ticketId);
      return { ok: false };
    }
    if (!ticket.origins.has(url.origin)) return { ok: false };

    ticket.lastUsed = now;
    return { ok: true, userId: ticket.userId };
  }

  /**
   * Widen a ticket after a redirect: a nested playlist may 302 onto a sibling
   * CDN host whose segments must stay playable.
   */
  extend(ticketId: string, url: string): void {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return;
    try {
      ticket.origins.add(new URL(url).origin);
    } catch {
      // Unparseable URLs widen nothing.
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, t] of this.tickets) {
      if (now - t.lastUsed > IDLE_MS || now - t.issuedAt > MAX_AGE_MS) {
        this.tickets.delete(id);
      }
    }
  }
}
