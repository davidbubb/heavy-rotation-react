/**
 * Last.fm API wrapper
 */
export const LastFmAPI = (() => {
  const BASE_URL = 'https://ws.audioscrobbler.com/2.0/';

  async function call(method, params) {
    const url = new URL(BASE_URL);

    url.searchParams.set('method', method);
    url.searchParams.set('api_key', params.apiKey);
    url.searchParams.set('format', 'json');

    for (const [key, value] of Object.entries(params)) {
      if (key !== 'apiKey' && value !== undefined && value !== null) {
        url.searchParams.set(key, value);
      }
    }

    let response;
    try {
      response = await fetch(url.toString());
    } catch (err) {
      throw new Error(`Network error - could not reach Last.fm API. (${err.message})`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`Last.fm API error ${data.error}: ${data.message}`);
    }

    return data;
  }

  async function getUserInfo(username, apiKey) {
    const data = await call('user.getInfo', { user: username, apiKey });
    return data.user;
  }

  async function getTopArtists(username, apiKey, period = '7day', limit = 20) {
    const data = await call('user.getTopArtists', {
      user: username,
      apiKey,
      period,
      limit,
    });
    return data.topartists?.artist ?? [];
  }

  async function getTopTracks(username, apiKey, period = '7day', limit = 20) {
    const data = await call('user.getTopTracks', {
      user: username,
      apiKey,
      period,
      limit,
    });
    return data.toptracks?.track ?? [];
  }

  async function getRecentTracks(username, apiKey, from, to, maxTracks = 500) {
    const pageLimit = 200;
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
      const played = tracks.filter((t) => t.date);
      allTracks = allTracks.concat(played);

      page += 1;
    } while (page <= totalPages && allTracks.length < maxTracks);

    return allTracks;
  }

  async function getArtistTopTags(artistName, apiKey) {
    try {
      const data = await call('artist.getTopTags', {
        artist: artistName,
        apiKey,
      });
      return data.toptags?.tag ?? [];
    } catch {
      return [];
    }
  }

  return {
    getUserInfo,
    getTopArtists,
    getTopTracks,
    getRecentTracks,
    getArtistTopTags,
  };
})();

export const ItunesAPI = (() => {
  const BASE_URL = 'https://itunes.apple.com/search';

  function searchJsonp(params) {
    return new Promise((resolve, reject) => {
      const callbackName = `itunes_cb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const url = new URL(BASE_URL);

      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, value);
        }
      }
      url.searchParams.set('callback', callbackName);

      let completed = false;
      const script = document.createElement('script');

      function cleanup() {
        delete window[callbackName];
        script.remove();
      }

      const timeoutId = setTimeout(() => {
        if (completed) return;
        completed = true;
        cleanup();
        reject(new Error('iTunes request timed out'));
      }, 6000);

      window[callbackName] = (data) => {
        if (completed) return;
        completed = true;
        clearTimeout(timeoutId);
        cleanup();
        resolve(data || {});
      };

      script.onerror = () => {
        if (completed) return;
        completed = true;
        clearTimeout(timeoutId);
        cleanup();
        reject(new Error('iTunes JSONP load failed'));
      };

      script.src = url.toString();
      document.head.appendChild(script);
    });
  }

  function upgradeArtworkSize(url) {
    return url.replace('100x100bb', '600x600bb');
  }

  async function getTrackArtwork(trackName, artistName) {
    try {
      const data = await searchJsonp({
        term: `${artistName} ${trackName}`,
        entity: 'song',
        limit: '1',
      });
      const art = data.results?.[0]?.artworkUrl100;
      return art ? upgradeArtworkSize(art) : '';
    } catch {
      return '';
    }
  }

  async function getArtistArtwork(artistName) {
    try {
      const data = await searchJsonp({
        term: artistName,
        entity: 'song',
        limit: '1',
      });
      const art = data.results?.[0]?.artworkUrl100;
      return art ? upgradeArtworkSize(art) : '';
    } catch {
      return '';
    }
  }

  return { getTrackArtwork, getArtistArtwork };
})();
