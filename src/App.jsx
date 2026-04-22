import { useEffect, useMemo, useState } from 'react';
import { LastFmAPI, ItunesAPI } from './lib/api';
import { Charts } from './lib/charts';

const LS_USERNAME = 'hv_username';
const LS_APIKEY = 'hv_apikey';
const LS_THEME = 'hv_theme';

const THEMES = ['neon', 'sunset', 'mint', 'light'];

const PERIOD_LABELS = {
  '7day': 'Last 7 Days',
  '1month': 'Last Month',
  '3month': 'Last 3 Months',
  '6month': 'Last 6 Months',
  '12month': 'Last 12 Months',
  overall: 'All Time',
};

const PERIOD_OPTIONS = [
  { value: '7day', label: '7 Days' },
  { value: '1month', label: '1 Month' },
  { value: '3month', label: '3 Months' },
  { value: '6month', label: '6 Months' },
  { value: '12month', label: '12 Months' },
  { value: 'overall', label: 'All Time' },
];

const AVATAR_COLORS = [
  ['#4f046b', '#c026d3'],
  ['#1e3a5f', '#0ea5e9'],
  ['#7f1d1d', '#ef4444'],
  ['#064e3b', '#10b981'],
  ['#7c2d12', '#f97316'],
  ['#1e1b4b', '#6366f1'],
  ['#831843', '#ec4899'],
  ['#0c4a6e', '#38bdf8'],
];

export default function App() {
  const [username, setUsername] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [theme, setTheme] = useState('neon');

  const [period, setPeriod] = useState('7day');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [hasLoaded, setHasLoaded] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [topArtists, setTopArtists] = useState([]);
  const [topTracks, setTopTracks] = useState([]);
  const [recentTracks, setRecentTracks] = useState([]);
  const [genreTags, setGenreTags] = useState([]);

  const [artistArtworkByName, setArtistArtworkByName] = useState({});
  const [trackArtworkByKey, setTrackArtworkByKey] = useState({});
  const [recentArtworkByKey, setRecentArtworkByKey] = useState({});

  useEffect(() => {
    Charts.init();

    const savedUsername = localStorage.getItem(LS_USERNAME) ?? '';
    const savedApiKey = localStorage.getItem(LS_APIKEY) ?? '';
    const savedTheme = localStorage.getItem(LS_THEME) ?? 'neon';

    setUsername(savedUsername);
    setApiKey(savedApiKey);
    setTheme(THEMES.includes(savedTheme) ? savedTheme : 'neon');

    if (savedUsername && savedApiKey) {
      void loadData(savedUsername, savedApiKey, '7day');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!hasLoaded) return;

    if (recentTracks.length) {
      Charts.renderDailyChart(recentTracks);
    }
    if (genreTags.length) {
      Charts.renderGenreChart(genreTags);
    }
    if (topArtists.length) {
      Charts.renderArtistBarChart(topArtists);
    }
  }, [hasLoaded, recentTracks, genreTags, topArtists, theme]);

  useEffect(() => {
    if (!topArtists.length) return;

    let cancelled = false;

    topArtists.forEach(async (artist) => {
      const name = artist.name ?? '';
      if (!name) return;
      const url = await ItunesAPI.getArtistArtwork(name);
      if (!url || cancelled) return;

      setArtistArtworkByName((prev) => {
        if (prev[name]) return prev;
        return { ...prev, [name]: url };
      });
    });

    return () => {
      cancelled = true;
    };
  }, [topArtists]);

  useEffect(() => {
    if (!topTracks.length) return;

    let cancelled = false;

    topTracks.forEach(async (track) => {
      const name = track.name ?? '';
      const artist = track.artist?.name ?? track.artist?.['#text'] ?? '';
      if (!name || !artist) return;

      const url = await ItunesAPI.getTrackArtwork(name, artist);
      if (!url || cancelled) return;

      const key = `${name}___${artist}`;
      setTrackArtworkByKey((prev) => {
        if (prev[key]) return prev;
        return { ...prev, [key]: url };
      });
    });

    return () => {
      cancelled = true;
    };
  }, [topTracks]);

  useEffect(() => {
    if (!recentTracks.length) return;

    let cancelled = false;

    recentTracks.slice(0, 10).forEach(async (track) => {
      const name = track.name ?? '';
      const artist = track.artist?.['#text'] ?? track.artist?.name ?? '';
      if (!name || !artist) return;

      const url = await ItunesAPI.getTrackArtwork(name, artist);
      if (!url || cancelled) return;

      const key = `${name}___${artist}`;
      setRecentArtworkByKey((prev) => {
        if (prev[key]) return prev;
        return { ...prev, [key]: url };
      });
    });

    return () => {
      cancelled = true;
    };
  }, [recentTracks]);

  async function loadData(nextUsername, nextApiKey, periodValue) {
    setLoading(true);
    setError('');

    try {
      const [nextUserInfo, artists, tracks] = await Promise.all([
        LastFmAPI.getUserInfo(nextUsername, nextApiKey),
        LastFmAPI.getTopArtists(nextUsername, nextApiKey, periodValue, 10),
        LastFmAPI.getTopTracks(nextUsername, nextApiKey, periodValue, 10),
      ]);

      const fourteenDaysAgo = Math.floor((Date.now() - 14 * 24 * 60 * 60 * 1000) / 1000);
      const now = Math.floor(Date.now() / 1000);
      const recent = await LastFmAPI.getRecentTracks(nextUsername, nextApiKey, fourteenDaysAgo, now);

      const tags = await loadGenreTags(artists, nextApiKey);

      setUserInfo(nextUserInfo);
      setTopArtists(artists);
      setTopTracks(tracks);
      setRecentTracks(recent);
      setGenreTags(tags);

      setArtistArtworkByName({});
      setTrackArtworkByKey({});
      setRecentArtworkByKey({});

      setHasLoaded(true);
    } catch (err) {
      setError(err?.message || 'An unexpected error occurred. Check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function loadTopData(periodValue) {
    setLoading(true);

    try {
      const [artists, tracks] = await Promise.all([
        LastFmAPI.getTopArtists(username, apiKey, periodValue, 10),
        LastFmAPI.getTopTracks(username, apiKey, periodValue, 10),
      ]);

      const tags = await loadGenreTags(artists, apiKey);

      setTopArtists(artists);
      setTopTracks(tracks);
      setGenreTags(tags);
      setArtistArtworkByName({});
      setTrackArtworkByKey({});
    } catch (err) {
      setError(err?.message || 'Failed to refresh period data.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadClick() {
    const nextUsername = username.trim();
    const nextApiKey = apiKey.trim();

    if (!nextUsername) {
      setError('Please enter your Last.fm username.');
      return;
    }
    if (!nextApiKey || nextApiKey.length < 10) {
      setError('Please enter a valid Last.fm API key.');
      return;
    }

    localStorage.setItem(LS_USERNAME, nextUsername);
    localStorage.setItem(LS_APIKEY, nextApiKey);

    await loadData(nextUsername, nextApiKey, period);
  }

  async function handlePeriodChange(nextPeriod) {
    if (nextPeriod === period) return;

    setPeriod(nextPeriod);

    if (hasLoaded && username && apiKey) {
      await loadTopData(nextPeriod);
    }
  }

  function handleThemeChange(nextTheme) {
    const resolved = THEMES.includes(nextTheme) ? nextTheme : 'neon';
    setTheme(resolved);
    localStorage.setItem(LS_THEME, resolved);
  }

  const periodLabel = useMemo(() => PERIOD_LABELS[period] ?? period, [period]);

  const badge = useMemo(() => {
    const avatarUrl = userInfo?.image?.find((i) => i.size === 'medium')?.['#text'] ?? '';
    const realName = userInfo?.realname || userInfo?.name || username;
    const scrobbles = parseInt(userInfo?.playcount ?? '0', 10);

    return {
      avatarUrl,
      realName,
      scrobblesText: `${scrobbles.toLocaleString()} scrobbles`,
    };
  }, [userInfo, username]);

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <div className="header-brand">
            <span className="header-icon">🎵</span>
            <div>
              <h1 className="header-title">Heavy Rotation</h1>
              <p className="header-subtitle">Your Last.fm Listening Dashboard</p>
            </div>
          </div>
          <div className="header-controls">
            <div className="theme-switcher" role="group" aria-label="Theme selector">
              {THEMES.map((themeName) => {
                const isActive = themeName === theme;
                const label = themeName[0].toUpperCase() + themeName.slice(1);
                return (
                  <button
                    key={themeName}
                    className={`theme-btn ${isActive ? 'active' : ''}`}
                    data-theme={themeName}
                    aria-pressed={isActive}
                    onClick={() => handleThemeChange(themeName)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {hasLoaded && (
              <div id="user-badge" className="user-badge align-items-center">
                {/*{badge.avatarUrl ? (
                  <img id="user-avatar" className="user-avatar" src={badge.avatarUrl} alt="Avatar" />
                ) : null}*/}
                <div className="user-info">
                  {/* <span id="user-realname" className="user-realname">{badge.realName}</span> */}
                  <span id="user-scrobbles" className="user-scrobbles">{badge.scrobblesText}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {!hasLoaded && (
        <section id="config-panel" className="config-panel">
          <div className="config-inner">
            <h2 className="config-title">Connect to Last.fm</h2>
            <p className="config-desc">
              Enter your Last.fm username and a free{' '}
              <a href="https://www.last.fm/api/account/create" target="_blank" rel="noopener">API key</a>{' '}
              to get started.
            </p>

            <div className="config-fields">
              <div className="field-group">
                <label htmlFor="input-username">Username</label>
                <input
                  id="input-username"
                  className="form-control"
                  type="text"
                  placeholder="e.g. rj"
                  autoComplete="off"
                  spellCheck="false"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void handleLoadClick();
                    }
                  }}
                />
              </div>

              <div className="field-group">
                <label htmlFor="input-apikey">API Key</label>
                <input
                  id="input-apikey"
                  className="form-control"
                  type="password"
                  placeholder="32-character API key"
                  autoComplete="off"
                  spellCheck="false"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void handleLoadClick();
                    }
                  }}
                />
              </div>

              <button id="btn-load" className="btn btn-primary" disabled={loading} onClick={() => void handleLoadClick()}>
                {loading ? 'Loading…' : 'Load My Stats'}
              </button>
            </div>

            {error ? (
              <p id="config-error" className="config-error alert alert-danger mb-0" role="alert">{error}</p>
            ) : null}
          </div>
        </section>
      )}

      {hasLoaded && (
        <main id="dashboard" className="dashboard">
          <div className="period-bar">
            <span className="period-label">Show stats for:</span>
            <div className="period-buttons" role="group" aria-label="Time period">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={`btn-period ${period === option.value ? 'active' : ''}`}
                  data-period={option.value}
                  onClick={() => void handlePeriodChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div id="loading-overlay" className="loading-overlay">
              <div className="spinner"></div>
              <p className="loading-text">Fetching your music data…</p>
            </div>
          ) : null}

          <div className="top-sections-row row gx-4">
            <section className="dashboard-section col-12 col-md-4">
              <div className="section-header">
                <h2 className="section-title">🕓 Recent Tracks</h2>
              </div>
              <RecentTracksList tracks={recentTracks.slice(0, 10)} artworkByKey={recentArtworkByKey} />
            </section>

            <section className="dashboard-section col-12 col-md-4">
              <div className="section-header">
                <h2 className="section-title">🎤 Top Artists</h2>
                <span id="artists-period-label" className="section-period">{periodLabel}</span>
              </div>
              <ArtistsGrid artists={topArtists} artworkByName={artistArtworkByName} />
            </section>

            <section className="dashboard-section col-12 col-md-4">
              <div className="section-header">
                <h2 className="section-title">🎶 Top Tracks</h2>
                <span id="tracks-period-label" className="section-period">{periodLabel}</span>
              </div>
              <TopTracksList tracks={topTracks} artworkByKey={trackArtworkByKey} />
            </section>
          </div>

          <section className="dashboard-section charts-section">
            <h2 className="section-title">📊 Listening Analytics</h2>

            <div className="charts-grid row gx-4 gy-4">
              <div className="col-12 col-lg-6">
                <div className="chart-card h-100">
                  <h3 className="chart-title">Daily Scrobbles (Last 14 Days)</h3>
                  <div className="chart-wrapper">
                    <canvas id="chart-daily" aria-label="Daily scrobbles bar chart" role="img"></canvas>
                  </div>
                </div>
              </div>

              <div className="col-12 col-lg-6">
                <div className="chart-card h-100">
                  <h3 className="chart-title">Top Genres</h3>
                  <div className="chart-wrapper">
                    <canvas id="chart-genres" aria-label="Top genres doughnut chart" role="img"></canvas>
                  </div>
                  <div id="genre-legend" className="genre-legend"></div>
                </div>
              </div>
            </div>

            <div className="chart-card stats-card">
              <h3 className="chart-title">Top 10 Artists — Playcount Comparison</h3>
              <div className="chart-wrapper chart-wrapper--tall">
                <canvas id="chart-artist-bar" aria-label="Artist playcount bar chart" role="img"></canvas>
              </div>
            </div>
          </section>
        </main>
      )}

      <footer className="site-footer">
        <p>
          Powered by the{' '}
          <a href="https://www.last.fm/api" target="_blank" rel="noopener">Last.fm API</a> · Data belongs to you 🎧
        </p>
      </footer>
    </>
  );
}

function ArtistsGrid({ artists, artworkByName }) {
  if (!artists.length) {
    return <p className="empty-msg text-muted small mb-0">No artist data for this period.</p>;
  }

  return (
    <div id="artists-grid" className="artists-grid">
      {artists.map((artist, index) => {
        const rank = index + 1;
        const name = artist.name ?? 'Unknown';
        const playcount = parseInt(artist.playcount ?? '0', 10).toLocaleString();
        const imageUrl = artworkByName[name] || getBestImage(artist.image);
        const profileUrl = safeUrl(artist.url);

        const colorPair = AVATAR_COLORS[name.length % AVATAR_COLORS.length];
        const initials = getInitials(name);

        return (
          <a
            key={`${name}-${rank}`}
            className="artist-card d-block h-100 text-decoration-none"
            href={profileUrl}
            target="_blank"
            rel="noopener"
            title={name}
          >
            <span className="artist-rank">#{rank}</span>
            <div className="artist-image-wrap">
              {imageUrl ? (
                <img
                  className="artist-img"
                  src={imageUrl}
                  alt={name}
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const fallback = e.currentTarget.nextElementSibling;
                    if (fallback) {
                      fallback.style.display = 'flex';
                    }
                  }}
                />
              ) : null}
              <div
                className="artist-avatar-fallback"
                style={{
                  background: `linear-gradient(135deg,${colorPair[0]},${colorPair[1]})`,
                  display: imageUrl ? 'none' : 'flex',
                }}
              >
                {initials}
              </div>
            </div>
            <div className="artist-info d-flex flex-column">
              <p className="artist-name mb-0">{name}</p>
              <p className="artist-plays mb-0">{playcount} plays</p>
            </div>
          </a>
        );
      })}
    </div>
  );
}

function TopTracksList({ tracks, artworkByKey }) {
  if (!tracks.length) {
    return <p className="empty-msg text-muted small mb-0">No track data for this period.</p>;
  }

  return (
    <div id="tracks-list" className="tracks-list">
      {tracks.map((track, index) => {
        const rank = index + 1;
        const name = track.name ?? 'Unknown';
        const artist = track.artist?.name ?? track.artist?.['#text'] ?? 'Unknown Artist';
        const playcount = parseInt(track.playcount ?? '0', 10).toLocaleString();
        const trackUrl = safeUrl(track.url);
        const key = `${name}___${artist}`;
        const imageUrl = artworkByKey[key] || getBestImage(track.image);

        return (
          <a key={`${key}-${rank}`} className="track-row text-decoration-none" href={trackUrl} target="_blank" rel="noopener">
            <span className={`track-rank ${rank <= 3 ? 'track-rank--top' : ''}`}>{rank}</span>
            {imageUrl ? (
              <img
                className="track-art"
                src={imageUrl}
                alt=""
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.nextElementSibling;
                  if (fallback) {
                    fallback.style.display = 'flex';
                  }
                }}
              />
            ) : null}
            <div className="track-art-fallback" style={{ display: imageUrl ? 'none' : 'flex' }}>🎵</div>
            <div className="track-meta">
              <p className="track-name mb-0">{name}</p>
              <p className="track-artist mb-0">{artist}</p>
            </div>
            <span className="track-plays">{playcount} plays</span>
          </a>
        );
      })}
    </div>
  );
}

function RecentTracksList({ tracks, artworkByKey }) {
  if (!tracks.length) {
    return <p className="empty-msg text-muted small mb-0">No recent tracks found.</p>;
  }

  return (
    <div id="recent-list" className="tracks-list">
      {tracks.map((track, index) => {
        const name = track.name ?? 'Unknown';
        const artist = track.artist?.['#text'] ?? track.artist?.name ?? 'Unknown Artist';
        const trackUrl = safeUrl(track.url);
        const timeAgo = formatRelativeTime(track.date?.uts);

        const key = `${name}___${artist}`;
        const imageUrl = artworkByKey[key] || getBestImage(track.image);

        return (
          <a
            key={`${key}-${index}`}
            className="track-row track-row--recent text-decoration-none"
            href={trackUrl}
            target="_blank"
            rel="noopener"
          >
            {imageUrl ? (
              <img
                className="track-art"
                src={imageUrl}
                alt=""
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.nextElementSibling;
                  if (fallback) {
                    fallback.style.display = 'flex';
                  }
                }}
              />
            ) : null}
            <div className="track-art-fallback" style={{ display: imageUrl ? 'none' : 'flex' }}>🎵</div>
            <div className="track-meta">
              <p className="track-name mb-0">{name}</p>
              <p className="track-artist mb-0">{artist}</p>
            </div>
            <span className="track-plays">{timeAgo}</span>
          </a>
        );
      })}
    </div>
  );
}

async function loadGenreTags(artists, apiKey) {
  const tagArrays = await Promise.all(
    artists.map((artist) => LastFmAPI.getArtistTopTags(artist.name, apiKey)),
  );

  const tagMap = new Map();

  for (const tags of tagArrays) {
    for (const tag of tags.slice(0, 5)) {
      const name = normaliseTag(tag.name);
      const count = parseInt(tag.count, 10) || 0;
      tagMap.set(name, (tagMap.get(name) ?? 0) + count);
    }
  }

  const excluded = new Set(['seen live', 'under 2000 listeners', 'all', 'favorites', 'favourite']);

  return [...tagMap.entries()]
    .filter(([name]) => !excluded.has(name) && name.length > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

function getBestImage(imageArray) {
  if (!Array.isArray(imageArray)) return '';
  const preferred = ['extralarge', 'large', 'mega', 'medium', 'small'];
  for (const size of preferred) {
    const entry = imageArray.find((item) => item.size === size);
    if (entry?.['#text']) return entry['#text'];
  }
  return '';
}

function getInitials(name) {
  const words = String(name)
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function normaliseTag(tag) {
  return String(tag ?? '').toLowerCase().trim();
}

function formatRelativeTime(uts) {
  if (!uts) return '';
  const diff = Math.floor(Date.now() / 1000) - parseInt(uts, 10);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function safeUrl(url) {
  if (typeof url !== 'string') return '#';
  if (url.startsWith('https://') || url.startsWith('http://')) return url;
  return '#';
}
