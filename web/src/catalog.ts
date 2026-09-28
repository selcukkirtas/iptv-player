import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Readable label for an ISO-ish audio language code from the provider probe. */
const LANG_LABELS: Record<string, string> = {
  tur: 'Türkçe',
  eng: 'İngilizce',
  ger: 'Almanca',
  deu: 'Almanca',
  fre: 'Fransızca',
  fra: 'Fransızca',
  spa: 'İspanyolca',
  ita: 'İtalyanca',
  rus: 'Rusça',
  ara: 'Arapça',
  jpn: 'Japonca',
  kor: 'Korece',
  chi: 'Çince',
  zho: 'Çince',
  hin: 'Hintçe',
  fas: 'Farsça',
  per: 'Farsça',
};

export function langLabel(code: string): string {
  return LANG_LABELS[code.toLowerCase()] ?? code.toUpperCase();
}

const VIEW_STORAGE_KEY = 'catalog-view';

/** Grid/table view preference for catalog pages, persisted across sessions. */
export function useCatalogView(): [
  'grid' | 'table',
  (v: 'grid' | 'table') => void,
] {
  const [view, setViewState] = useState<'grid' | 'table'>(() => {
    try {
      return localStorage.getItem(VIEW_STORAGE_KEY) === 'table'
        ? 'table'
        : 'grid';
    } catch {
      return 'grid';
    }
  });
  const setView = useCallback((v: 'grid' | 'table') => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, v);
    } catch {
      /* ignore storage failures (private mode, etc.) */
    }
    setViewState(v);
  }, []);
  return [view, setView];
}

/** Debounce a rapidly-changing value (e.g. a search box) by `delay` ms. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Category names beginning with the Turkish "TR" prefix token (e.g. "TR ➾ HEVC"). */
const TR_PREFIX = /^tr\b/i;

/**
 * Hoist every "TR…" category to the top of the list while preserving the
 * provider's original order within each bucket (stable partition). Used for the
 * category dropdowns so Turkish categories are always reachable first.
 */
export function sortGroups(groups: string[] | undefined): string[] {
  if (!groups) return [];
  const tr: string[] = [];
  const rest: string[] = [];
  for (const g of groups) (TR_PREFIX.test(g) ? tr : rest).push(g);
  return [...tr, ...rest];
}

/** Category names whose label marks the content as subtitled. */
const SUBTITLED_CATEGORY =
  /alt\s*yaz|subtitle|subbed|\bsubs?\b|vose|vostfr|legenda/i;
/** Provider prefix separators, e.g. "TR ➾ Altyazılı Filmler". */
const GROUP_SEPARATOR = /\s*[➾➞→»>|/]\s*/;

/**
 * For a movie/series category, whether subtitles should default on (the label
 * says it's subtitled content) and a language hint taken from the country/section
 * prefix (e.g. "TR ➾ …" → "tr"). The server falls back to the first subtitle if
 * the hint doesn't match a track. Only applies when no user preference is set.
 */
export function subtitleHintFromGroup(group?: string): {
  on: boolean;
  lang?: string;
} {
  if (!group || !SUBTITLED_CATEGORY.test(group)) return { on: false };
  const prefix = group.split(GROUP_SEPARATOR)[0].trim().toLowerCase();
  const lang = /^[a-z]{2,3}$/.test(prefix) ? prefix : undefined;
  return { on: true, lang };
}

export interface CatalogFilters {
  query: string;
  group: string;
  year: string;
  genre: string;
  actor: string;
  director: string;
  minRating: string;
  maxRating: string;
  minImdbScore: string;
  maxImdbScore: string;
  /** Audio-track language code (movies only), '' = any. */
  audioLang: string;
  /** '1' = only subtitled (category/name heuristic), '' = any. */
  subtitled: string;
  /** '' (provider order) | 'title' | 'title_desc' | 'year' | 'rating' */
  sort: string;
  /** 1-based page for the current result set. */
  page: number;
  setQuery: (q: string) => void;
  setGroup: (g: string) => void;
  setYear: (value: string) => void;
  setGenre: (value: string) => void;
  setActor: (value: string) => void;
  setDirector: (value: string) => void;
  setMinRating: (value: string) => void;
  setMaxRating: (value: string) => void;
  setMinImdbScore: (value: string) => void;
  setMaxImdbScore: (value: string) => void;
  setAudioLang: (value: string) => void;
  setSubtitled: (value: string) => void;
  setSort: (value: string) => void;
  setPage: (value: number) => void;
  clear: () => void;
  /** True when a search term or category filter is active. */
  active: boolean;
}

type CatalogFilterKey =
  | 'q'
  | 'group'
  | 'year'
  | 'genre'
  | 'actor'
  | 'director'
  | 'minRating'
  | 'maxRating'
  | 'minImdbScore'
  | 'maxImdbScore'
  | 'audioLang'
  | 'subtitled'
  | 'sort'
  | 'page';

/**
 * Search box + category filter backed by the URL query string (?q=&group=).
 * Keeping the state in the URL (instead of component state) means selecting a
 * title and pressing back restores the same results — the list URL is still in
 * history and React Query has the response cached. Updates `replace` the current
 * entry so typing doesn't flood the back stack with a step per keystroke.
 */
export function useCatalogFilters(): CatalogFilters {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const group = params.get('group') ?? '';
  const year = params.get('year') ?? '';
  const genre = params.get('genre') ?? '';
  const actor = params.get('actor') ?? '';
  const director = params.get('director') ?? '';
  const minRating = params.get('minRating') ?? '';
  const maxRating = params.get('maxRating') ?? '';
  const minImdbScore = params.get('minImdbScore') ?? '';
  const maxImdbScore = params.get('maxImdbScore') ?? '';
  const audioLang = params.get('audioLang') ?? '';
  const subtitled = params.get('subtitled') ?? '';
  const sort = params.get('sort') ?? '';
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);

  const update = useCallback(
    (next: Partial<Record<CatalogFilterKey, string>>) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          const keys: CatalogFilterKey[] = [
            'q',
            'group',
            'year',
            'genre',
            'actor',
            'director',
            'minRating',
            'maxRating',
            'minImdbScore',
            'maxImdbScore',
            'audioLang',
            'subtitled',
            'sort',
            'page',
          ];
          for (const key of keys) {
            if (!(key in next)) continue;
            const value = next[key];
            if (value) p.set(key, value);
            else p.delete(key);
          }
          // Changing anything other than the page itself returns to page 1, so
          // you never land on an out-of-range page after narrowing results.
          if (Object.keys(next).some((k) => k !== 'page')) p.delete('page');
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return {
    query,
    group,
    year,
    genre,
    actor,
    director,
    minRating,
    maxRating,
    minImdbScore,
    maxImdbScore,
    audioLang,
    subtitled,
    sort,
    page,
    setQuery: useCallback((q: string) => update({ q }), [update]),
    setGroup: useCallback((g: string) => update({ group: g }), [update]),
    setYear: useCallback((value: string) => update({ year: value }), [update]),
    setGenre: useCallback(
      (value: string) => update({ genre: value }),
      [update],
    ),
    setActor: useCallback(
      (value: string) => update({ actor: value }),
      [update],
    ),
    setDirector: useCallback(
      (value: string) => update({ director: value }),
      [update],
    ),
    setMinRating: useCallback(
      (value: string) => update({ minRating: value }),
      [update],
    ),
    setMaxRating: useCallback(
      (value: string) => update({ maxRating: value }),
      [update],
    ),
    setMinImdbScore: useCallback(
      (value: string) => update({ minImdbScore: value }),
      [update],
    ),
    setMaxImdbScore: useCallback(
      (value: string) => update({ maxImdbScore: value }),
      [update],
    ),
    setAudioLang: useCallback(
      (value: string) => update({ audioLang: value }),
      [update],
    ),
    setSubtitled: useCallback(
      (value: string) => update({ subtitled: value }),
      [update],
    ),
    setSort: useCallback((value: string) => update({ sort: value }), [update]),
    setPage: useCallback(
      (value: number) => update({ page: value > 1 ? String(value) : '' }),
      [update],
    ),
    clear: useCallback(
      () =>
        update({
          q: '',
          group: '',
          year: '',
          genre: '',
          actor: '',
          director: '',
          minRating: '',
          maxRating: '',
          minImdbScore: '',
          maxImdbScore: '',
          audioLang: '',
          subtitled: '',
        }),
      [update],
    ),
    active:
      query !== '' ||
      group !== '' ||
      year !== '' ||
      genre !== '' ||
      actor !== '' ||
      director !== '' ||
      minRating !== '' ||
      maxRating !== '' ||
      minImdbScore !== '' ||
      maxImdbScore !== '' ||
      audioLang !== '' ||
      subtitled !== '',
  };
}
