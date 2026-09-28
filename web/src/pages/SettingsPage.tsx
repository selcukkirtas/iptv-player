import { useState } from 'react';
import {
  COMMON_LANGUAGES,
  getAutoplayNext,
  getPreferredAudioLang,
  getPreferredSubtitleLang,
  setAutoplayNext,
  setPreferredAudioLang,
  setPreferredSubtitleLang,
} from '../settings';

export function SettingsPage() {
  const [audioLang, setAudioLang] = useState(getPreferredAudioLang());
  const [subLang, setSubLang] = useState(getPreferredSubtitleLang());
  const [autoplay, setAutoplay] = useState(getAutoplayNext());
  const [saved, setSaved] = useState(false);

  function flashSaved() {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  }

  function onAudio(value: string) {
    setAudioLang(value);
    setPreferredAudioLang(value);
    flashSaved();
  }

  function onSub(value: string) {
    setSubLang(value);
    setPreferredSubtitleLang(value);
    flashSaved();
  }

  function onAutoplay(on: boolean) {
    setAutoplay(on);
    setAutoplayNext(on);
    flashSaved();
  }

  return (
    <section>
      <h1>Settings</h1>

      <div className="import-form">
        <h2>Playback</h2>
        <p className="form-hint">
          Both default to <strong>English</strong>: where a film or episode
          offers an English audio track it is chosen, and an English subtitle
          track is turned on. Where it offers neither, playback falls back to
          the first audio track and leaves subtitles off. You can always switch
          tracks from the player.
        </p>

        <div className="control">
          <label htmlFor="pref-audio">Preferred audio language</label>
          <select
            id="pref-audio"
            value={audioLang}
            onChange={(e) => onAudio(e.target.value)}
          >
            <option value="">No preference (first track)</option>
            {COMMON_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div className="control">
          <label htmlFor="pref-sub">Preferred subtitle language</label>
          <select
            id="pref-sub"
            value={subLang}
            onChange={(e) => onSub(e.target.value)}
          >
            <option value="">Off</option>
            {COMMON_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div className="control control-row">
          <input
            id="autoplay-next"
            type="checkbox"
            checked={autoplay}
            onChange={(e) => onAutoplay(e.target.checked)}
          />
          <label htmlFor="autoplay-next">
            Autoplay next episode when one finishes
          </label>
        </div>

        {saved && (
          <p role="status" className="success">
            Saved.
          </p>
        )}
      </div>

      <div className="import-form">
        <h2>Parental controls</h2>
        <p className="form-hint">
          These are set per profile, not per device. An administrator marks a
          profile as <strong>kids</strong>, or gives it an explicit list of
          categories, from the <strong>/admin</strong> console — the server then
          enforces it, so it holds on every television in the house.
        </p>
        <p className="form-hint">
          The browser-side PIN that used to live here has been removed: it hid
          categories in this tab only, while the content stayed reachable, which
          made it look like protection it never provided.
        </p>
      </div>
    </section>
  );
}
