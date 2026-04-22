import Chart from 'chart.js/auto';

const FONT_FAMILY = "'Segoe UI', system-ui, sans-serif";

let dailyChartInstance = null;
let genreChartInstance = null;
let artistBarChartInstance = null;

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

function destroyChart(instance) {
  if (instance) instance.destroy();
}

function formatShortDate(date) {
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
}

function buildDailyCountMap(tracks, days) {
  const now = Date.now();
  const cutoff = now - days * 24 * 60 * 60 * 1000;

  const map = {};
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    map[formatShortDate(d)] = 0;
  }

  for (const track of tracks) {
    const ts = parseInt(track.date?.uts ?? '0', 10) * 1000;
    if (ts < cutoff) continue;

    const key = formatShortDate(new Date(ts));
    if (key in map) map[key] += 1;
  }

  return map;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const Charts = {
  init() {
    const tokens = getThemeTokens();
    Chart.defaults.color = tokens.textColor;
    Chart.defaults.font.family = FONT_FAMILY;
    Chart.defaults.font.size = 12;
    Chart.defaults.plugins.legend.display = false;
    Chart.defaults.animation.duration = 600;
  },

  renderDailyChart(tracks) {
    destroyChart(dailyChartInstance);
    const tokens = getThemeTokens();
    Chart.defaults.color = tokens.textColor;

    const canvas = document.getElementById('chart-daily');
    if (!canvas) return;

    const dayCounts = buildDailyCountMap(tracks, 14);
    const labels = Object.keys(dayCounts);
    const values = Object.values(dayCounts);

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 260);
    gradient.addColorStop(0, `${tokens.accent}cc`);
    gradient.addColorStop(1, `${tokens.accent}14`);

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
              label: (context) => ` ${context.parsed.y} scrobbles`,
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
              callback: (val) => (Number.isInteger(val) ? val : null),
            },
          },
        },
      },
    });
  },

  renderGenreChart(aggregatedTags) {
    destroyChart(genreChartInstance);
    const tokens = getThemeTokens();
    Chart.defaults.color = tokens.textColor;

    const canvas = document.getElementById('chart-genres');
    const legendEl = document.getElementById('genre-legend');
    if (!canvas) return;

    const top = aggregatedTags.slice(0, 10);
    const labels = top.map((t) => t.name);
    const values = top.map((t) => t.count);
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
              label: (context) => ` ${context.label} - score ${context.parsed}`,
            },
          },
        },
      },
    });

    if (legendEl) {
      legendEl.innerHTML = top
        .map((tag, i) => `
          <span class="legend-item">
            <span class="legend-dot" style="background:${colors[i]}"></span>
            ${escapeHtml(tag.name)}
          </span>`)
        .join('');
    }
  },

  renderArtistBarChart(artists) {
    destroyChart(artistBarChartInstance);
    const tokens = getThemeTokens();
    Chart.defaults.color = tokens.textColor;

    const canvas = document.getElementById('chart-artist-bar');
    if (!canvas) return;

    const top = artists.slice(0, 10);
    const labels = top.map((a) => a.name);
    const values = top.map((a) => parseInt(a.playcount, 10));

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
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: (context) => ` ${context.parsed.x.toLocaleString()} plays`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: tokens.gridColor },
            beginAtZero: true,
            ticks: {
              callback: (val) => (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val),
            },
          },
          y: {
            grid: { color: tokens.gridColor },
          },
        },
      },
    });
  },
};
