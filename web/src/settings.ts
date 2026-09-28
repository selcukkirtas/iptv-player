/** App-level playback preferences, persisted in localStorage. */

const AUDIO_KEY = 'iptv.preferredAudioLang';
const SUBTITLE_KEY = 'iptv.preferredSubtitleLang';
const AUTOPLAY_KEY = 'iptv.autoplayNext';
const FIT_KEY = 'iptv.videoFit';

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function write(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* ignore storage failures (private mode, etc.) */
  }
}

/**
 * Language preferred for audio and subtitles until the viewer says otherwise.
 *
 * Most of this catalogue is Turkish with an English track alongside, and English
 * is what people reach for when both exist — so it is the starting point rather
 * than "whatever track happens to be first". Where no English track exists
 * nothing is lost: the server falls back to the first audio track, and leaves
 * subtitles off.
 */
const DEFAULT_LANG = 'eng';

/**
 * Stored when the viewer explicitly picks "no preference" / "off".
 *
 * An empty string cannot carry that, because empty is also what an untouched
 * setting looks like — and those two have to mean different things now that
 * untouched means English.
 */
const NO_PREFERENCE = 'none';

function readLang(key: string): string {
  const raw = read(key);
  if (!raw) return DEFAULT_LANG; // never chosen
  return raw === NO_PREFERENCE ? '' : raw;
}

function writeLang(key: string, lang: string): void {
  write(key, lang ? lang : NO_PREFERENCE);
}

export function getPreferredAudioLang(): string {
  return readLang(AUDIO_KEY);
}

export function setPreferredAudioLang(lang: string): void {
  writeLang(AUDIO_KEY, lang);
}

export function getPreferredSubtitleLang(): string {
  return readLang(SUBTITLE_KEY);
}

export function setPreferredSubtitleLang(lang: string): void {
  writeLang(SUBTITLE_KEY, lang);
}

/**
 * Whether the subtitle language is still the built-in default rather than a
 * deliberate choice.
 *
 * A "subtitled" category turns its first text track on when the viewer has no
 * opinion. That fallback has to keep working now that the default is English —
 * otherwise a Turkish subtitled film with no English track would silently show
 * nothing, where before it showed its own subtitles.
 */
export function isSubtitleLangDefault(): boolean {
  return read(SUBTITLE_KEY) === '';
}

/** Autoplay the next episode when one finishes. Default on. */
export function getAutoplayNext(): boolean {
  return read(AUTOPLAY_KEY) !== '0';
}

export function setAutoplayNext(on: boolean): void {
  write(AUTOPLAY_KEY, on ? '' : '0');
}

/**
 * How the picture fills the player: `contain` (fit — no crop, may letterbox) or
 * `cover` (fill — crops the edges to remove the bars). Default `contain`.
 */
export type VideoFit = 'contain' | 'cover';

export function getVideoFit(): VideoFit {
  return read(FIT_KEY) === 'cover' ? 'cover' : 'contain';
}

export function setVideoFit(fit: VideoFit): void {
  write(FIT_KEY, fit === 'cover' ? 'cover' : '');
}

/* -------------------------------------------------------------------------- */
/* Adult-category PIN lock                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Group-name patterns treated as age-restricted. Channels in a matching group
 * are hidden from the listing until the viewer unlocks them with the PIN.
 * Matched case-insensitively against the provider's category name.
 */
const LOCKED_GROUP_PATTERNS = [
  /for adults/i,
  /adult/i,
  /\bxxx\b/i,
  /18\+/,
  /\+18/,
];

/**
 * True when a category name looks age-restricted.
 *
 * Presentation only — it is used to keep adult categories out of the list an
 * administrator picks from when configuring a kids profile. It is **not** a
 * restriction: the server decides what a profile may see, and mirrors these
 * same patterns in `server/src/users/adult.ts`.
 *
 * There used to be a second, browser-side lock here: a PIN in local storage
 * (default `1234`) that hid these categories until it was typed. It protected
 * nothing — the server still served the content, and clearing one storage key
 * removed it — while looking like parental control. Per-profile permissions
 * replace it: mark a profile as **kids**, or give it an explicit category
 * allowlist, from /admin.
 */
export function isLockedGroup(group: string | undefined): boolean {
  if (!group) return false;
  return LOCKED_GROUP_PATTERNS.some((re) => re.test(group));
}

/** A few common ISO-639-2 codes → display names, for the preference picker. */
export const COMMON_LANGUAGES: { code: string; label: string }[] = [
  { code: 'tur', label: 'Türkçe' },
  { code: 'eng', label: 'English' },
  { code: 'ger', label: 'Deutsch' },
  { code: 'fre', label: 'Français' },
  { code: 'spa', label: 'Español' },
  { code: 'ara', label: 'العربية' },
  { code: 'rus', label: 'Русский' },
];

/** Human label for an audio/subtitle track (language first, so same-titled
 * tracks in different languages are still distinguishable). */
export function trackLabel(t: {
  language?: string;
  title?: string;
  channels?: number;
}): string {
  const parts: string[] = [];
  if (t.language) parts.push(t.language.toUpperCase());
  if (t.title && t.title.toLowerCase() !== (t.language ?? '').toLowerCase()) {
    parts.push(t.title);
  }
  if (!parts.length) parts.push('Track');
  if (t.channels === 6) parts.push('5.1');
  else if (t.channels === 2) parts.push('Stereo');
  else if (t.channels === 1) parts.push('Mono');
  return parts.join(' · ');
}

/** Append a #N suffix to any labels that would otherwise be identical. */
export function disambiguate(labels: string[]): string[] {
  return labels.map((label, i) =>
    labels.filter((l) => l === label).length > 1 ? `${label} #${i + 1}` : label,
  );
}
