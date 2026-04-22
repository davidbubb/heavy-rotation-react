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
    const tokens = getThemeTokens();
    Chart.defaults.color            = tokens.textColor;
    Chart.defaults.font.family      = FONT_FAMILY;
    Chart.defaults.font.size        = 12;
    Chart.defaults.plugins.legend.display = false; // we render our own legends
    Chart.defaults.animation.duration = 600;
  }

  function getCssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function getThemeTokens() {
    const accent = getCssVar('--clr-accent', '#e91e8c');
    const accent2 = getCssVar('--clr-accent-2', '#7c3aed');
    const accent3 = getCssVar('--clr-accent-3', '#06b6d4');

    return {
      accent,
      accent2,
      accent3,
      surface: getCssVar('--clr-surface', '#12121e'),
      gridColor: getCssVar('--chart-grid-color', 'rgba(255, 255, 255, 0.06)'),
      textColor: getCssVar('--chart-text-color', '#7a7a9a'),
      palette: [
        accent,
        accent2,
        accent3,
        '#f59e0b',
        '#10b981',
        '#ef4444',
        '#3b82f6',
        '#ec4899',
        '#8b5cf6',
        '#14b8a6',
        '#f97316',
        '#84cc16',
      ],
    };
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
    const tokens = getThemeTokens();
    Chart.defaults.color = tokens.textColor;

    const canvas = document.getElementById('chart-daily');
    if (!canvas) return;

    // Build a day-keyed play-count map for the last 14 days
    const dayCounts = buildDailyCountMap(tracks, 14);

    const labels = Object.keys(dayCounts);
    const values = Object.values(dayCounts);

    // Gradient fill — looks great on dark background
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 260);
    gradient.addColorStop(0,   `${tokens.accent}cc`);
    gradient.addColorStop(1,   `${tokens.accent}14`);

    dailyChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Scrobbles',
          data: values,
          backgroundColor: gradient,
          borderColor: tokens.accent,
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
            grid: { color: tokens.gridColor },
            ticks: { maxRotation: 45 },
          },
          y: {
            grid: { color: tokens.gridColor },
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
    const tokens = getThemeTokens();
    Chart.defaults.color = tokens.textColor;

    const canvas = document.getElementById('chart-genres');
    const legendEl = document.getElementById('genre-legend');
    if (!canvas) return;

    // Take top 10 genres
    const top = aggregatedTags.slice(0, 10);
    const labels = top.map(t => t.name);
    const values = top.map(t => t.count);
    const colors = tokens.palette.slice(0, top.length);

    genreChartInstance = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderColor: tokens.surface,
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
    const tokens = getThemeTokens();
    Chart.defaults.color = tokens.textColor;

    const canvas = document.getElementById('chart-artist-bar');
    if (!canvas) return;

    const top = artists.slice(0, 10);
    const labels = top.map(a => a.name);
    const values = top.map(a => parseInt(a.playcount, 10));

    const ctx = canvas.getContext('2d');

    artistBarChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Play count',
          data: values,
          backgroundColor: tokens.palette.slice(0, top.length),
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
            grid: { color: tokens.gridColor },
            beginAtZero: true,
            ticks: {
              callback: val => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val,
            },
          },
          y: {
            grid: { color: tokens.gridColor },
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
