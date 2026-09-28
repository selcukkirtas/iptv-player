import { useEffect, useRef, useState } from 'react';
import {
  useImportPlaylistUrl,
  useImportXtream,
  useMetadataSync,
  usePlaylistMeta,
  useTestXtream,
  useUploadPlaylist,
  useXtreamAccount,
} from '../api/hooks';

export function ImportPage() {
  const [xtream, setXtream] = useState({
    host: '',
    username: '',
    password: '',
  });
  const [url, setUrl] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const meta = usePlaylistMeta();
  const savedAccount = useXtreamAccount();
  const testXtream = useTestXtream();
  const importXtream = useImportXtream();
  const importUrl = useImportPlaylistUrl();
  const uploadFile = useUploadPlaylist();
  const metadataSync = useMetadataSync();

  const busy =
    testXtream.isPending ||
    importXtream.isPending ||
    importUrl.isPending ||
    uploadFile.isPending ||
    metadataSync.isPending;
  const error =
    testXtream.error ??
    importXtream.error ??
    importUrl.error ??
    uploadFile.error;
  const lastResult = importXtream.data ?? importUrl.data ?? uploadFile.data;

  // Pre-fill the Xtream form once with the saved account, without clobbering
  // anything the user has already started typing.
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !savedAccount.data) return;
    hydrated.current = true;
    setXtream({
      host: savedAccount.data.host,
      username: savedAccount.data.username,
      password: savedAccount.data.password,
    });
  }, [savedAccount.data]);

  const xtreamReady =
    xtream.host.trim() && xtream.username.trim() && xtream.password.trim();

  function submitTestXtream(e: React.FormEvent) {
    e.preventDefault();
    if (xtreamReady) {
      setTestMessage('Testing connection...');
      testXtream.mutate(
        {
          host: xtream.host.trim(),
          username: xtream.username.trim(),
          password: xtream.password.trim(),
        },
        {
          onSuccess: (result) => {
            if (result.ok) {
              setTestMessage(`✅ ${result.message}`);
              // Auto-import on successful test
              setTimeout(() => {
                importXtream.mutate({
                  host: xtream.host.trim(),
                  username: xtream.username.trim(),
                  password: xtream.password.trim(),
                });
              }, 500);
            } else {
              setTestMessage(`❌ ${result.message}`);
            }
          },
          onError: () => {
            setTestMessage('❌ Connection test failed');
          },
        },
      );
    }
  }

  function submitXtream(e: React.FormEvent) {
    e.preventDefault();
    if (xtreamReady) {
      importXtream.mutate({
        host: xtream.host.trim(),
        username: xtream.username.trim(),
        password: xtream.password.trim(),
      });
    }
  }

  function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    if (url.trim()) importUrl.mutate(url.trim());
  }

  function submitFile(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (file) uploadFile.mutate(file);
  }

  function triggerMetadataSync() {
    setSyncMessage('');
    metadataSync.mutate(undefined, {
      onSuccess: () => setSyncMessage('TMDB metadata sync started.'),
    });
  }

  return (
    <section>
      <h1>Import Playlist</h1>

      <div className="current-meta" role="status">
        {meta.data && meta.data.channelCount > 0 ? (
          <div className="stack">
            <p>
              Current playlist:{' '}
              <strong>{meta.data.channelCount.toLocaleString()}</strong>{' '}
              channels
              {meta.data.movieCount ? (
                <>
                  , <strong>{meta.data.movieCount.toLocaleString()}</strong>{' '}
                  movies
                </>
              ) : null}
              {meta.data.seriesCount ? (
                <>
                  , <strong>{meta.data.seriesCount.toLocaleString()}</strong>{' '}
                  series
                </>
              ) : null}
              {meta.data.importedAt && (
                <>
                  {' '}
                  (imported {new Date(meta.data.importedAt).toLocaleString()})
                </>
              )}
              .
            </p>
            <button
              type="button"
              className="secondary"
              onClick={triggerMetadataSync}
              disabled={busy}
            >
              {metadataSync.isPending ? 'Syncing TMDB…' : 'Sync TMDB metadata'}
            </button>
          </div>
        ) : (
          <div className="stack">
            <p>No playlist loaded yet.</p>
            <button
              type="button"
              className="secondary"
              onClick={triggerMetadataSync}
              disabled={busy}
            >
              {metadataSync.isPending ? 'Syncing TMDB…' : 'Sync TMDB metadata'}
            </button>
          </div>
        )}
      </div>

      {syncMessage && (
        <p role="status" className="success">
          {syncMessage}
        </p>
      )}

      <form className="import-form" onSubmit={submitXtream}>
        <h2>Xtream Codes</h2>
        <p className="form-hint">
          The usual way to connect a provider subscription. Enter the host,
          username and password from your provider.
        </p>
        <p className="form-hint">
          Paste the panel base URL only, not <code>xmltv.php</code> or{' '}
          <code>player_api.php</code>.
        </p>
        <div className="control">
          <label htmlFor="xtream-host">Host URL</label>
          <input
            id="xtream-host"
            type="url"
            placeholder="http://example.live:8080"
            value={xtream.host}
            onChange={(e) => setXtream({ ...xtream, host: e.target.value })}
          />
        </div>
        <div className="control">
          <label htmlFor="xtream-user">Username</label>
          <input
            id="xtream-user"
            type="text"
            autoComplete="username"
            value={xtream.username}
            onChange={(e) => setXtream({ ...xtream, username: e.target.value })}
          />
        </div>
        <div className="control">
          <label htmlFor="xtream-pass">Password</label>
          <input
            id="xtream-pass"
            type="password"
            autoComplete="current-password"
            value={xtream.password}
            onChange={(e) => setXtream({ ...xtream, password: e.target.value })}
          />
        </div>
        <div className="button-group">
          <button
            type="button"
            onClick={submitTestXtream}
            disabled={busy || !xtreamReady}
          >
            {testXtream.isPending ? 'Testing…' : 'Test Connection'}
          </button>
          <button type="submit" disabled={busy || !xtreamReady}>
            {importXtream.isPending ? 'Connecting…' : 'Connect'}
          </button>
        </div>
        {testMessage && (
          <p
            className={`status-message ${testMessage.startsWith('✅') ? 'success' : 'error'}`}
          >
            {testMessage}
          </p>
        )}
      </form>

      <form className="import-form" onSubmit={submitUrl}>
        <h2>From M3U URL</h2>
        <div className="control">
          <label htmlFor="playlist-url">M3U / M3U8 URL</label>
          <input
            id="playlist-url"
            type="url"
            placeholder="http://provider.example/get.php?type=m3u_plus…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <button type="submit" disabled={busy || !url.trim()}>
          {importUrl.isPending ? 'Importing…' : 'Import from URL'}
        </button>
      </form>

      <form className="import-form" onSubmit={submitFile}>
        <h2>From file</h2>
        <div className="control">
          <label htmlFor="playlist-file">M3U file</label>
          <input
            id="playlist-file"
            type="file"
            accept=".m3u,.m3u8"
            ref={fileRef}
          />
        </div>
        <button type="submit" disabled={busy}>
          {uploadFile.isPending ? 'Uploading…' : 'Upload file'}
        </button>
      </form>

      {error && (
        <p role="alert" className="error">
          {(error as Error).message}
        </p>
      )}
      {lastResult && !error && (
        <p role="status" className="success">
          Imported {lastResult.channelCount} channels.
        </p>
      )}
    </section>
  );
}
