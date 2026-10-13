# IPTV Player

A browser-based IPTV player for the home LAN. Connect an **Xtream Codes**
account (or import an M3U/M3U8 playlist), then browse **live channels, movies
(VOD), and series** by category, star favorites, and watch from any device on
the network — desktop or TV browser. Files the browser can't play natively
(mkv/avi) are transcoded to HLS on the fly with ffmpeg.

- **Backend:** Node.js + TypeScript, **NestJS**, validation with
  `class-validator`.
- **Frontend:** React + TypeScript (**Vite**), React Router, **TanStack React
  Query**, **hls.js**.
- **Data store:** JSON files (no external DB). Imported channels and favorites
  are persisted to disk.
- **Tests:** Backend Jest + supertest-style HTTP checks; Frontend Vitest +
  React Testing Library.
- **Access control:** signing in to a profile issues a server-side session;
  profiles scope which categories are browsable and playable, and playback
  resolves catalog references server-side. Administration is a separate
  password-protected console at `/admin` (see
  [Profiles & sessions](#profiles--sessions),
  [Administration](#administration-admin) and [Stream proxy](#stream-proxy)).
- **Tooling:** ESLint + Prettier, TypeScript strict mode.

> The stack mirrors the Movie Watchlist assignment (`../staj`) — same layering,
> error contract, and tooling — adapted to channels, playlists, and live
> streaming.

---

## Browsers

Built for **Safari 12.1 / Chrome 66 / Firefox 60 and newer** (`build.target` in
`web/vite.config.ts`). That floor is deliberate: an old iPad makes an excellent
second television, and an iPad mini 2 stops at iOS 12.5. Anything older than the
floor downloads the bundle and then fails to parse it — a blank page with no
visible error, only a console entry.

Two consequences of that floor worth knowing:

- On iOS, playback uses Safari's **native HLS** rather than `hls.js` (iOS has no
  Media Source Extensions), which the player already falls back to.
- Flexbox `gap` needs Safari 14.1, so spacing is a little tighter on iOS 12–14.
  Everything remains usable; nothing is hidden.

## Quick start with Docker (recommended)

From the repository root:

```bash
docker compose up --build
```

Then open **http://localhost:8080** on the machine running Docker, or
**http://<that-machine's-LAN-IP>:8080** from any other device on the network
(another computer, a TV browser, a phone).

- `web` (nginx) serves the built React app on port **8080** and proxies
  `/api/*` to the backend.
- `server` (NestJS) runs on port 3000 inside the Docker network.
- Imported channels and favorites are stored in a named volume (`iptv-data`),
  so they survive restarts. Remove them with `docker compose down -v`.

### Getting channels in

1. Open **http://\<server\>:8080/admin** and set the administrator password.
2. Go to the **Playlist** tab, paste your provider's **M3U/M3U8 URL** (or an
   Xtream host/username/password) and import.
3. Back on the player, pick a profile → **Channels**, pick one, and it plays.

Your playlist URL is entered in the app — it is never committed to the repo.

---

## Running on a Raspberry Pi

See **[PI_DEPLOY.md](PI_DEPLOY.md)**. In short: build the images on a desktop
with `buildx --platform linux/arm64`, start with the Pi overrides

```bash
docker compose -f docker-compose.yml -f docker-compose.pi.yml up -d
```

and build `metadata.db` on the desktop rather than on the board. A Pi 3 proxies
and remuxes streams happily; it **cannot** transcode HEVC channels to H.264 —
there is no hardware encoder ffmpeg can reach on it, and software x264 cannot
hold real time on four A53 cores.

## Running locally (without Docker)

Two terminals:

```bash
# Terminal 1 — backend (http://localhost:3000)
cd server
npm install
npm run start:dev   # needs ffmpeg + ffprobe on PATH for VOD/transcode

# Terminal 2 — frontend (http://localhost:5173)
cd web
npm install
npm run dev
```

The Vite dev server proxies `/api` to `http://localhost:3000`
(override with `VITE_API_PROXY`).

---

## Tests, lint, format

```bash
# Backend
cd server
npm test          # 159 tests (parser, services, auth, admin, permissions, stream tickets)
npm run lint
npm run format

# Frontend
cd web
npm test          # 43 tests (Vitest + RTL)
npm run lint
npm run format
```

---

## API

Base path: `/api`. All 4xx/5xx errors share one shape:

```json
{ "error": "ValidationError", "message": "channelId should not be empty" }
```

### Channels

| Method & path             | Notes                                            |
| ------------------------- | ------------------------------------------------ |
| `GET /api/channels`       | `?query=` (name, case-insensitive) `&group=`     |
| `GET /api/channels/groups`| Distinct category list (sorted)                  |
| `GET /api/channels/:id`   | One channel, `404` if unknown                    |

`GET /api/channels` → `{ items: Channel[], total: number }`

### Playlists

| Method & path                | Body / form                       | Notes                     |
| ---------------------------- | --------------------------------- | ------------------------- |
| `GET /api/playlists`         | –                                 | Current `PlaylistMeta`    |
| `POST /api/playlists/xtream` | `{ host, username, password }`    | Xtream: live + VOD + series |
| `POST /api/playlists/import` | `{ url }` (JSON)                  | M3U URL: fetch + parse    |
| `POST /api/playlists/upload` | `file` (multipart)                | Uploaded `.m3u` file      |

Import routes return the new `PlaylistMeta`. `400` if no channels were found;
`502` if the provider could not be reached. The Xtream import pulls **live
channels** via `get_live_streams` and **movies + series** via the VOD/series
APIs (not the giant `get.php` dump); only the host is persisted, plus the
account (needed to fetch series episodes on demand).

### Movies & Series

| Method & path           | Notes                                              |
| ----------------------- | -------------------------------------------------- |
| `GET /api/movies`       | `?query=&group=` → `{ items: Movie[], total }`     |
| `GET /api/movies/groups`| Distinct VOD categories                            |
| `GET /api/movies/:id`   | One movie                                          |
| `GET /api/series`       | `?query=&group=` → `{ items: Series[], total }`    |
| `GET /api/series/groups`| Distinct series categories                         |
| `GET /api/series/:id`   | Series + seasons/episodes (fetched on demand)      |

Movie/series lists are capped (`CATALOG_PAGE_LIMIT`, default 500) with the real
`total`, since a provider can carry 60k+ titles.

### VOD playback (continuous remux, like a native player)

`POST /api/vod/open` body `{ src, position?, audioIndex?, subtitleIndex?,
preferLang?, preferSubLang? }` → `{ id, playlist, duration, startPos,
audioIndex, subtitleIndex, audioTracks, subtitleTracks }`

`src` is a catalog reference (`movie:<id>` / `episode:<seriesId>:<episodeId>`),
resolved and permission-checked before ffmpeg is ever spawned.
`POST /api/live/open` takes `{ src }` the same way.

All VOD (movies + episodes) plays through one **continuous ffmpeg session** that,
like a native player, reads the source **once** and outputs both the video and
the subtitles inline. Video is **remuxed** (`-c:v copy` for H.264 — no re-encode;
only non-H.264 is transcoded) into a growing EVENT HLS master playlist, and the
chosen subtitle is carried as an **HLS subtitle rendition** (incremental WebVTT
segments). Because the subtitle packets are read in the same pass, subtitles
appear within seconds — no separate whole-file extraction.

The session starts at a movie offset (`startPos`); the player's seek bar shows
`startPos + currentTime`. **Seeking and audio/subtitle changes re-open the
session** at the current position (a brief re-buffer, exactly like a native
player). `resolveFile` serves the master/variant playlists, `.ts` and `.vtt`
segments from the session's temp dir. Live channels do **not** use this — they
stream straight through `/api/stream`.

The **Settings** page sets a preferred audio and subtitle language, applied
automatically on open. Subtitles are shown by painting the hls.js text track's
active cue above the player controls.

### Favorites

| Method & path                  | Body            | Codes                       |
| ------------------------------ | --------------- | --------------------------- |
| `GET /api/favorites`           | –               | `200` → `FavoriteItem[]`    |
| `POST /api/favorites`          | `{ channelId }` | `201` / `400` / `404` / `409` |
| `DELETE /api/favorites/:channelId` | –           | `204` / `404`               |

### Continue watching

| Method & path                  | Body                          | Notes                          |
| ------------------------------ | ----------------------------- | ------------------------------ |
| `GET /api/progress`            | –                             | Unfinished items, newest first |
| `PUT /api/progress`            | `{ kind, id, position, … }`   | Upsert; drops ≥95%-watched     |
| `DELETE /api/progress/:kind/:id` | –                           | `204`                          |

The player reports position every 10s; movies and episodes resume where you left
off, and the **Continue** page lists them with a progress bar. Stored on the
volume (`progress.json`), so it follows you across devices. When an episode
finishes, the next one **autoplays** (toggle in Settings); there's also a manual
“Next” button on the series page.

### Profiles & sessions

Every route requires a session except the few needed to obtain one. Picking a
profile is a real sign-in, not a client-side preference.

| Method & path             | Notes                                              |
| ------------------------- | -------------------------------------------------- |
| `GET /api/auth/profiles`  | Public. The picker list: name, colour, `hasPin`.   |
| `GET /api/auth/session`   | Public. `{ user }` or `{ user: null }`.            |
| `POST /api/auth/login`    | Public. `{ userId, pin }` → sets the session cookie |
| `POST /api/auth/logout`   | `204`; drops the session server-side               |

- The session is a 256-bit random token in an **HttpOnly** cookie (`iptv_sid`),
  `SameSite=Lax`. Only its SHA-256 is stored, so `sessions.json` cannot be
  replayed. Set `COOKIE_SECURE=true` if you terminate HTTPS in front.
- **PINs are hashed with scrypt**, never stored in the clear. A `users.json`
  from an older version is migrated on first start: its plain `pin` is hashed
  and removed, and the obsolete per-profile `admin` flag is dropped.
- Wrong PINs lock **that profile** out with a doubling backoff after five
  misses (up to 15 minutes), which is what keeps a 4-digit PIN meaningful.
- Sessions expire after `SESSION_IDLE_DAYS` (default 30) unused, and
  `SESSION_MAX_DAYS` (default 90) outright. They survive a reboot, so the TVs in
  the house do not need signing in again after a power cut.

**Parental controls are the profile.** Mark a profile **kids** and every
age-restricted category is hidden from it on top of whatever `allowed` says;
give it an explicit category list and it sees only those. Both are enforced on
the server, for browsing *and* playback, so they hold on every device. There is
deliberately no browser-side PIN: an earlier one kept a secret in local storage
(default `1234`) and filtered the list after the server had already sent it,
which looked like protection and was not.

### Administration (`/admin`)

Management is a **separate door with its own password**, not a privileged
profile. A viewer signed in to watch television cannot reach it whatever they
send, and the household's picker never lists an "admin" profile.

| Method & path                | Notes                                             |
| ---------------------------- | ------------------------------------------------- |
| `GET /api/admin/status`      | Public. `{ configured, signedIn, minPasswordLength }` |
| `POST /api/admin/setup`      | Public, first run only. Chooses the password      |
| `POST /api/admin/login`      | Public. `{ password }` → sets the admin cookie    |
| `POST /api/admin/logout`     | `204`                                             |
| `PUT /api/admin/password`    | `{ current, next }`; signs every console out      |
| `GET/POST/PUT/DELETE /api/users` | Administrator only                            |
| `POST /api/playlists/*`      | Administrator only                                |
| `GET /api/{channels,movies,series}/all-groups` | Administrator only — the unfiltered category lists the permission editor offers |

- Open **`/admin`** in the browser. On a fresh install it asks you to choose the
  password (minimum 8 characters); afterwards it asks for it.
- The console cookie (`iptv_admin`) is distinct from the viewer one and expires
  after `ADMIN_SESSION_IDLE_HOURS` (default 12) idle, `ADMIN_SESSION_MAX_DAYS`
  (default 7) outright — it is a console, not a television.
- The password is scrypt-hashed in `admin.json`. Guesses are throttled the same
  way PINs are. Changing it invalidates every console session, including the
  one that changed it.
- Setup can only be run once; afterwards it returns `409`, so nobody can claim
  an installation that is already configured.
- **Profiles**, **playlist import** and the **TMDB sync** live only here. The
  viewer app keeps the read-only **Database** screen, which every profile can
  use (scoped to the categories that profile is allowed to see).

### Stream proxy

`GET /api/stream?src=<media-source>`

Reverse-proxies a stream. For manifests (`.m3u8`) it rewrites every segment /
key / nested-playlist URI to route back through this endpoint (resolved against
the **final** URL after redirects, since Xtream live streams 302 to a CDN); for
segments and direct VOD files it streams the bytes through, **forwarding `Range`
headers** so the browser can seek within mp4 files. Every upstream request
carries a whitelisted player User-Agent (`IPTV_USER_AGENT`), because many
providers reject unknown/browser agents. This is what lets cross-origin provider
streams play in the browser (no CORS errors) and on TV browsers.

**Clients never name a URL.** `src` is a reference into our own catalog —
`channel:<id>`, `movie:<id>` or `episode:<seriesId>:<episodeId>` — which the
server resolves to an upstream URL only if the active profile is allowed to
watch that category. A manifest's own children are addressed by the ticket
minted for that manifest (`?t=<ticket>&u=<url>`), valid only for URLs on the
origins the manifest actually came from and expiring after 30 idle minutes.

Accepting a raw URL here would make the server an open web proxy for everyone on
the LAN, and a way to reach the router and other LAN hosts from the outside
(SSRF). Outbound requests to private / loopback / link-local addresses are
refused regardless; set `ALLOW_PRIVATE_UPSTREAM=true` only when the provider
really is a box on the same network.

### What the browser is not told

Provider stream URLs embed the account's username and password
(`/movie/<user>/<pass>/<id>.mkv`). API responses therefore **omit `url`** on
channels, movies and episodes — playback addresses content by `src` instead, so
the subscription cannot be lifted out of devtools on any device in the house.

---

## Data model

```ts
interface Channel {
  id: string; // tvg-id, or a hash of the stream URL
  name: string;
  url: string;
  logo?: string;
  group?: string;
  tvgId?: string;
  tvgName?: string;
}

interface PlaylistMeta {
  source: 'url' | 'file' | 'none';
  url?: string;
  importedAt?: string; // ISO timestamp
  channelCount: number;
}

interface FavoriteItem {
  channelId: string;
  addedAt: string; // ISO timestamp
  channel: Channel; // snapshot, survives a re-import
}
```

---

## Project structure

```
.
├── docker-compose.yml
├── server/                    # NestJS API
│   └── src/
│       ├── m3u/               # M3U/M3U8 parser (pure, unit-tested)
│       ├── channels/          # browse: controller, service, repository
│       ├── playlists/         # import from URL / file
│       ├── favorites/         # favorite channels (add/list/remove)
│       ├── stream/            # HLS reverse-proxy + manifest rewriter
│       ├── common/            # atomic JSON file I/O, global error filter
│       └── types/             # shared domain types
└── web/                       # React + Vite SPA
    ├── nginx.conf             # static serving + /api proxy (stream-friendly)
    └── src/
        ├── api/               # typed client + React Query hooks
        ├── components/        # VideoPlayer (hls.js), ChannelCard, grid nav
        └── pages/             # Channels, Player, Favorites, Import
```

---

## Design decisions

### Layering (controllers stay thin)

Route handlers only parse/validate input (NestJS DTOs + `ValidationPipe`) and
delegate. Business logic lives in services; all I/O lives in repositories. A
single global `HttpExceptionFilter` maps every thrown exception to the
`{ error, message }` contract.

### Access control — two separate doors

Watching and administering are different activities, so they have different
credentials and different cookies.

A **viewer** signs in to a profile with its PIN and receives a session; that
session decides which categories they may browse *and play*. A profile id is
never taken from a request header — an earlier design did exactly that, which
meant any device could name any profile, or omit it and be treated as
unrestricted.

An **administrator** signs in at `/admin` with a password that belongs to no
profile at all. Profile editing, playlist import and the TMDB sync accept only
that cookie. Keeping it separate means the picker shows only real people, and
that a television left signed in on the sofa is never one URL away from the
management screens.

Both credentials are scrypt-hashed and both are rate-limited; only token hashes
reach disk, so neither `sessions.json` nor `admin.json` can be replayed.

### Stream proxy — why it exists

Provider HLS streams are cross-origin and usually lack permissive CORS headers,
so a browser cannot fetch them directly — and TV browsers are even stricter. The
backend proxies the manifest, rewriting every URI so the browser only ever talks
to our own origin. Relative URIs are resolved against the upstream manifest URL
before being re-pointed at `/api/stream`, and the rewrite applies recursively to
nested variant playlists down to the segments.

### Playback

`hls.js` drives playback on Chrome/Firefox/most TV browsers; Safari uses its
native HLS support. Fatal stream errors surface an inline message.

### Persistence

Channels and favorites are held in memory and written back to JSON with an
**atomic write** (temp file + rename) so a crash mid-write cannot corrupt the
store; writes are serialized to avoid interleaving. In Docker these files live
on a named volume.

### TV / remote navigation

The channel grid supports arrow-key roving focus (`[data-nav]` + column
inference) so it is usable from a TV remote, where there is no pointer. Enter
opens the focused channel. All controls keep real `<label>`s and visible focus
outlines.

### Why React Query

Shared cache + dedupe (the favorites list is read on several pages), free
loading/error states, and simple cache invalidation after importing a playlist
or toggling a favorite.

---

## Test coverage

**Backend (25 tests)**

- `parseM3U`: attributes, quoted commas, `#EXTGRP` fallback, hashed/unique ids,
  unknown-directive skipping, `tvg-name` fallback.
- `ChannelsService`: query (case-insensitive), group filter, combined filters,
  empty result, groups, `getById` 404.
- `FavoritesService`: add + snapshot, 404 unknown channel, 409 duplicate,
  remove, remove 404.
- `StreamService`: manifest detection, relative/absolute/root-relative URI
  rewriting, `URI="..."` tag rewriting, untouched comment lines.

**Frontend (8 tests)**

- `ChannelsPage`: renders from API, search drives the server query, star adds a
  favorite.
- `FavoritesPage`: renders from API, remove calls DELETE and drops the item,
  client-side name filter.
- `ImportPage`: URL import calls the API and shows the result; button disabled
  until a URL is entered.
```
