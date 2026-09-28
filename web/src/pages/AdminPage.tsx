import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/client';
import { ProfileManager } from '../components/ProfileManager';
import { ImportPage } from './ImportPage';

type Tab = 'profiles' | 'import' | 'password';

/**
 * The management console at `/admin`.
 *
 * It lives outside the viewer app entirely — its own password, its own cookie,
 * its own screen. Nobody signing in to watch television passes through here,
 * and the household's profile picker never mentions it.
 */
export function AdminPage() {
  const qc = useQueryClient();
  const statusQuery = useQuery({
    queryKey: ['admin-status'],
    queryFn: api.getAdminStatus,
    retry: false,
  });
  const [tab, setTab] = useState<Tab>('profiles');

  const status = statusQuery.data;

  function refreshStatus() {
    void qc.invalidateQueries({ queryKey: ['admin-status'] });
  }

  if (statusQuery.isLoading) {
    return (
      <div className="picker-screen">
        <p role="status">Loading…</p>
      </div>
    );
  }

  if (!status?.signedIn) {
    return (
      <AdminGate
        configured={status?.configured ?? true}
        minLength={status?.minPasswordLength ?? 8}
        onSignedIn={refreshStatus}
      />
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="brand">🔧 Administration</span>
        <nav className="app-nav">
          <button
            type="button"
            className={tab === 'profiles' ? 'tab-on' : 'tab-off'}
            onClick={() => setTab('profiles')}
          >
            Profiles
          </button>
          <button
            type="button"
            className={tab === 'import' ? 'tab-on' : 'tab-off'}
            onClick={() => setTab('import')}
          >
            Playlist
          </button>
          <button
            type="button"
            className={tab === 'password' ? 'tab-on' : 'tab-off'}
            onClick={() => setTab('password')}
          >
            Password
          </button>
        </nav>
        <button
          type="button"
          className="profile-chip"
          onClick={() =>
            void api
              .adminLogout()
              .catch(() => undefined)
              .then(refreshStatus)
          }
        >
          <span className="profile-chip-name">Sign out</span>
        </button>
      </header>

      <main className="app-main">
        {tab === 'profiles' && <ProfileManager />}
        {tab === 'import' && <ImportPage />}
        {tab === 'password' && (
          <ChangePassword minLength={status.minPasswordLength} />
        )}
        <p className="count-note admin-return">
          <a href="/">← Back to the player</a>
        </p>
      </main>
    </div>
  );
}

/** Sign-in, or first-run password choice when none has been set yet. */
function AdminGate({
  configured,
  minLength,
  onSignedIn,
}: {
  configured: boolean;
  minLength: number;
  onSignedIn: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: (value: string) =>
      configured ? api.adminLogin(value) : api.adminSetup(value),
    onSuccess: onSignedIn,
    onError: (err: Error) => setError(err.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!configured && password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    submit.mutate(password);
  }

  return (
    <div className="picker-screen">
      <div className="picker-inner">
        <form className="import-form pin-gate" onSubmit={onSubmit}>
          <h2>🔒 {configured ? 'Administration' : 'Set up administration'}</h2>
          <p className="form-hint">
            {configured
              ? 'Enter the administrator password.'
              : `No administrator password has been set yet. Choose one (at least ${minLength} characters) — it protects profiles and the playlist.`}
          </p>

          <div className="control">
            <label htmlFor="admin-password">Password</label>
            <input
              id="admin-password"
              type="password"
              autoComplete={configured ? 'current-password' : 'new-password'}
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
            />
          </div>

          {!configured && (
            <div className="control">
              <label htmlFor="admin-password-confirm">Confirm password</label>
              <input
                id="admin-password-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setError(null);
                }}
              />
            </div>
          )}

          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}

          <div className="form-actions">
            <button type="submit" disabled={submit.isPending || !password}>
              {submit.isPending
                ? 'Checking…'
                : configured
                  ? 'Sign in'
                  : 'Set password'}
            </button>
            <a className="secondary btn-sm" href="/">
              Back to the player
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}

function ChangePassword({ minLength }: { minLength: number }) {
  const qc = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: () => api.changeAdminPassword(current, next),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-status'] }),
    onError: (err: Error) => setError(err.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    change.mutate();
  }

  return (
    <form className="import-form" onSubmit={onSubmit}>
      <h2>Administrator password</h2>
      <p className="form-hint">
        Changing it signs every administration session out, including this one.
      </p>

      <div className="control">
        <label htmlFor="admin-current">Current password</label>
        <input
          id="admin-current"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </div>
      <div className="control">
        <label htmlFor="admin-next">New password</label>
        <input
          id="admin-next"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <p className="form-hint">At least {minLength} characters.</p>
      </div>
      <div className="control">
        <label htmlFor="admin-next-confirm">Confirm new password</label>
        <input
          id="admin-next-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <button type="submit" disabled={change.isPending || !current || !next}>
        {change.isPending ? 'Saving…' : 'Change password'}
      </button>
    </form>
  );
}
