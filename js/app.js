/**
 * app.js — Main application controller
 *
 * Responsibilities:
 *   - Reads / persists user config from localStorage
 *   - Handles the "Load my stats" form submission
 *   - Coordinates calls to LastFmAPI and Charts modules
 *   - Renders artist cards, track rows, and activates chart sections
 *   - Manages UI state (loading, errors, period switching)
 */

const App = (() => {
  // -------------------------------------------------------------------------
  // Constants
  // -------------------------------------------------------------------------

  /** localStorage key names */
  const LS_USERNAME = 'hv_username';
  const LS_APIKEY   = 'hv_apikey';

  /**
   * Colours used for artist-avatar fallbacks.
   * Each artist gets one deterministically based on its name length.
   */
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

  /** Human-readable period labels used in UI badges. */
  const PERIOD_LABELS = {
    '7day':   'Last 7 Days',
    '1month': 'Last Month',
    '3month': 'Last 3 Months',
    '6month': 'Last 6 Months',
    '12month':'Last 12 Months',
    'overall':'All Time',
  };

  // -------------------------------------------------------------------------
  // Application state
  // -------------------------------------------------------------------------

  const state = {
    username:    '',
    apiKey:      '',
    period:      '7day',
    topArtists:  [],
    recentTracks: [],
  };

  // -------------------------------------------------------------------------
  // DOM references — cached on init
  // -------------------------------------------------------------------------

  let els = {};

  function cacheElements() {
    els = {
      inputUsername:     document.getElementById('input-username'),
      inputApiKey:       document.getElementById('input-apikey'),
      btnLoad:           document.getElementById('btn-load'),
      configError:       document.getElementById('config-error'),
      configPanel:       document.getElementById('config-panel'),
      dashboard:         document.getElementById('dashboard'),
      loadingOverlay:    document.getElementById('loading-overlay'),
      artistsGrid:       document.getElementById('artists-grid'),
      tracksList:        document.getElementById('tracks-list'),
      artistsPeriodLabel:document.getElementById('artists-period-label'),
      tracksPeriodLabel: document.getElementById('tracks-period-label'),
      periodButtons:     document.querySelectorAll('.btn-period'),
      userBadge:         document.getElementById('user-badge'),
      userAvatar:        document.getElementById('user-avatar'),
      userRealname:      document.getElementById('user-realname'),
      userScrobbles:     document.getElementById('user-scrobbles'),
    };
  }

  // -------------------------------------------------------------------------
  // Initialisation
  // -------------------------------------------------------------------------

  /**
   * Entry point — called when the DOM is ready.
   * Sets up Chart.js defaults, restores saved config, and attaches events.
   */
  function init() {
    cacheElements();
    Charts.init();

    // Restore previously saved credentials so the user doesn't have to retype
    const savedUsername = localStorage.getItem(LS_USERNAME) ?? '';
    const savedApiKey   = localStorage.getItem(LS_APIKEY)   ?? '';

    if (savedUsername) els.inputUsername.value = savedUsername;
    if (savedApiKey)   els.inputApiKey.value   = savedApiKey;

    // Wire up events
    els.btnLoad.addEventListener('click', handleLoadClick);
    els.inputApiKey.addEventListener('keydown', e => {
      if (e.key === 'Enter') handleLoadClick();
    });
    els.inputUsername.addEventListener('keydown', e => {
      if (e.key === 'Enter') handleLoadClick();
    });

    els.periodButtons.forEach(btn => {
      btn.addEventListener('click', () => handlePeriodChange(btn.dataset.period));
    });

    // If credentials are already stored, load data automatically
    if (savedUsername && savedApiKey) {
      state.username = savedUsername;
      state.apiKey   = savedApiKey;
      loadData();
    }
  }

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------

  /** Triggered when the user clicks "Load My Stats". */
  async function handleLoadClick() {
    const username = els.inputUsername.value.trim();
    const apiKey   = els.inputApiKey.value.trim();

    // Basic validation
    if (!username) {
      showError('Please enter your Last.fm username.');
      return;
    }
    if (!apiKey || apiKey.length < 10) {
      showError('Please enter a valid Last.fm API key.');
      return;
    }

    hideError();
    state.username = username;
    state.apiKey   = apiKey;

    // Persist to localStorage for next visit
    localStorage.setItem(LS_USERNAME, username);
    localStorage.setItem(LS_APIKEY, apiKey);

    await loadData();
  }

  /** Triggered when a period button is clicked. */
  async function handlePeriodChange(period) {
    if (period === state.period) return;
    state.period = period;

    // Update active button style
    els.periodButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.period === period);
    });

    // Reload top artists and tracks for the new period
    // (recent tracks for the daily chart are always the last 14 days)
    await loadTopData();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  /**
   * Full data load — fetches user info, top artists/tracks, recent tracks,
   * and genre tags, then renders all sections.
   */
  async function loadData() {
    setLoading(true);
    hideError();

    try {
      // Fetch user profile and top-level stats in parallel
      const [userInfo, artists, tracks] = await Promise.all([
        LastFmAPI.getUserInfo(state.username, state.apiKey),
        LastFmAPI.getTopArtists(state.username, state.apiKey, state.period, 20),
        LastFmAPI.getTopTracks(state.username, state.apiKey, state.period, 20),
      ]);

      // Fetch recent tracks for the daily chart (last 14 days)
      const fourteenDaysAgo = Math.floor((Date.now() - 14 * 24 * 60 * 60 * 1000) / 1000);
      const now             = Math.floor(Date.now() / 1000);
      const recentTracks    = await LastFmAPI.getRecentTracks(
        state.username, state.apiKey, fourteenDaysAgo, now,
      );

      // Cache artist list for genre fetching and chart reuse
      state.topArtists   = artists;
      state.recentTracks = recentTracks;

      // Update the UI
      renderUserBadge(userInfo);
      renderArtists(artists);
      renderTracks(tracks);
      Charts.renderDailyChart(recentTracks);
      Charts.renderArtistBarChart(artists);

      // Fetch genre tags concurrently for the top 10 artists
      await loadAndRenderGenres(artists.slice(0, 10));

      // Show the dashboard, hide the config panel
      showDashboard();

    } catch (err) {
      showError(err.message || 'An unexpected error occurred. Check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Partial reload — called when only the period changes.
   * Avoids re-fetching user info and recent tracks.
   */
  async function loadTopData() {
    setLoading(true);

    try {
      const [artists, tracks] = await Promise.all([
        LastFmAPI.getTopArtists(state.username, state.apiKey, state.period, 20),
        LastFmAPI.getTopTracks(state.username, state.apiKey, state.period, 20),
      ]);

      state.topArtists = artists;

      renderArtists(artists);
      renderTracks(tracks);
      Charts.renderArtistBarChart(artists);
      await loadAndRenderGenres(artists.slice(0, 10));

      // Period labels
      const periodLabel = PERIOD_LABELS[state.period] ?? state.period;
      els.artistsPeriodLabel.textContent = periodLabel;
      els.tracksPeriodLabel.textContent  = periodLabel;

    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Fetch top tags for each artist, aggregate them, and render the genre chart.
   *
   * @param {Array} artists
   */
  async function loadAndRenderGenres(artists) {
    // Run tag requests concurrently — non-critical, errors per-artist are swallowed in api.js
    const tagArrays = await Promise.all(
      artists.map(a => LastFmAPI.getArtistTopTags(a.name, state.apiKey)),
    );

    // Aggregate tag scores: each artist contributes its top 5 tags
    const tagMap = new Map();

    for (const tags of tagArrays) {
      for (const tag of tags.slice(0, 5)) {
        const name  = normaliseTag(tag.name);
        const count = parseInt(tag.count, 10) || 0;
        tagMap.set(name, (tagMap.get(name) ?? 0) + count);
      }
    }

    // Sort descending and filter out generic/unwanted tags
    const EXCLUDED = new Set(['seen live', 'under 2000 listeners', 'all', 'favorites', 'favourite']);
    const sorted = [...tagMap.entries()]
      .filter(([name]) => !EXCLUDED.has(name) && name.length > 1)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    Charts.renderGenreChart(sorted);
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  /**
   * Populate the user-profile badge in the header.
   * @param {Object} userInfo  Last.fm user object
   */
  function renderUserBadge(userInfo) {
    const avatarUrl  = userInfo?.image?.find(i => i.size === 'medium')?.['#text'] ?? '';
    const realName   = userInfo?.realname || userInfo?.name || state.username;
    const scrobbles  = parseInt(userInfo?.playcount ?? '0', 10);

    if (avatarUrl) {
      els.userAvatar.src = avatarUrl;
      els.userAvatar.classList.remove('hidden');
    } else {
      els.userAvatar.classList.add('hidden');
    }

    els.userRealname.textContent  = realName;
    els.userScrobbles.textContent = `${scrobbles.toLocaleString()} scrobbles`;
    els.userBadge.classList.remove('hidden');
  }

  /**
   * Render the artist grid from an array of Last.fm artist objects.
   * @param {Array} artists
   */
  function renderArtists(artists) {
    const periodLabel = PERIOD_LABELS[state.period] ?? state.period;
    els.artistsPeriodLabel.textContent = periodLabel;

    if (!artists.length) {
      els.artistsGrid.innerHTML = '<p class="empty-msg">No artist data for this period.</p>';
      return;
    }

    els.artistsGrid.innerHTML = artists.map((artist, index) => {
      const rank       = index + 1;
      const name       = artist.name ?? 'Unknown';
      const playcount  = parseInt(artist.playcount ?? '0', 10).toLocaleString();
      const imageUrl   = getBestImage(artist.image);
      const profileUrl = artist.url ?? '#';

      // Deterministic fallback avatar colour based on artist name
      const colorPair = AVATAR_COLORS[name.length % AVATAR_COLORS.length];
      const initials  = getInitials(name);

      // Use data attributes to pass fallback info; error handling is wired
      // via addEventListener after innerHTML is set (avoids inline onerror).
      const imageContent = imageUrl
        ? `<img class="artist-img" src="${escapeAttr(imageUrl)}" alt="${escapeAttr(name)}"
               loading="lazy"
               data-color1="${escapeAttr(colorPair[0])}"
               data-color2="${escapeAttr(colorPair[1])}"
               data-initials="${escapeAttr(initials)}">`
        : `<div class="artist-avatar-fallback"
               style="background:linear-gradient(135deg,${colorPair[0]},${colorPair[1]})">
               ${escapeHtml(initials)}</div>`;

      return `
        <a class="artist-card" href="${escapeAttr(profileUrl)}" target="_blank" rel="noopener"
           title="${escapeAttr(name)}">
          <span class="artist-rank">#${rank}</span>
          <div class="artist-image-wrap">${imageContent}</div>
          <div class="artist-info">
            <p class="artist-name">${escapeHtml(name)}</p>
            <p class="artist-plays">${playcount} plays</p>
          </div>
        </a>`;
    }).join('');

    // Attach image-error handlers using DOM APIs — no inline event handlers.
    els.artistsGrid.querySelectorAll('img.artist-img').forEach(img => {
      img.addEventListener('error', function handleArtistImgError() {
        const fallback = document.createElement('div');
        fallback.className = 'artist-avatar-fallback';
        // Colors come from our own AVATAR_COLORS constant via data attributes
        fallback.style.background =
          `linear-gradient(135deg,${this.dataset.color1},${this.dataset.color2})`;
        // textContent prevents any HTML injection from the initials value
        fallback.textContent = this.dataset.initials;
        this.parentElement.replaceChild(fallback, this);
      });
    });
  }

  /**
   * Render the top tracks list.
   * @param {Array} tracks
   */
  function renderTracks(tracks) {
    const periodLabel = PERIOD_LABELS[state.period] ?? state.period;
    els.tracksPeriodLabel.textContent = periodLabel;

    if (!tracks.length) {
      els.tracksList.innerHTML = '<p class="empty-msg">No track data for this period.</p>';
      return;
    }

    els.tracksList.innerHTML = tracks.map((track, index) => {
      const rank      = index + 1;
      const name      = track.name      ?? 'Unknown';
      const artist    = track.artist?.name ?? track.artist?.['#text'] ?? 'Unknown Artist';
      const playcount = parseInt(track.playcount ?? '0', 10).toLocaleString();
      const imageUrl  = getBestImage(track.image);
      const trackUrl  = track.url ?? '#';

      const rankClass = rank <= 3 ? 'track-rank track-rank--top' : 'track-rank';

      const artContent = imageUrl
        ? `<img class="track-art" src="${escapeAttr(imageUrl)}" alt="" loading="lazy">`
        : `<div class="track-art-fallback">🎵</div>`;

      return `
        <a class="track-row" href="${escapeAttr(trackUrl)}" target="_blank" rel="noopener">
          <span class="${rankClass}">${rank}</span>
          ${artContent}
          <div class="track-meta">
            <p class="track-name">${escapeHtml(name)}</p>
            <p class="track-artist">${escapeHtml(artist)}</p>
          </div>
          <span class="track-plays">${playcount} plays</span>
        </a>`;
    }).join('');

    // Attach image-error handlers using DOM APIs — no inline event handlers.
    els.tracksList.querySelectorAll('img.track-art').forEach(img => {
      img.addEventListener('error', function handleTrackImgError() {
        const fallback = document.createElement('div');
        fallback.className = 'track-art-fallback';
        fallback.textContent = '🎵';
        this.parentElement.replaceChild(fallback, this);
      });
    });
  }

  // -------------------------------------------------------------------------
  // UI state helpers
  // -------------------------------------------------------------------------

  function showDashboard() {
    els.configPanel.classList.add('hidden');
    els.dashboard.classList.remove('hidden');
  }

  function setLoading(isLoading) {
    els.loadingOverlay.classList.toggle('hidden', !isLoading);
    els.btnLoad.disabled = isLoading;
    els.btnLoad.textContent = isLoading ? 'Loading…' : 'Load My Stats';
  }

  function showError(message) {
    els.configError.textContent = message;
    els.configError.classList.remove('hidden');
  }

  function hideError() {
    els.configError.textContent = '';
    els.configError.classList.add('hidden');
  }

  // -------------------------------------------------------------------------
  // Utility functions
  // -------------------------------------------------------------------------

  /**
   * Pick the largest available image URL from a Last.fm image array.
   * Last.fm image entries have sizes: small, medium, large, extralarge, mega.
   *
   * @param {Array|undefined} imageArray
   * @returns {string} URL or empty string
   */
  function getBestImage(imageArray) {
    if (!Array.isArray(imageArray)) return '';
    const preferred = ['extralarge', 'large', 'mega', 'medium', 'small'];
    for (const size of preferred) {
      const entry = imageArray.find(i => i.size === size);
      if (entry?.['#text']) return entry['#text'];
    }
    return '';
  }

  /**
   * Generate initials from an artist name (1–2 characters).
   * Handles edge cases: single character words, empty strings.
   * @param {string} name
   * @returns {string}
   */
  function getInitials(name) {
    const words = name.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    // Both words guaranteed to be non-empty after the filter above
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  /**
   * Normalise a tag name: lowercase and trim whitespace.
   * @param {string} tag
   * @returns {string}
   */
  function normaliseTag(tag) {
    return tag.toLowerCase().trim();
  }

  /**
   * Minimal HTML entity escaping to prevent XSS when inserting
   * user-supplied text into innerHTML.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Escape a value for safe use in an HTML attribute (e.g. href, src).
   * @param {string} str
   * @returns {string}
   */
  function escapeAttr(str) {
    return escapeHtml(str);
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------

  // Initialise once the DOM is fully parsed
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose nothing — all state is internal
  return {};
})();
