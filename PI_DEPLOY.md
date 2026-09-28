# Running on a Raspberry Pi 3

Serving the house from a Pi 3 works — with one hard limit you should know
before you start.

## What the board can and cannot do

A Pi 3 is 4× Cortex-A53 at 1.2–1.4 GHz with **1 GB of RAM**, running from an SD
card, with networking behind USB (100 Mbit on a 3B, ~300 Mbit real throughput on
a 3B+).

**Works well**

- Proxying HLS streams (`/api/stream`) — it is moving bytes, not decoding them.
  Expect 3–5 concurrent viewers before the single Node process, not the network,
  becomes the limit.
- Remuxing H.264 VOD to HLS (`-c:v copy`). The container changes; the video does
  not get re-encoded. Audio is re-encoded to AAC, which is cheap.
- Browsing the catalogue and serving the metadata DB.

**Does not work — plan around it**

- **Live transcoding of HEVC/H.265 channels.** There is no H.264 encoder ffmpeg
  can reach on this board: the old `h264_omx` was removed from Raspberry Pi OS,
  and software x264 on four A53 cores cannot hold real time even at 720p, let
  alone 1080p. `docker-compose.pi.yml` sets `LIVE_MAX_SESSIONS=1` so a stray
  attempt cannot take the board down, but treat HEVC channels as unplayable
  here. Use the SD/H.264 variants your provider offers.
- Re-encoding non-H.264 VOD, for the same reason.

## 1. Use 64-bit Raspberry Pi OS

Install the **64-bit** image. `better-sqlite3` and the other native modules have
far better prebuilt coverage on `arm64` than on 32-bit `armhf`, which otherwise
means compiling from source on the Pi.

## 2. Build the images on your desktop, not on the Pi

`npm ci` plus a Vite production build inside 1 GB of RAM will usually be killed
by the OOM reaper, and what survives takes the better part of an hour. Build for
the Pi's architecture on a real machine and ship the images across:

```bash
# On your desktop, from the repository root
docker buildx build --platform linux/arm64 -t iptv-server:pi  ./server --load
docker buildx build --platform linux/arm64 -t iptv-web:pi     ./web    --load

docker save iptv-server:pi iptv-web:pi | gzip > iptv-pi.tar.gz
scp iptv-pi.tar.gz pi@raspberrypi.local:~
```

```bash
# On the Pi
gunzip -c iptv-pi.tar.gz | docker load
```

Then point the compose files at those tags (add `image: iptv-server:pi` /
`image: iptv-web:pi` under the respective services, or re-tag to match).

## 3. Start it with the Pi overrides

```bash
docker compose -f docker-compose.yml -f docker-compose.pi.yml up -d
```

`docker-compose.pi.yml` adds, and explains, the settings this board needs:

| Setting | Why |
| ------- | --- |
| `tmpfs: /tmp` (256 MB) | HLS segments are written continuously during playback and deleted a minute later. On the SD card that is pure wear; in RAM it costs nothing. |
| `LIVE_MAX_SESSIONS=1` | Caps the transcode path that this board cannot sustain. |
| `AUTO_ENRICH_ON_BOOT=false` | Stops tens of thousands of paced TMDB/Xtream calls from starting after every restart (see step 5). |
| `--max-old-space-size=384` | Node's default heap assumes much more RAM than 1 GB. |
| memory limits | Leaves room for nginx, ffmpeg and the OS. |
| smaller page limits | TV browsers are slow at rendering long lists. |

## 4. Give the board some swap

Raspberry Pi OS ships with 100 MB of swap, which is not enough headroom for an
ffmpeg session starting while the catalogue is in memory:

```bash
sudo dphys-swapfile swapoff
sudo sed -i 's/^CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
sudo dphys-swapfile setup && sudo dphys-swapfile swapon
```

## 5. Build the metadata DB on your desktop

Enriching a 64k catalogue is tens of thousands of TMDB lookups plus one Xtream
call per film, each deliberately paced. On a desktop it is a long coffee break;
on a Pi it runs for many hours, competes with playback, and writes to the SD
card the whole time. That is why `AUTO_ENRICH_ON_BOOT=false` is set above.

Run it once on a fast machine, then copy the result over:

```bash
# Desktop: let it finish (watch the logs), then lift the DB out of the volume
docker compose up -d
docker run --rm -v iptv-player_iptv-data:/v -v "$PWD":/out alpine \
  cp /v/metadata.db /out/metadata.db
scp metadata.db pi@raspberrypi.local:~
```

```bash
# Pi: stop, drop it in, start again
docker compose -f docker-compose.yml -f docker-compose.pi.yml down
docker run --rm -v iptv-player_iptv-data:/v -v "$HOME":/in alpine \
  cp /in/metadata.db /v/metadata.db
docker compose -f docker-compose.yml -f docker-compose.pi.yml up -d
```

Re-run the sync by hand from **/admin → Playlist** whenever the catalogue
changes materially, or repeat this copy.

## 6. First run

1. Open `http://<pi-address>:8080/admin` and set the administrator password.
2. **Playlist** tab → import your provider (Xtream host/username/password, or an
   M3U URL).
3. **Profiles** tab → create a profile per person, with a PIN and the categories
   each may see.
4. Everyone else opens `http://<pi-address>:8080` and picks their profile.

## Measured on this hardware profile

Taken against the real 12,710-channel / 64,468-film catalogue in an `arm64`
container capped at 512 MB — the same image and settings the Pi runs:

| Screen | Before | Now |
| ------ | -----: | --: |
| Database (grouped browse) | 10.7 s | **0.46 s** |
| Movies listing | 5.7 s | **0.95 s** |
| Series listing | 3.0 s | **0.24 s** |
| Movies, deep page (200) | 9.9 s | **1.58 s** |
| Channel search | 0.01 s | 0.01 s |

Two things were making those screens unusable on a slow CPU, both now fixed:
catalogue lookups by id scanned the whole array (billions of comparisons per
page), and a listing issued one relational metadata query per row instead of one
per page.

Idle memory is about 80 MB; under load around 160 MB of the 512 MB limit.

## Keeping it healthy

- `docker compose ... logs -f server` — the enrichment and transcode logs are here.
- `vcgencmd measure_temp` and `vcgencmd get_throttled` — a Pi 3 under sustained
  load throttles; a non-zero `throttled` value explains stuttering better than
  any application log will.
- The catalogue (`channels.json`, `vod.json`) and `metadata.db` live on the
  `iptv-data` volume and survive rebuilds. `docker compose down -v` erases them.
