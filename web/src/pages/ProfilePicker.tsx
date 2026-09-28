import { useState, type FormEvent } from 'react';
import { useProfiles } from '../api/hooks';
import { login } from '../api/client';
import type { PickerUser } from '../api/types';

interface Props {
  /** Called once the server has accepted the PIN and issued a session. */
  onSignedIn: () => void;
}

/**
 * Full-screen "who's watching?" gate.
 *
 * Picking a profile is a real sign-in: the PIN goes to the server, which
 * answers with a session cookie. Nothing here can grant access on its own.
 */
export function ProfilePicker({ onSignedIn }: Props) {
  const profilesQuery = useProfiles();
  const [pinFor, setPinFor] = useState<PickerUser | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(user: PickerUser, withPin: string) {
    setBusy(true);
    setError(null);
    try {
      await login(user.id, withPin);
      onSignedIn();
    } catch (err) {
      setError((err as Error).message);
      setPinFor(user);
    } finally {
      setBusy(false);
    }
  }

  function choose(user: PickerUser) {
    if (user.hasPin) {
      setPinFor(user);
      setPin('');
      setError(null);
    } else {
      void signIn(user, '');
    }
  }

  function submitPin(e: FormEvent) {
    e.preventDefault();
    if (pinFor) void signIn(pinFor, pin);
  }

  if (pinFor) {
    return (
      <div className="picker-screen">
        <div className="picker-inner">
          <form className="import-form pin-gate" onSubmit={submitPin}>
            <h2>🔒 {pinFor.name}</h2>
            <p className="form-hint">Enter this profile's PIN to continue.</p>
            <div className="control">
              <label htmlFor="profile-pin">PIN</label>
              <input
                id="profile-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError(null);
                }}
              />
            </div>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button type="submit" disabled={busy}>
                {busy ? 'Checking…' : 'Unlock'}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setPinFor(null);
                  setError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const profiles = profilesQuery.data ?? [];

  return (
    <div className="picker-screen">
      <div className="picker-inner">
        <h1 className="picker-title">Who's watching?</h1>

        {profilesQuery.isLoading ? (
          <p role="status">Loading…</p>
        ) : profiles.length === 0 ? (
          <p className="count-note">No profiles yet.</p>
        ) : (
          <ul className="picker-grid" aria-label="Profiles">
            {profiles.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  className="picker-profile"
                  disabled={busy}
                  onClick={() => choose(user)}
                >
                  <span
                    className="avatar"
                    style={{ background: user.color ?? '#4f8cff' }}
                  >
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="picker-name">
                    {user.name}
                    {user.hasPin && <span className="picker-lock"> 🔒</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && !pinFor && (
          <p role="alert" className="error">
            {error}
          </p>
        )}

        <p className="count-note">
          Profiles are managed from the <strong>Profiles</strong> tab by an
          administrator.
        </p>
      </div>
    </div>
  );
}
