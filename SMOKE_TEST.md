# Heavy Rotation — Smoke Test Checklist

Run the app with `npm run dev` and open http://localhost:5173.

---

## 1. First Load — Config Panel

| Check | Expected | Status |
|---|---|---|
| Config panel is visible on fresh visit | "Connect to Last.fm" card shown, dashboard hidden | |
| Username field accepts text input | Text appears as typed | |
| API key field masks input | Input shows as dots (password type) | |
| Load button disabled while loading | Button shows "Loading…" and is non-interactive | |
| Bad credentials show error | Inline error banner appears below the button | |
| Enter key in username/apikey triggers load | Same as clicking the button | |

---

## 2. Successful Load

| Check | Expected | Status |
|---|---|---|
| Config panel hides, dashboard shows | Full 3-column layout + charts visible | |
| User badge appears in header | Avatar + realname + scrobble count | |
| Recent Tracks column populated | Up to 10 recent scrobble rows | |
| Top Artists column populated | Up to 10 artist cards with image/fallback | |
| Top Tracks column populated | Up to 10 ranked track rows | |
| All three charts rendered | Daily bar, genre doughnut, artist horizontal bar | |
| Genre legend rendered below doughnut | Coloured dot + label for each genre | |

---

## 3. Period Switching

| Check | Expected | Status |
|---|---|---|
| Clicking a period button updates "active" state | Only clicked button is highlighted | |
| Period label updates beside Top Artists and Tracks titles | Shows e.g. "Last Month" | |
| Top Artists and Top Tracks data refreshes | New ranked lists appropriate to period | |
| Artist Playcount chart updates | New bar chart data reflecting the period | |
| Recent Tracks and Daily Scrobbles unchanged | Both always show last 14 days | |

---

## 4. Theme Switching

| Check | Expected | Status |
|---|---|---|
| "Neon" (default) applied on load | Hot-pink/purple dark theme | |
| "Sunset" changes colours | Orange/amber warm dark | |
| "Mint" changes colours | Green/cyan fresh dark | |
| "Light" changes colours | Clean light/white mode | |
| Theme persists on page refresh | localStorage key `hv_theme` restored | |
| Chart colours update immediately on theme switch | Charts re-render with new accent colours | |

---

## 5. Artwork Enrichment

| Check | Expected | Status |
|---|---|---|
| Artist cards show gradient fallback initially | Initials on coloured gradient if no image | |
| iTunes artwork progressively loads in | Real artwork replaces fallback after a short delay | |
| Track rows show 🎵 fallback initially | Emoji fallback if no image | |
| Track art progressively loads in | Real album art replaces fallback | |
| Broken image gracefully degrades | Falls back to gradient/emoji, no broken icon | |

---

## 6. Credential Persistence

| Check | Expected | Status |
|---|---|---|
| Username and API key stored in localStorage | Keys `hv_username`, `hv_apikey` visible in DevTools | |
| App auto-loads on return visit | Dashboard loads without re-entering credentials | |

---

## 7. Build & Dev Server

| Check | Expected | Status |
|---|---|---|
| `npm run dev` starts without error | Vite ready on http://localhost:5173 | ✅ |
| `npm run build` produces dist/ with no errors | 37 modules transformed, ~370 kB JS bundle | ✅ |

---

## Static Validation Results

| Check | Result |
|---|---|
| No errors in `index.html` | ✅ Pass |
| No errors in `src/App.jsx` | ✅ Pass |
| No errors in `src/lib/api.js` | ✅ Pass |
| No errors in `src/lib/charts.js` | ✅ Pass |
| No errors in `src/main.jsx` | ✅ Pass |
| Vite build succeeds | ✅ Pass |

---

*Fill in the manual check statuses above with ✅ / ❌ / ⚠️ as you step through the running app.*
