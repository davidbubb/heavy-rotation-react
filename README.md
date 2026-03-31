# Heavy Rotation 🎵

A lightweight, client-side music listening dashboard powered by the [Last.fm API](https://www.last.fm/api). Drop it in a browser — no server, no build step, no framework required.

![dashboard preview](https://www.last.fm/static/images/lastfm_logo_light.png)

---

## What it does

Heavy Rotation pulls your personal listening history from Last.fm and presents it as a clean, dark-themed dashboard:

| Section | Description |
|---|---|
| **Top Artists** | Grid of your most-played artists for the chosen period, with artwork and play counts |
| **Top Tracks** | Ranked list of your most-played songs, linking through to Last.fm |
| **Daily Scrobbles** | Bar chart of how many tracks you played each day over the last 14 days |
| **Top Genres** | Doughnut chart of the most common tags across your top 10 artists |
| **Artist Playcount Comparison** | Horizontal bar chart ranking your top 10 artists by total plays |

All data is fetched live from Last.fm every time you load the page (or switch time periods). Nothing is stored on a server.

---

## Getting started

### 1. Get a Last.fm API key

1. Sign in (or create a free account) at [last.fm](https://www.last.fm).
2. Visit [last.fm/api/account/create](https://www.last.fm/api/account/create) and fill in the application form — a personal project description is fine.
3. Copy the **API key** (32 hex characters) that is shown on your API accounts page.

### 2. Open the dashboard

Because the app is plain HTML/CSS/JS you can run it in several ways:

```bash
# Option A — Python's built-in server (no install needed)
python -m http.server 8080
# then open http://localhost:8080

# Option B — Node.js serve
npx serve .

# Option C — VS Code Live Server extension, or any static host
```

You can also deploy the folder as-is to any static hosting service (GitHub Pages, Netlify, Cloudflare Pages, etc.).

### 3. Enter your credentials

On first load you will see the **Connect to Last.fm** panel. Enter your Last.fm username and the API key you copied above, then click **Load My Stats**.

Your credentials are saved to `localStorage` so you only need to enter them once per browser.

---

## Features in detail

### Time period selector

Six presets let you slice the data:

| Button | Last.fm period value |
|---|---|
| 7 Days | `7day` |
| 1 Month | `1month` |
| 3 Months | `3month` |
| 6 Months | `6month` |
| 12 Months | `12month` |
| All Time | `overall` |

Switching period re-fetches only top artists and tracks (and genre tags). The daily scrobble chart is always fixed to the last 14 days, so it is not refetched on period change.

### Genre detection

Last.fm does not expose a direct "user genre" endpoint. Instead, the app fetches the top tags for each of your top 10 artists, takes the first 5 tags per artist, aggregates them by score, and renders the result as a doughnut chart. Generic or noisy tags (`seen live`, `all`, `favorites`, etc.) are filtered out before rendering.

### Artist artwork fallbacks

Artist images on Last.fm are sometimes missing or broken. When an image fails to load the card displays a gradient avatar with the artist's initials instead. The gradient color pair is chosen deterministically from the artist's name length so it stays consistent across reloads without any extra state.

---

## Project structure

```
heavy-rotation/
├── index.html          # Single-page shell and all markup
├── css/
│   └── styles.css      # Dark-theme, mobile-first, custom-property-driven CSS
└── js/
    ├── api.js          # Last.fm API wrapper (fetch helper + public methods)
    ├── charts.js       # Chart.js rendering layer (bar, doughnut, horizontal bar)
    └── app.js          # Main controller (state, events, rendering)
```

Scripts are loaded in dependency order at the bottom of `index.html`: `api.js` → `charts.js` → `app.js`.

---

## Design decisions

### No framework, no build step

The app is intentionally written in vanilla HTML, CSS, and JavaScript. This keeps the barrier to entry as low as possible — open the folder in a browser and it works. There are no `npm install` steps, no bundlers, and no transpilation. The only external dependency is Chart.js, loaded from a CDN.

### IIFE module pattern

Each JS file wraps its code in an [Immediately Invoked Function Expression](https://developer.mozilla.org/en-US/docs/Glossary/IIFE) (`const X = (() => { … })()`). This gives each module a private scope — internal helpers are invisible outside the file — while still exposing a clean public interface through the returned object. A native ES module approach (`type="module"`) would have required a local server even for development, so IIFEs were chosen to preserve the "just open the file" experience.

### API key stored client-side

Because there is no backend, the Last.fm API key is held in `localStorage` and sent directly from the browser. This is an accepted trade-off: Last.fm read-only API keys carry minimal risk (they cannot modify your account), and keeping the app server-less dramatically reduces complexity. Users should still treat their API key as a personal credential and avoid sharing it.

### localStorage for credential persistence

Credentials are saved to `localStorage` under two fixed keys (`hv_username`, `hv_apikey`). On subsequent visits the form is pre-filled and the dashboard loads automatically, avoiding the need to re-enter credentials each time. Nothing beyond those two strings is persisted.

### XSS protection via explicit escaping

All user-supplied strings and API-returned data (artist names, track names, URLs) are passed through a minimal HTML-entity escaper (`escapeHtml`) before being written into `innerHTML`. Attributes such as `src` and `href` are also escaped via `escapeAttr`. Image error fallbacks use `textContent` and DOM APIs rather than `innerHTML` to avoid any chance of injecting markup. Inline `onerror` handlers are avoided for the same reason — error handling is attached via `addEventListener` after the HTML is set.

### Parallel API requests

`Promise.all` is used wherever multiple independent API calls can be made at the same time. On the initial full load, user info, top artists, and top tracks are all fetched in parallel. Genre tags for the top 10 artists are also fetched concurrently. This keeps load times short despite the number of requests.

### Paginated recent tracks with a cap

`user.getRecentTracks` returns at most 200 entries per page. The app paginates automatically until all tracks within the 14-day window are collected, but caps the total at 500 tracks to prevent runaway requests for very active listeners. The cap is high enough that the daily chart remains accurate for most users.

### Chart.js via CDN

[Chart.js](https://www.chartjs.org/) is loaded from jsDelivr. It provides bar and doughnut chart types with minimal configuration. Chart instances are stored in module-level variables so they can be explicitly destroyed before being recreated — without this, Chart.js warns about canvas reuse and the old data bleeds through.

### Custom genre legend

Chart.js's built-in legend is disabled globally (`Chart.defaults.plugins.legend.display = false`). A hand-rolled HTML legend is rendered below the genre chart instead, giving full control over layout and preventing the default legend from overlapping the doughnut.

---

## Browser support

Any modern evergreen browser (Chrome, Firefox, Edge, Safari). Internet Explorer is not supported.

---

## Last.fm API reference

- [`user.getInfo`](https://www.last.fm/api/show/user.getInfo)
- [`user.getTopArtists`](https://www.last.fm/api/show/user.getTopArtists)
- [`user.getTopTracks`](https://www.last.fm/api/show/user.getTopTracks)
- [`user.getRecentTracks`](https://www.last.fm/api/show/user.getRecentTracks)
- [`artist.getTopTags`](https://www.last.fm/api/show/artist.getTopTags)