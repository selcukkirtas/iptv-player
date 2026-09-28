import { useEffect, useMemo, useRef, useState } from 'react';
import { categoryGroupHeading, prefixOf } from '../category-labels';

interface Props {
  label: string;
  /** All category names available in this section (unfiltered). */
  allGroups: string[];
  /** null => unrestricted (all), array => only these categories. */
  value: string[] | null;
  onChange: (next: string[] | null) => void;
}

/** One collapsible prefix group with a bulk (tri-state) header checkbox. */
function PrefixGroup({
  prefix,
  items,
  selected,
  open,
  onToggleGroup,
  onToggleItem,
}: {
  prefix: string;
  items: string[];
  selected: Set<string>;
  open: boolean;
  onToggleGroup: (on: boolean) => void;
  onToggleItem: (group: string, on: boolean) => void;
}) {
  const heading = useMemo(
    () => categoryGroupHeading(prefix, items),
    [prefix, items],
  );
  const selCount = items.reduce((n, g) => n + (selected.has(g) ? 1 : 0), 0);
  const all = selCount === items.length;
  const some = selCount > 0 && !all;
  const headRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headRef.current) headRef.current.indeterminate = some;
  }, [some]);

  return (
    <details className="prefix-group" open={open}>
      <summary className="prefix-summary">
        <input
          ref={headRef}
          type="checkbox"
          aria-label={
            heading
              ? `Select all ${prefix} — ${heading}`
              : `Select all ${prefix}`
          }
          checked={all}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onToggleGroup(e.target.checked)}
        />
        <span className="prefix-name">{prefix}</span>
        {heading && <span className="prefix-title">{heading}</span>}
        <span className="count-note">
          {selCount}/{items.length}
        </span>
      </summary>
      <div className="prefix-items">
        {items.map((g) => (
          <label key={g} className="cat-selector-item">
            <input
              type="checkbox"
              checked={selected.has(g)}
              onChange={(e) => onToggleItem(g, e.target.checked)}
            />
            {g}
          </label>
        ))}
      </div>
    </details>
  );
}

/**
 * Per-section category permission editor. Categories are grouped by their
 * provider prefix (country/section code) so a whole prefix — e.g. every
 * "TR ➾ …" category — can be toggled at once, with a filter and bulk actions.
 */
export function CategorySelector({ label, allGroups, value, onChange }: Props) {
  const [filter, setFilter] = useState('');
  const unrestricted = value === null;
  const selected = useMemo(() => new Set(value ?? []), [value]);
  const filterActive = filter.trim().length > 0;

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? allGroups.filter((g) => g.toLowerCase().includes(q)) : allGroups;
  }, [allGroups, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const g of visible) {
      const p = prefixOf(g);
      const list = map.get(p);
      if (list) list.push(g);
      else map.set(p, [g]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible]);

  function setMany(groups: string[], on: boolean) {
    const next = new Set(selected);
    for (const g of groups) {
      if (on) next.add(g);
      else next.delete(g);
    }
    onChange([...next]);
  }

  return (
    <fieldset className="cat-selector">
      <legend>{label}</legend>

      <label className="control-row">
        <input
          type="checkbox"
          checked={unrestricted}
          onChange={(e) => onChange(e.target.checked ? null : [])}
        />
        All categories (unrestricted)
      </label>

      {!unrestricted && (
        <>
          <div className="cat-selector-toolbar">
            <input
              type="text"
              placeholder={`Filter ${label.toLowerCase()} (e.g. TR)…`}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <button
              type="button"
              className="secondary btn-sm"
              onClick={() => setMany(visible, true)}
              disabled={visible.length === 0}
            >
              {filterActive ? `Add ${visible.length} shown` : 'Select all'}
            </button>
            <button
              type="button"
              className="secondary btn-sm"
              onClick={() => setMany(visible, false)}
              disabled={visible.length === 0}
            >
              {filterActive ? 'Remove shown' : 'Clear all'}
            </button>
            <span className="count-note">{selected.size} selected</span>
          </div>

          <div className="cat-selector-groups">
            {grouped.length === 0 ? (
              <p className="count-note">No categories.</p>
            ) : (
              grouped.map(([prefix, items]) => (
                <PrefixGroup
                  key={`${prefix}-${filterActive}`}
                  prefix={prefix}
                  items={items}
                  selected={selected}
                  open={filterActive}
                  onToggleGroup={(on) => setMany(items, on)}
                  onToggleItem={(g, on) => setMany([g], on)}
                />
              ))
            )}
          </div>
        </>
      )}
    </fieldset>
  );
}
