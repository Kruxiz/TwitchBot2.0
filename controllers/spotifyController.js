// controllers/spotifyController.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = class SpotifyController {
/**
 * Constructor for SpotifyController
 * @param {Object} options
 * @param {string} options.clientId
 * @param {string} options.clientSecret
 * @param {string} options.redirectUri
 * @throws {Error} If any of the above parameters are missing
 */
  constructor({ clientId, clientSecret, redirectUri }) {
    if (!clientId) throw new Error('Spotify clientId missing');
    if (!clientSecret) throw new Error('Spotify clientSecret missing');
    if (!redirectUri) throw new Error('Spotify redirectUri missing');

    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;

    this.refreshToken = null;
    this.accessToken = null;

    this.tokenFile = path.join(__dirname, '../tokens/spotify_tokens.json');
    this.loadTokensFromDisk();

    this._oauthState = null;

    this._readyResolve = null;
    this._readyReject = null;
    this._readyPromise = new Promise((res, rej) => {
      this._readyResolve = res;
      this._readyReject = rej;
    });
  }

  /**
   * Registers routes for the Spotify API, including starting OAuth and callback routes
   * as well as Now Playing overlay routes.
   * @param {express.Application} app - The Express application to register routes on.
   */
  registerRoutes(app) {
    // Start OAuth (aligned with Twitch pattern)
    app.get('/auth/spotify', (req, res) => {
      res.redirect(this.getAuthUrl());
    });

    // Spotify callback (aligned path)
    app.get('/callback/spotify', async (req, res) => {
      await this._handleCallback(req, res);
    });

    const overlayHTML = fs.readFileSync(
      path.join(process.cwd(), 'templates/now-playing.html'),
      'utf8'
    );

    app.get('/now-playing', (req, res) => res.send(overlayHTML));

    app.get('/now-playing-track', async (req, res) => {
      try {
        let track = await this.getCurrentTrack();
        track = track?.data?.item;
        res.send(
          track
            ? `${track.name} - ${track.artists.map(a => a.name).join(', ')}`
            : 'Nothing playing right now'
        );
      } catch (err) {
        console.error('Error fetching current track:', err.message);
        res.status(500).send('Unable to fetch current track');
      }
    });
    console.log('Spotify routes registered: /auth/spotify, /callback/spotify, /now-playing, /now-playing-track');
  }

/**
 * Returns a promise that resolves to the Spotify OAuth authorization URL if the access token is not already set.
 *
 * If the access token is already set, the promise will resolve to null and the `_readyResolve` promise will be resolved to true.
 *
 * @returns {Promise<string|null>} A promise that resolves to the Spotify OAuth authorization URL if not already set, or null if already set.
 */
  async getAuthUrlIfNeeded() {
    if (this.accessToken) {
      this._readyResolve(true);
      return null;
    }
    return this.getAuthUrl();
  }

/**
 * Returns a promise that resolves when the Spotify controller is authenticated and ready for use.
 *
 * If the Spotify controller is already authenticated, the promise will resolve immediately.
 * If not, the promise will resolve once the authentication flow is complete.
 */

  waitUntilReady() {
    return this._readyPromise;
  }

  /**
   * Generates the Spotify OAuth authorization URL to open.
   *
   * Generates a valid Spotify OAuth authorization URL using the client ID, redirect URI, scope, and state.
   * The URL is of the form: https://accounts.spotify.com/authorize?client_id=...&redirect_uri=...&response_type=code&scope=...&state=...
   *
   * @returns {string} The Spotify OAuth authorization URL to open.
   */
  getAuthUrl() {
    this._oauthState = crypto.randomBytes(16).toString('hex');

    const scope = [
      'user-modify-playback-state',
      'user-read-playback-state',
      'user-read-currently-playing',
      'user-read-recently-played',
    ].join(' ');

    const authParams = new URLSearchParams();
    authParams.append('response_type', 'code');
    authParams.append('client_id', this.clientId);
    authParams.append('redirect_uri', this.redirectUri);
    authParams.append('scope', scope);
    authParams.append('state', this._oauthState);

    return `https://accounts.spotify.com/authorize?${authParams.toString()}`;
  }

/**
 * Handles the Spotify OAuth callback from the authorization flow.
 *
 * This function validates the authorization code query parameter, exchanges it for an access token, and
 * saves the token payload to a file. If validation fails or the token exchange fails, it sets the
 * `_readyReject` promise to an error object with a descriptive message.
 *
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 * @returns {void} Nothing is returned, but the `_readyPromise` is resolved or rejected based on the result of
 * the authorization flow.
 */
  async _handleCallback(req, res) {
    const { code, state, error } = req.query;

    if (error) {
      res.status(400).send(`Spotify OAuth error: ${error}`);
      this._readyReject(new Error(`Spotify OAuth error: ${error}`));
      return;
    }

    if (!code) {
      res.status(400).send('Error: Missing authorization code.');
      this._readyReject(new Error('Missing Spotify authorization code'));
      return;
    }

    if (!state || state !== this._oauthState) {
      res.status(400).send('Invalid state (possible CSRF or stale login).');
      this._readyReject(new Error('Invalid Spotify OAuth state'));
      return;
    }

    const params = new URLSearchParams();
    params.append('code', code);
    params.append('redirect_uri', this.redirectUri);
    params.append('grant_type', 'authorization_code');

    const config = {
      headers: {
        Authorization:
          'Basic ' + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    };

    try {
      const tokenResponse = await this.request(
        () => axios.post('https://accounts.spotify.com/api/token', params, config),
        0
      );

      if (tokenResponse.data.refresh_token) {
        this.refreshToken = tokenResponse.data.refresh_token;
      }
      this.accessToken = tokenResponse.data.access_token;

      this.saveTokensToDisk();

      res.send('✅ Spotify OAuth complete. You can close this tab.');
      this._readyResolve(true);
    } catch (e) {
      console.error('Error during Spotify token exchange:', e.response?.data || e.message);
      res.status(500).send('Spotify OAuth failed');
      this._readyReject(e);
    }
  }

/**
 * Loads the current access and refresh tokens from a file.
 *
 * If the file does not exist, this function does nothing.
 *
 * If there is an error reading the file, the tokens are set to null and an error is logged.
 */
  loadTokensFromDisk() {
    try {
      if (fs.existsSync(this.tokenFile)) {
        const { accessToken, refreshToken } = JSON.parse(fs.readFileSync(this.tokenFile, 'utf8'));
        this.accessToken = accessToken || null;
        this.refreshToken = refreshToken || null;
        console.log('Loaded saved Spotify tokens.');
      }
    } catch (err) {
      console.error('Error loading Spotify tokens:', err);
      this.accessToken = null;
      this.refreshToken = null;
    }
  }

  /**
 * Saves the current access and refresh tokens to a file.
 *
 * If the directory containing the file does not exist, it will be created.
 * The tokens are written as a JSON object to the file in a human-readable format.
 *
 * @throws {Error} If there is an error writing the tokens to disk.
 */
  saveTokensToDisk() {
    try {
      const dir = path.dirname(this.tokenFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      fs.writeFileSync(
        this.tokenFile,
        JSON.stringify({ accessToken: this.accessToken, refreshToken: this.refreshToken }, null, 2),
        'utf8'
      );

      console.log('Spotify tokens saved successfully.');
    } catch (err) {
      console.error('Error saving Spotify tokens:', err);
    }
  }

  /**
 * Generic request wrapper for all Spotify API calls
 * Handles 401 token refresh, 403 premium check, 404 device not found
 * @param {Function} requestFn - A function that returns an axios promise
 * @param {number} retries - Number of retries (default 1)
 */
  async request(requestFn, retries = 1) {
    try {
      return await requestFn();
    } catch (error) {
      const status = error?.response?.status;
      const message = error?.response?.data?.error?.message || error.message;

      if (status === 401 && retries > 0 && this.refreshToken) {
        await this.refreshAccessToken();
        return this.request(requestFn, retries - 1);
      } else if (status === 403) {
        throw new Error(message);
      } else if (status === 404) {
        throw new Error('No active device found.');
      } else {
        console.error(`Spotify API error (${status || 'unknown'}): ${message}`);
        throw error;
      }
    }
  }

  /**
   * Refreshes the Spotify access token using the refresh token stored in a file.
   *
   * This function checks if the refresh token is available and if so, it makes a POST request to the
   * Spotify OAuth endpoint to get a new access token. If successful, it updates the internal access token
   * state and writes the new token data back to the file. If refreshing fails, it logs the error.
   *
   * @returns {Promise<void>} Resolves to nothing if the token was refreshed successfully, otherwise rejects with an error.
   */
  async refreshAccessToken() {
    if (!this.refreshToken) return;

    const params = new URLSearchParams();
    params.append('refresh_token', this.refreshToken);
    params.append('grant_type', 'refresh_token');

    const config = {
      headers: {
        Authorization:
          'Basic ' + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    };

    try {
      const response = await axios.post('https://accounts.spotify.com/api/token', params, config);
      if (response.data.refresh_token) this.refreshToken = response.data.refresh_token;
      this.accessToken = response.data.access_token;
      this.saveTokensToDisk();
      console.log('Spotify access token refreshed successfully.');
    } catch (error) {
      console.error('Error refreshing Spotify token:', error.message);
    }
  }

  /**
 * Ensures that the access token is available by refreshing it if necessary.
 *
 * This function checks if the access token is not available and if there is a
 * refresh token available. If both conditions are satisfied, it calls the
 * refreshAccessToken method to refresh the access token.
 *
 * @return {Promise<void>} A promise that resolves when the access token is
 * available.
 */
  async ensureAccessToken() {
    if (!this.accessToken && this.refreshToken) {
      await this.refreshAccessToken();
    }
  }

  // Get Track Info
  async getTrackInfo(trackId) {
    await this.ensureAccessToken();
    return this.request(() =>
      axios.get(`https://api.spotify.com/v1/tracks/${trackId}`, { headers: this.getSpotifyHeaders() })
    ).then(res => res.data);
  }

  /**
   * Retrieves the currently playing track from Spotify
   * @returns {Object | null} An object representing the currently playing track, or null if there is no track playing
   * @throws {Error} If there is an error fetching the current track
   */
  async getCurrentTrack() {
    await this.ensureAccessToken();
    const response = await this.request(() =>
      axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: this.getSpotifyHeaders(),
      })
    );
    if (response.status === 204 || !response.data) return null;
    return response;
  }

  /**
   * Adds a song to the user's Spotify queue.
   *
   * @param {string} uri - The Spotify URI of the song to be added.
   * @return {Promise<Object>} A Promise that resolves to the response data from the API call.
   */
  async addSongToQueue(uri) {
    await this.ensureAccessToken();

    return this.request(() =>
      axios.post(`https://api.spotify.com/v1/me/player/queue?uri=${uri}`, {}, { headers: this.getSpotifyHeaders() })
    ).then(res => res.data);
  }

  /**
   * Searches Spotify for a track ID based on a given search string, excluding command aliases, and returns it if the track is not blocked.
   * @param {string} searchString - Search string to look for a track ID.
   * @returns {string | false} - Track ID if found and not blocked, false otherwise.
   */
  async searchTrackID(searchString, currentConfig) {
    currentConfig.command_alias.forEach(alias => searchString = searchString.replace(alias, ''));
    searchString = searchString.replace(/-/g, ' ').replace(/ by /g, ' ').trim();

    if (!searchString) return false;

    const encoded = encodeURIComponent(searchString);
    const response = await this.request(() =>
      axios.get(`https://api.spotify.com/v1/search?q=${encoded}&type=track`, { headers: this.getSpotifyHeaders() })
    );

    const trackId = response.data?.tracks?.items?.[0]?.id;
    if (!trackId) return false;
    return currentConfig.blocked_tracks.includes(trackId) ? false : trackId;
  }

  /**
   * Retrieves the recently played tracks from Spotify for the user.
   *
   * This function ensures that the access token is available and then makes a
   * request to the Spotify API to retrieve the recently played tracks for the
   * user. It returns the response data from the API call.
   *
   * @param {object} client - The Twitch client instance used to send messages.
   * @param {string} channel - The Twitch channel where the tracks will be printed.
   * @param {object} currentConfig - The current configuration object.
   * @return {Promise<Object>} A Promise that resolves to the response data from the API call.
   */
  async getRecentlyPlayed() {
    await this.ensureAccessToken();

    return this.request(() =>
      axios.get('https://api.spotify.com/v1/me/player/recently-played', { headers: this.getSpotifyHeaders() })
    ).then(res => res.data.items || []);
  }

/**
 * Retrieves the user's Spotify queue.
 *
 * This function ensures that the access token is available and then makes a
 * request to the Spotify API to retrieve the user's queue. It returns the
 * response data from the API call.
 *
 * @return {Promise<Object[]>} A Promise that resolves to an array of objects representing the user's Spotify queue.
 */
  async getQueue() {
    await this.ensureAccessToken();
    return this.request(() =>
      axios.get('https://api.spotify.com/v1/me/player/queue', { headers: this.getSpotifyHeaders() })
    ).then(res => res.data.queue || []);
  }
/**
 * Returns an object containing the Authorization header for a Spotify API request.
 *
 * @returns {Object} - An object containing the Authorization header.
 */
  getSpotifyHeaders() {
    return { Authorization: `Bearer ${this.accessToken}` };
  }
};
