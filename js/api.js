/**
 * api.js — Last.fm API wrapper
 *
 * Provides a clean async interface over the Last.fm REST API.
 * All methods return plain JavaScript objects matching the
 * relevant section of the Last.fm JSON response.
 *
 * Last.fm API docs: https://www.last.fm/api
 */

const LastFmAPI = (() => {
  /** Base URL for all Last.fm API requests. */
  const BASE_URL = 'https://ws.audioscrobbler.com/2.0/';

  /**
   * Core fetch helper — assembles query parameters, calls the API,
   * and throws a descriptive error on non-OK responses.
   *
   * @param {string} method   Last.fm API method name (e.g. 'user.getTopArtists')
   * @param {Object} params   Additional query parameters (apiKey, user, …)
   * @returns {Promise<Object>}
   */
  async function call(method, params) {
    const url = new URL(BASE_URL);

    // Always required parameters
    url.searchParams.set('method', method);
    url.searchParams.set('api_key', params.apiKey);
    url.searchParams.set('format', 'json');

    // Copy remaining caller-supplied parameters
    for (const [key, value] of Object.entries(params)) {
      if (key !== 'apiKey' && value !== undefined && value !== null) {
        url.searchParams.set(key, value);
      }
    }

    let response;
    try {
      response = await fetch(url.toString());
    } catch (err) {
      throw new Error(`Network error — could not reach Last.fm API. (${err.message})`);
    }

    // Parse JSON regardless of status so we can read Last.fm error bodies
    const data = await response.json();

    // Last.fm signals errors with a top-level `error` property
    if (data.error) {
      throw new Error(`Last.fm API error ${data.error}: ${data.message}`);
    }

    return data;
  }

  // ---------------------------------------------------------------------------
  // Public API methods
  // ---------------------------------------------------------------------------

  /**
   * Fetch basic profile information for a user.
   *
   * @param {string} username
   * @param {string} apiKey
   * @returns {Promise<Object>} user info object
   */
  async function getUserInfo(username, apiKey) {
    const data = await call('user.getInfo', { user: username, apiKey });
    return data.user;
  }

  /**
   * Fetch the user's top artists for a given time period.
   *
   * @param {string} username
   * @param {string} apiKey
   * @param {string} period   '7day' | '1month' | '3month' | '6month' | '12month' | 'overall'
   * @param {number} [limit]  Max artists to return (default 20, max 50)
   * @returns {Promise<Array>} array of artist objects
   */
  async function getTopArtists(username, apiKey, period = '7day', limit = 20) {
    const data = await call('user.getTopArtists', {
      user: username,
      apiKey,
      period,
      limit,
    });
    return data.topartists?.artist ?? [];
  }

  /**
   * Fetch the user's top tracks for a given time period.
   *
   * @param {string} username
   * @param {string} apiKey
   * @param {string} period
   * @param {number} [limit]
   * @returns {Promise<Array>} array of track objects
   */
  async function getTopTracks(username, apiKey, period = '7day', limit = 20) {
    const data = await call('user.getTopTracks', {
      user: username,
      apiKey,
      period,
      limit,
    });
    return data.toptracks?.track ?? [];
  }

  /**
   * Fetch recent scrobbles (played tracks) within a UNIX timestamp range.
   * Automatically paginates to retrieve up to `maxTracks` entries.
   *
   * @param {string} username
   * @param {string} apiKey
   * @param {number} from     UNIX timestamp — start of range
   * @param {number} to       UNIX timestamp — end of range
   * @param {number} [maxTracks]  Upper cap to avoid excessive requests (default 500)
   * @returns {Promise<Array>} array of track objects
   */
  async function getRecentTracks(username, apiKey, from, to, maxTracks = 500) {
    const pageLimit = 200; // Last.fm max per request
    let allTracks = [];
    let page = 1;
    let totalPages = 1;

    do {
      const data = await call('user.getRecentTracks', {
        user: username,
        apiKey,
        from,
        to,
        limit: pageLimit,
        page,
      });

      const attr = data.recenttracks?.['@attr'];
      totalPages = parseInt(attr?.totalPages ?? '1', 10);

      const tracks = data.recenttracks?.track ?? [];
      // Filter out the "now playing" placeholder (has no `date` field)
      const played = tracks.filter(t => t.date);
      allTracks = allTracks.concat(played);

      page++;
    } while (page <= totalPages && allTracks.length < maxTracks);

    return allTracks;
  }

  /**
   * Fetch the top tags (genres) for a given artist.
   *
   * @param {string} artistName
   * @param {string} apiKey
   * @returns {Promise<Array>} array of tag objects { name, count }
   */
  async function getArtistTopTags(artistName, apiKey) {
    try {
      const data = await call('artist.getTopTags', {
        artist: artistName,
        apiKey,
      });
      return data.toptags?.tag ?? [];
    } catch {
      // Non-critical — return empty if the tag call fails for any artist
      return [];
    }
  }

  // Expose only the public interface
  return {
    getUserInfo,
    getTopArtists,
    getTopTracks,
    getRecentTracks,
    getArtistTopTags,
  };
})();
