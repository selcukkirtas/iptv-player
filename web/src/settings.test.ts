import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPreferredAudioLang,
  getPreferredSubtitleLang,
  isSubtitleLangDefault,
  setPreferredAudioLang,
  setPreferredSubtitleLang,
} from './settings';

/**
 * Node's own experimental Web Storage shadows jsdom's `localStorage` in this
 * runner and implements almost none of it, so stand up a real one. `settings.ts`
 * reads the global on every call, which is what makes this substitution work —
 * and is also why the app merely degrades instead of throwing when storage is
 * unavailable.
 */
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('language preferences', () => {
  it('defaults to English before the viewer chooses anything', () => {
    expect(getPreferredAudioLang()).toBe('eng');
    expect(getPreferredSubtitleLang()).toBe('eng');
    expect(isSubtitleLangDefault()).toBe(true);
  });

  it('remembers an explicit language', () => {
    setPreferredAudioLang('tur');
    setPreferredSubtitleLang('ger');
    expect(getPreferredAudioLang()).toBe('tur');
    expect(getPreferredSubtitleLang()).toBe('ger');
    expect(isSubtitleLangDefault()).toBe(false);
  });

  it('keeps "no preference" and "off" available as real choices', () => {
    // Empty is what the dropdowns submit for those options; it must survive a
    // round-trip rather than falling back to the English default.
    setPreferredAudioLang('');
    setPreferredSubtitleLang('');
    expect(getPreferredAudioLang()).toBe('');
    expect(getPreferredSubtitleLang()).toBe('');
    // And it counts as a deliberate choice, so the subtitled-category fallback
    // does not override it.
    expect(isSubtitleLangDefault()).toBe(false);
  });

  it('can be returned to English after choosing otherwise', () => {
    setPreferredSubtitleLang('');
    setPreferredSubtitleLang('eng');
    expect(getPreferredSubtitleLang()).toBe('eng');
  });
});
