import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { invalidateForProfileSwitch, useSession } from './api/hooks';
import { logout, onUnauthenticated } from './api/client';
import { ChannelsPage } from './pages/ChannelsPage';
import { ContinueWatchingPage } from './pages/ContinueWatchingPage';
import { DatabasePage } from './pages/DatabasePage';
import { FavoritesPage } from './pages/FavoritesPage';
import { MoviesPage } from './pages/MoviesPage';
import { MovieWatchPage } from './pages/MovieWatchPage';
import { PlayerPage } from './pages/PlayerPage';
import { ProfilePicker } from './pages/ProfilePicker';
import { SeriesDetailPage } from './pages/SeriesDetailPage';
import { SeriesPage } from './pages/SeriesPage';
import { SettingsPage } from './pages/SettingsPage';
import { AdminPage } from './pages/AdminPage';

/**
 * The listing/home route for whatever section the user is currently in. Used on
 * profile switch so we never land a new profile inside a specific movie/series/
 * channel it may not be allowed to watch — we drop to that section's home.
 */
function sectionHome(pathname: string): string {
  if (pathname.startsWith('/movies')) return '/movies';
  if (pathname.startsWith('/series')) return '/series';
  if (pathname.startsWith('/favorites')) return '/favorites';
  if (pathname.startsWith('/continue')) return '/continue';
  return '/'; // channels, player (/watch), and everything else
}

export function App() {
  const location = useLocation();

  // The administration console is a separate application behind its own
  // password: it must render before the viewer profile gate, never inside it.
  if (location.pathname.startsWith('/admin')) {
    return <AdminPage />;
  }
  return <ViewerApp />;
}

function ViewerApp() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const sessionQuery = useSession();
  const currentUser = sessionQuery.data?.user ?? null;

  // The server is the authority on who we are: if a session expires or is
  // revoked mid-use, every screen drops back to the picker at once.
  useEffect(
    () =>
      onUnauthenticated(() => {
        qc.setQueryData(['session'], { user: null });
      }),
    [qc],
  );

  function onSignedIn() {
    invalidateForProfileSwitch(qc);
    void qc.invalidateQueries({ queryKey: ['session'] });
    // Leave any specific movie/series/channel page; the new profile may not be
    // allowed to watch it. Drop to the current section's home instead.
    navigate(sectionHome(location.pathname), { replace: true });
  }

  async function switchProfile() {
    await logout().catch(() => undefined);
    qc.setQueryData(['session'], { user: null });
    invalidateForProfileSwitch(qc);
  }

  if (sessionQuery.isLoading) {
    return (
      <div className="picker-screen">
        <p role="status">Loading…</p>
      </div>
    );
  }

  if (!currentUser) {
    return <ProfilePicker onSignedIn={onSignedIn} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="brand">📺 IPTV Player</span>
        <nav className="app-nav">
          <NavLink to="/" end>
            Channels
          </NavLink>
          <NavLink to="/movies">Movies</NavLink>
          <NavLink to="/series">Series</NavLink>
          <NavLink to="/continue">Continue</NavLink>
          <NavLink to="/favorites">Favorites</NavLink>
          <NavLink to="/database">Database</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <button
          type="button"
          className="profile-chip"
          onClick={() => void switchProfile()}
          title="Sign out and switch profile"
        >
          <span className="avatar avatar-sm">
            {currentUser.name.charAt(0).toUpperCase()}
          </span>
          <span className="profile-chip-name">{currentUser.name}</span>
          <span className="profile-chip-switch">Switch</span>
        </button>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<ChannelsPage />} />
          <Route path="/watch/:id" element={<PlayerPage />} />
          <Route path="/movies" element={<MoviesPage />} />
          <Route path="/movies/:id" element={<MovieWatchPage />} />
          <Route path="/series" element={<SeriesPage />} />
          <Route path="/series/:id" element={<SeriesDetailPage />} />
          <Route path="/continue" element={<ContinueWatchingPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          {/* Playlist import and profile management live at /admin, behind
              their own password — never in the viewer app. */}
          <Route path="/database" element={<DatabasePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
