import {
  BadGatewayException,
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { Readable } from 'stream';
import { isUpstreamAllowed } from '../common/net-guard';
import { UPSTREAM_USER_AGENT } from '../common/upstream';
import { MediaResolverService } from '../media/media-resolver.service';
import { StreamTicketService } from '../media/stream-ticket.service';
import { ActiveUserId } from '../users/active-user.decorator';
import { StreamService } from './stream.service';

/** Path the rewritten manifest URIs point back to (same origin as the SPA). */
const PROXY_BASE = '/api/stream';
/** Guards only connection setup — the body then streams for as long as needed. */
const CONNECT_TIMEOUT_MS = 20_000;

/**
 * Reverse-proxies HLS streams. The browser only ever talks to our origin, so
 * cross-origin streams play without CORS errors and work on TV browsers.
 *   - manifests (.m3u8) are fetched, URL-rewritten, and returned as text
 *   - segments / keys are streamed straight through
 *
 * Callers never name a URL. A playback request identifies a catalog entry
 * (`?src=channel:<id>`), which the resolver turns into an upstream URL only if
 * the active profile may watch it; the manifest's own sub-resources are then
 * fetched with the ticket minted for that manifest (`?t=…&u=…`). Accepting a
 * raw URL here would make the server an open proxy into its own LAN.
 */
@Controller('stream')
export class StreamController {
  constructor(
    private readonly service: StreamService,
    private readonly resolver: MediaResolverService,
    private readonly tickets: StreamTicketService,
  ) {}

  @Get()
  async proxy(
    @Query('src') src: string | undefined,
    @Query('t') ticketId: string | undefined,
    @Query('u') childUrl: string | undefined,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
    @ActiveUserId() userId?: string,
  ): Promise<void> {
    const entry = await this.resolveRequest(src, ticketId, childUrl, userId);

    if (!(await isUpstreamAllowed(entry.target))) {
      throw new ForbiddenException('Upstream host is not permitted');
    }

    const headers: Record<string, string> = {
      // Always present a whitelisted player UA, not the browser's — providers
      // reject unknown agents. `fetch` follows redirects by default.
      'user-agent': UPSTREAM_USER_AGENT,
    };
    // Forward Range so the browser can seek within direct VOD files (mp4).
    if (range) headers.range = range;

    // Abort the upstream when the client navigates away / closes the player,
    // and cap only the *connection* phase (long VOD bodies must not be cut off).
    const controller = new AbortController();
    const connectTimer = setTimeout(
      () => controller.abort(),
      CONNECT_TIMEOUT_MS,
    );
    res.on('close', () => controller.abort());

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(entry.target.toString(), {
        signal: controller.signal,
        headers,
      });
    } catch (err) {
      clearTimeout(connectTimer);
      throw new BadGatewayException(
        `Upstream fetch failed: ${(err as Error).message}`,
      );
    }
    clearTimeout(connectTimer);

    // The SPA is same-origin with the API, so no cross-origin grant is needed.
    const contentType = upstream.headers.get('content-type') ?? '';
    // Rewrite against the FINAL url after redirects: Xtream live streams 302 to
    // a CDN host, and the manifest's segment paths are relative to that host.
    const baseUrl = upstream.url || entry.target.toString();

    if (this.service.isManifest(baseUrl, contentType)) {
      const text = await upstream.text();
      // A nested playlist keeps its parent's ticket, widened to wherever the
      // redirect landed; a fresh playback mints one for the origins involved.
      let ticket: string;
      if (entry.ticketId) {
        this.tickets.extend(entry.ticketId, baseUrl);
        ticket = entry.ticketId;
      } else {
        ticket = this.tickets.issue([entry.target.toString(), baseUrl], userId);
      }
      const rewritten = this.service.rewriteManifest(
        text,
        baseUrl,
        PROXY_BASE,
        ticket,
      );
      res.status(upstream.status);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-store');
      res.send(rewritten);
      return;
    }

    // Binary passthrough (segments, or direct VOD files with Range support).
    res.status(upstream.status); // 200, or 206 for a partial (Range) response
    if (contentType) res.setHeader('Content-Type', contentType);
    for (const header of ['content-length', 'content-range']) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    // We forward Range and return 206, so advertise byte ranges ourselves —
    // some providers send a malformed Accept-Ranges that breaks browser seeking
    // (and mp4 moov-atom probing → MEDIA_ERR_SRC_NOT_SUPPORTED).
    res.setHeader('Accept-Ranges', 'bytes');

    if (!upstream.body) {
      res.end();
      return;
    }

    const body = Readable.fromWeb(
      upstream.body as Parameters<typeof Readable.fromWeb>[0],
    );
    // A client disconnect or upstream abort surfaces here — handle it so an
    // unhandled stream 'error' can never crash the process.
    body.on('error', () => {
      if (!res.writableEnded) res.destroy();
    });
    res.on('error', () => body.destroy());
    body.pipe(res);
  }

  /**
   * Works out what to fetch: either a catalog entry the profile may play, or a
   * sub-resource of a manifest we served under a still-valid ticket.
   */
  private async resolveRequest(
    src: string | undefined,
    ticketId: string | undefined,
    childUrl: string | undefined,
    userId: string | undefined,
  ): Promise<{ target: URL; ticketId?: string }> {
    if (src) {
      const media = await this.resolver.resolveSource(src, userId);
      return { target: this.parseTarget(media.url) };
    }

    if (ticketId && childUrl) {
      const target = this.parseTarget(childUrl);
      if (!this.tickets.authorize(ticketId, target).ok) {
        throw new ForbiddenException('Stream ticket is invalid or expired');
      }
      return { target, ticketId };
    }

    throw new BadRequestException(
      'src is required (or a t/u pair from a served manifest)',
    );
  }

  private parseTarget(url: string): URL {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      throw new BadRequestException('url is not a valid absolute URL');
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      throw new BadRequestException('only http(s) streams are supported');
    }
    return target;
  }
}
