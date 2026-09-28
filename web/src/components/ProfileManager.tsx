import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '../api/client';
import {
  useCreateUser,
  useDeleteUser,
  useUpdateUser,
  useUsers,
} from '../api/hooks';
import type { AllowedGroups, User } from '../api/types';
import { isLockedGroup } from '../settings';
import { PROFILE_COLORS } from '../users';
import { CategorySelector } from './CategorySelector';

interface EditState {
  id?: string;
  name: string;
  color: string;
  kids: boolean;
  hideAdult: boolean;
  disabled: boolean;
  /** New PIN value being typed (blank = keep existing on edit). */
  pin: string;
  /** Whether the profile already had a PIN when editing began. */
  hadPin: boolean;
  /** Whether to clear an existing PIN on save. */
  removePin: boolean;
  allowed: AllowedGroups;
}

const BLANK: EditState = {
  name: '',
  color: PROFILE_COLORS[0],
  kids: false,
  hideAdult: false,
  disabled: false,
  pin: '',
  hadPin: false,
  removePin: false,
  allowed: { channels: null, movies: null, series: null },
};

/** Drop age-restricted categories from a list (used for kids profiles). */
function withoutAdult(groups: string[]): string[] {
  return groups.filter((g) => !isLockedGroup(g));
}

function summarize(user: User): string {
  const parts = (
    [
      ['Channels', user.allowed.channels],
      ['Movies', user.allowed.movies],
      ['Series', user.allowed.series],
    ] as const
  ).map(([label, v]) =>
    v === null ? `${label}: all` : `${label}: ${v.length}`,
  );
  if (user.kids) parts.unshift('Kids');
  else if (user.hideAdult) parts.unshift('No adult');
  if (user.disabled) parts.unshift('Disabled');
  return parts.join(' · ');
}

/**
 * Profile management: create/edit/delete viewer profiles and set which
 * categories each may see, per section.
 *
 * There is no lock on this component any more. It used to compare a PIN held in
 * local storage, which any viewer could read or overwrite; the real gate is now
 * the server refusing `/api/users` to non-administrators, and the /users route
 * only being offered to one.
 */
export function ProfileManager() {
  const [editPinError, setEditPinError] = useState('');
  const [editing, setEditing] = useState<EditState | null>(null);

  const usersQuery = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const channelGroups = useQuery({
    queryKey: ['all-channel-groups'],
    queryFn: api.getAllChannelGroups,
  });
  const movieGroups = useQuery({
    queryKey: ['all-movie-groups'],
    queryFn: api.getAllMovieGroups,
  });
  const seriesGroups = useQuery({
    queryKey: ['all-series-groups'],
    queryFn: api.getAllSeriesGroups,
  });

  function startEdit(user: User) {
    setEditing({
      id: user.id,
      name: user.name,
      color: user.color ?? PROFILE_COLORS[0],
      kids: user.kids ?? false,
      hideAdult: user.hideAdult ?? false,
      disabled: user.disabled ?? false,
      pin: '',
      hadPin: user.hasPin ?? false,
      removePin: false,
      allowed: user.allowed,
    });
    setEditPinError('');
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const pin = editing.pin.trim();
    if (pin && !/^\d{4,8}$/.test(pin)) {
      setEditPinError('PIN must be 4–8 digits.');
      return;
    }
    // undefined => keep; '' => clear; value => set.
    const pinField = editing.removePin ? '' : pin ? pin : undefined;
    const input = {
      name: editing.name.trim(),
      color: editing.color,
      kids: editing.kids,
      hideAdult: editing.hideAdult,
      disabled: editing.disabled,
      allowed: editing.allowed,
      ...(pinField !== undefined ? { pin: pinField } : {}),
    };
    if (!input.name) return;
    if (editing.id) {
      await updateUser.mutateAsync({ id: editing.id, input });
    } else {
      await createUser.mutateAsync(input);
    }
    setEditing(null);
  }

  /** Suspend or restore a profile in place. */
  async function onToggleEnabled(user: User) {
    await updateUser.mutateAsync({
      id: user.id,
      input: { disabled: !user.disabled },
    });
  }

  async function onDelete(user: User) {
    if (!window.confirm(`Delete profile “${user.name}”?`)) return;
    await deleteUser.mutateAsync(user.id);
  }

  if (editing) {
    const saving = createUser.isPending || updateUser.isPending;
    return (
      <form className="import-form" onSubmit={saveEdit}>
        <h2>{editing.id ? 'Edit profile' : 'New profile'}</h2>

        <div className="control">
          <label htmlFor="profile-name">Name</label>
          <input
            id="profile-name"
            type="text"
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          />
        </div>

        <div className="control">
          <span className="control-label">Colour</span>
          <div className="color-picker">
            {PROFILE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`color-dot${editing.color === c ? ' selected' : ''}`}
                style={{ background: c }}
                aria-label={`Colour ${c}`}
                aria-pressed={editing.color === c}
                onClick={() => setEditing({ ...editing, color: c })}
              />
            ))}
          </div>
        </div>

        <label className="control-row kids-toggle">
          <input
            type="checkbox"
            checked={editing.kids}
            onChange={(e) => setEditing({ ...editing, kids: e.target.checked })}
          />
          <span>
            <strong>Kids profile</strong>
            <span className="count-note">
              {' '}
              — age-restricted (adult) categories are always hidden
            </span>
          </span>
        </label>

        <label className="control-row kids-toggle">
          <input
            type="checkbox"
            checked={editing.kids || editing.hideAdult}
            disabled={editing.kids}
            onChange={(e) =>
              setEditing({ ...editing, hideAdult: e.target.checked })
            }
          />
          <span>
            <strong>Hide adult categories</strong>
            <span className="count-note">
              {' '}
              — for a grown-up who simply does not want that section listed.
              Always on for a kids profile.
            </span>
          </span>
        </label>

        <div className="control">
          <label htmlFor="profile-pin">
            Profile PIN{editing.hadPin ? ' (set)' : ' (optional)'}
          </label>
          <input
            id="profile-pin"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            placeholder={
              editing.removePin
                ? 'PIN will be removed'
                : editing.hadPin
                  ? 'Leave blank to keep current PIN'
                  : '4–8 digits — required to select this profile'
            }
            disabled={editing.removePin}
            value={editing.pin}
            onChange={(e) => {
              setEditing({ ...editing, pin: e.target.value });
              setEditPinError('');
            }}
          />
          {editing.hadPin &&
            (editing.removePin ? (
              <button
                type="button"
                className="linklike"
                onClick={() => setEditing({ ...editing, removePin: false })}
              >
                Undo remove PIN
              </button>
            ) : (
              <button
                type="button"
                className="linklike"
                onClick={() =>
                  setEditing({ ...editing, removePin: true, pin: '' })
                }
              >
                Remove PIN
              </button>
            ))}
          {editPinError && (
            <p role="alert" className="error">
              {editPinError}
            </p>
          )}
        </div>

        <CategorySelector
          label="Channels"
          allGroups={
            editing.kids
              ? withoutAdult(channelGroups.data ?? [])
              : (channelGroups.data ?? [])
          }
          value={editing.allowed.channels}
          onChange={(channels) =>
            setEditing({
              ...editing,
              allowed: { ...editing.allowed, channels },
            })
          }
        />
        <CategorySelector
          label="Movies"
          allGroups={
            editing.kids
              ? withoutAdult(movieGroups.data ?? [])
              : (movieGroups.data ?? [])
          }
          value={editing.allowed.movies}
          onChange={(movies) =>
            setEditing({ ...editing, allowed: { ...editing.allowed, movies } })
          }
        />
        <CategorySelector
          label="Series"
          allGroups={
            editing.kids
              ? withoutAdult(seriesGroups.data ?? [])
              : (seriesGroups.data ?? [])
          }
          value={editing.allowed.series}
          onChange={(series) =>
            setEditing({ ...editing, allowed: { ...editing.allowed, series } })
          }
        />

        <div className="form-actions">
          <button type="submit" disabled={saving || !editing.name.trim()}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setEditing(null)}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="import-form">
      <div className="manager-head">
        <h2>Profiles</h2>
        <button
          type="button"
          onClick={() => {
            setEditPinError('');
            setEditing({ ...BLANK });
          }}
        >
          + Add profile
        </button>
      </div>

      {usersQuery.isLoading ? (
        <p role="status">Loading…</p>
      ) : usersQuery.data && usersQuery.data.length > 0 ? (
        <ul className="profile-list">
          {usersQuery.data.map((user) => (
            <li
              key={user.id}
              className={`profile-row${user.disabled ? ' profile-row-off' : ''}`}
            >
              <span
                className="avatar avatar-sm"
                style={{ background: user.color ?? '#4f8cff' }}
              >
                {user.name.charAt(0).toUpperCase()}
              </span>
              <span className="profile-row-info">
                <strong>
                  {user.name}
                  {user.hasPin && ' 🔒'}
                </strong>
                <span className="count-note">{summarize(user)}</span>
              </span>
              <span className="profile-row-actions">
                <button type="button" onClick={() => startEdit(user)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void onToggleEnabled(user)}
                  disabled={updateUser.isPending}
                >
                  {user.disabled ? 'Enable' : 'Disable'}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onDelete(user)}
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="count-note">No profiles yet. Add one to get started.</p>
      )}
    </div>
  );
}
