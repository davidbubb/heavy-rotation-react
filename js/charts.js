/**
 * charts.js — Chart rendering layer using Chart.js
 *
 * Wraps Chart.js to provide three themed charts:
 *   1. Daily scrobbles — bar chart showing play counts per day
 *   2. Top genres     — doughnut chart of aggregated artist tags
 *   3. Artist comparison — horizontal bar chart of top-artist play counts
 *
 * Chart instances are stored so they can be cleanly destroyed and
 * recreated whenever new data is loaded.
 */

const Charts = (() => {
  // -------------------------------------------------------------------------
  // Design tokens — keep in sync with CSS custom properties
  // -------------------------------------------------------------------------

  /** Palette for genre segments and other multi-colour uses. */
  const PALETTE = [
    '#e91e8c', // pink
    '#7c3aed', // purple
    '#06b6d4', // cyan
    '#f59e0b', // amber
    '#10b981', // emerald
    '#ef4444', // red
    '#3b82f6', // blue
    '#ec4899', // rose
    '#8b5cf6', // violet
    '#14b8a6', // teal
    '#f97316', // orange
    '#84cc16', // lime
  ];

  const GRID_COLOR  = 'rgba(255, 255, 255, 0.06)';
  const TEXT_COLOR  = '#7a7a9a';
  const FONT_FAMILY = "'Segoe UI', system-ui, sans-serif";

  // References to active Chart.js instances — kept so we can destroy them
  let dailyChartInstance   = null;
  let genreChartInstance   = null;
  let artistBarChartInstance = null;

  // -------------------------------------------------------------------------
  // Shared Chart.js defaults applied once at initialisation
  // -------------------------------------------------------------------------

  /**
   * Configure Chart.js global defaults to match the dark theme.
   * Called once by app.js at startup.
   */
  function init() {
    Chart.defaults.color            = TEXT_COLOR;
    Chart.defaults.font.family      = FONT_FAMILY;
    Chart.defaults.font.size        = 12;
    Chart.defaults.plugins.legend.display = false; // we render our own legends
    Chart.defaults.animation.duration = 600;
  }

  // -------------------------------------------------------------------------
  // Helper — safely destroy a previous chart instance
  // -------------------------------------------------------------------------
  function destroyChart(instance) {
    if (instance) instance.destroy();
  }

  // -------------------------------------------------------------------------
  // 1. Daily scrobbles — bar chart
  // -------------------------------------------------------------------------

  /**
   * Render a bar chart showing how many tracks were played each day.
   *
   * @param {Array<Object>} tracks  Array of Last.fm track objects with `date.uts`
   */
  function renderDailyChart(tracks) {
    destroyChart(dailyChartInstance);

    const canvas = document.getElementById('chart-daily');
    if (!canvas) return;

    // Build a day-keyed play-count map for the last 14 days
    const dayCounts = buildDailyCountMap(tracks, 14);

    const labels = Object.keys(dayCounts);
    const values = Object.values(dayCounts);

    // Gradient fill — looks great on dark background
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 260);
    gradient.addColorStop(0,   'rgba(233, 30, 140, 0.8)');
    gradient.addColorStop(1,   'rgba(233, 30, 140, 0.05)');

    dailyChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Scrobbles',
          data: values,
          backgroundColor: gradient,
          borderColor: '#e91e8c',
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.parsed.y} scrobbles`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: GRID_COLOR },
            ticks: { maxRotation: 45 },
          },
          y: {
            grid: { color: GRID_COLOR },
            beginAtZero: true,
            ticks: {
              // Only show whole numbers
              callback: val => Number.isInteger(val) ? val : null,
            },
          },
        },
      },
    });
  }

  /**
   * Build an ordered { 'Mon 31' : count } map covering the last N days.
   * Tracks outside that window are ignored.
   *
   * @param {Array}  tracks
   * @param {number} days
   * @returns {Object}
   */
  function buildDailyCountMap(tracks, days) {
    const now = Date.now();
    const cutoff = now - days * 24 * 60 * 60 * 1000;

    // Pre-populate every day with 0 so gaps show as empty bars
    const map = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      map[formatShortDate(d)] = 0;
    }

    for (const track of tracks) {
      const ts = parseInt(track.date?.uts ?? '0', 10) * 1000;
      if (ts < cutoff) continue;

      const key = formatShortDate(new Date(ts));
      if (key in map) map[key]++;
    }

    return map;
  }

  /**
   * Format a Date as a short "Mon 31" label.
   * @param {Date} date
   * @returns {string}
   */
  function formatShortDate(date) {
    return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
  }

  // -------------------------------------------------------------------------
  // 2. Top genres — doughnut chart
  // -------------------------------------------------------------------------

  /**
   * Render a doughnut chart of the most common genre tags across the
   * user's top artists.
   *
   * @param {Array<{name: string, count: number}>} aggregatedTags
   *   Pre-aggregated tag objects sorted by count descending.
   */
  function renderGenreChart(aggregatedTags) {
    destroyChart(genreChartInstance);

    const canvas = document.getElementById('chart-genres');
    const legendEl = document.getElementById('genre-legend');
    if (!canvas) return;

    // Take top 10 genres
    const top = aggregatedTags.slice(0, 10);
    const labels = top.map(t => t.name);
    const values = top.map(t => t.count);
    const colors = PALETTE.slice(0, top.length);

    genreChartInstance = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderColor: '#12121e',
          borderWidth: 2,
          hoverOffset: 8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label} — score ${ctx.parsed}`,
            },
          },
        },
      },
    });

    // Render custom legend below the chart
    if (legendEl) {
      legendEl.innerHTML = top
        .map((tag, i) => `
          <span class="legend-item">
            <span class="legend-dot" style="background:${colors[i]}"></span>
            ${escapeHtml(tag.name)}
          </span>`)
        .join('');
    }
  }

  // -------------------------------------------------------------------------
  // 3. Artist playcount comparison — horizontal bar chart
  // -------------------------------------------------------------------------

  /**
   * Render a horizontal bar chart comparing top-artist play counts.
   *
   * @param {Array<Object>} artists  Last.fm artist objects with `name` and `playcount`
   */
  function renderArtistBarChart(artists) {
    destroyChart(artistBarChartInstance);

    const canvas = document.getElementById('chart-artist-bar');
    if (!canvas) return;

    const top = artists.slice(0, 10);
    const labels = top.map(a => a.name);
    const values = top.map(a => parseInt(a.playcount, 10));

    const ctx = canvas.getContext('2d');

    // Gradient from accent pink to purple for visual interest
    const gradient = ctx.createLinearGradient(0, 0, canvas.offsetWidth || 800, 0);
    gradient.addColorStop(0,   '#e91e8c');
    gradient.addColorStop(1,   '#7c3aed');

    artistBarChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Play count',
          data: values,
          backgroundColor: PALETTE.slice(0, top.length),
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        indexAxis: 'y',  // horizontal bars
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.parsed.x.toLocaleString()} plays`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: GRID_COLOR },
            beginAtZero: true,
            ticks: {
              callback: val => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val,
            },
          },
          y: {
            grid: { color: GRID_COLOR },
          },
        },
      },
    });
  }

  // -------------------------------------------------------------------------
  // Utility — minimal HTML escaping to prevent XSS in legend labels
  // -------------------------------------------------------------------------
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Public interface
  return {
    init,
    renderDailyChart,
    renderGenreChart,
    renderArtistBarChart,
  };
})();
