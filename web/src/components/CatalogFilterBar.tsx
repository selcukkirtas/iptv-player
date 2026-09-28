import type { CatalogFilterOptions } from '../api/types';
import { langLabel, type CatalogFilters } from '../catalog';

interface Props {
  kind: 'movies' | 'series';
  groups: string[];
  filters: CatalogFilters;
  options?: CatalogFilterOptions;
  loading?: boolean;
}

export function CatalogFilterBar({
  kind,
  groups,
  filters,
  options,
  loading,
}: Props) {
  const prefix = kind === 'movies' ? 'movie' : 'series';
  const yearOptions = options?.years ?? [];
  const genreList = options?.genres ?? [];
  const actorList = options?.actors ?? [];
  const directorList = options?.directors ?? [];
  const audioLangs = options?.audioLangs ?? [];

  return (
    <form
      className="controls"
      role="search"
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="control">
        <label htmlFor={`${prefix}-search`}>Search</label>
        <input
          id={`${prefix}-search`}
          type="text"
          placeholder={`Search ${kind}…`}
          value={filters.query}
          onChange={(e) => filters.setQuery(e.target.value)}
        />
      </div>

      <div className="control">
        <label htmlFor={`${prefix}-group`}>Category</label>
        <select
          id={`${prefix}-group`}
          value={filters.group}
          onChange={(e) => filters.setGroup(e.target.value)}
        >
          <option value="">All categories</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

      <div className="control">
        <label htmlFor={`${prefix}-year`}>Year</label>
        <select
          id={`${prefix}-year`}
          value={filters.year}
          onChange={(e) => filters.setYear(e.target.value)}
        >
          <option value="">Any year</option>
          {yearOptions.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      <div className="control">
        <label htmlFor={`${prefix}-genre`}>Genre</label>
        <select
          id={`${prefix}-genre`}
          value={filters.genre}
          onChange={(e) => filters.setGenre(e.target.value)}
        >
          <option value="">Any genre</option>
          {genreList.map((genre) => (
            <option key={genre} value={genre}>
              {genre}
            </option>
          ))}
        </select>
      </div>

      {kind === 'movies' && audioLangs.length > 0 && (
        <div className="control">
          <label htmlFor={`${prefix}-audio`}>Ses dili</label>
          <select
            id={`${prefix}-audio`}
            value={filters.audioLang}
            onChange={(e) => filters.setAudioLang(e.target.value)}
          >
            <option value="">Any language</option>
            {audioLangs.map((code) => (
              <option key={code} value={code}>
                {langLabel(code)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="control">
        <label htmlFor={`${prefix}-subtitled`}>Altyazılı</label>
        <label className="checkbox-inline">
          <input
            id={`${prefix}-subtitled`}
            type="checkbox"
            checked={filters.subtitled === '1'}
            onChange={(e) => filters.setSubtitled(e.target.checked ? '1' : '')}
          />
          <span>Sadece altyazılı</span>
        </label>
      </div>

      <div className="control">
        <label htmlFor={`${prefix}-director`}>Director</label>
        <input
          id={`${prefix}-director`}
          list={`${prefix}-directors`}
          value={filters.director}
          onChange={(e) => filters.setDirector(e.target.value)}
          placeholder="Any director"
        />
        <datalist id={`${prefix}-directors`}>
          {directorList.map((director) => (
            <option key={director} value={director} />
          ))}
        </datalist>
      </div>

      <div className="control">
        <label htmlFor={`${prefix}-actor`}>Actor</label>
        <input
          id={`${prefix}-actor`}
          list={`${prefix}-actors`}
          value={filters.actor}
          onChange={(e) => filters.setActor(e.target.value)}
          placeholder="Any actor"
        />
        <datalist id={`${prefix}-actors`}>
          {actorList.map((actor) => (
            <option key={actor} value={actor} />
          ))}
        </datalist>
      </div>

      <div className="control">
        <label htmlFor={`${prefix}-min-rating`}>TMDB min</label>
        <input
          id={`${prefix}-min-rating`}
          type="number"
          min={options?.ratingRange.min ?? 0}
          max={options?.ratingRange.max ?? 10}
          step="0.1"
          value={filters.minRating}
          onChange={(e) => filters.setMinRating(e.target.value)}
          placeholder="0"
        />
      </div>

      <div className="control">
        <label htmlFor={`${prefix}-max-rating`}>TMDB max</label>
        <input
          id={`${prefix}-max-rating`}
          type="number"
          min={options?.ratingRange.min ?? 0}
          max={options?.ratingRange.max ?? 10}
          step="0.1"
          value={filters.maxRating}
          onChange={(e) => filters.setMaxRating(e.target.value)}
          placeholder="10"
        />
      </div>

      <div className="control">
        <label htmlFor={`${prefix}-min-imdb`}>IMDB min</label>
        <input
          id={`${prefix}-min-imdb`}
          type="number"
          min={options?.imdbScoreRange.min ?? 0}
          max={options?.imdbScoreRange.max ?? 10}
          step="0.1"
          value={filters.minImdbScore}
          onChange={(e) => filters.setMinImdbScore(e.target.value)}
          placeholder="0"
        />
      </div>

      <div className="control">
        <label htmlFor={`${prefix}-max-imdb`}>IMDB max</label>
        <input
          id={`${prefix}-max-imdb`}
          type="number"
          min={options?.imdbScoreRange.min ?? 0}
          max={options?.imdbScoreRange.max ?? 10}
          step="0.1"
          value={filters.maxImdbScore}
          onChange={(e) => filters.setMaxImdbScore(e.target.value)}
          placeholder="10"
        />
      </div>

      {filters.active && (
        <button
          type="button"
          className="secondary btn-sm clear-search"
          onClick={filters.clear}
        >
          Clear
        </button>
      )}

      {loading && <p className="count-note">Loading filter options…</p>}
    </form>
  );
}
