// services/spotify/SpotifyAuthService.js

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * SpotifyAuthService - Manages Spotify OAuth authentication and token lifecycle
 * Handles token storage, refresh, validation, and OAuth flow
 */
class SpotifyAuthService {
  constructor({ clientId, clientSecret, redirectUri }) {
    if (!clientId) throw new Error('Spotify clientId missing');
    if (!clientSecret) throw new Error('Spotify clientSecret missing');
    if (!redirectUri) throw new Error('Spotify redirectUri missing');

    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;

    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = null;

    this.tokenFile = path.join(__dirname, '../../tokens/spotify_tokens.json');
    this.loadTokensFromDisk();

    // OAuth flow state
    this._oauthState = null;
    this._readyPromise = null;
    this._readyResolve = null;
    this._readyReject = null;

    this.initReadyPromise();
  }

  initReadyPromise() {
    this._readyPromise = new Promise((resolve, reject) => {
      this._readyResolve = resolve;
      this._readyReject = reject;
    });
  }

  /**
   * Returns a promise that resolves when authentication is ready
   */
  waitUntilReady() {
    return this._readyPromise;
  }

  /**
   * Gets OAuth URL if authentication is needed, otherwise resolves immediately
   */
  async getAuthUrlIfNeeded() {
    if (this.accessToken) {
      this._readyResolve(true);
      return null;
    }
    return this.getAuthUrl();
  }

  /**
   * Generates and returns OAuth authorization URL
   */
  getAuthUrl() {
    this._oauthState = crypto.randomBytes(16).toString('hex');

    const scope = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';

    return (
      `https://accounts.spotify.com/authorize` +
      `?client_id=${encodeURIComponent(this.clientId)}` +
      `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(this._oauthState)}`
    );
  }

  /**
   * Handles OAuth callback and exchanges code for tokens
   */
  async handleCallback(code, state) {
    if (!code) {
      throw new Error('Missing authorization code');
    }

    if (!state || state !== this._oauthState) {
      throw new Error('Invalid state (possible CSRF)');
    }

    const tokenRes = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: this.redirectUri,
        client_id: this.clientId,
        client_secret: this.clientSecret
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    await this.storeTokens(tokenRes.data);

    return {
      accessToken: this.accessToken,
      refreshToken: this.accessToken,
      expiresIn: tokenRes.data.expires_in
    };
  }

  /**
   * Refreshes access token using refresh token
   */
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const tokenRes = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    await this.storeTokens(tokenRes.data);

    return this.accessToken;
  }

  /**
   * Checks if token is valid and not expired
   */
  isTokenValid() {
    return this.accessToken && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt;
  }

  /**
   * Returns valid access token, refreshing if needed
   */
  async getValidToken() {
    if (this.isTokenValid()) {
      return this.accessToken;
    }

    if (this.refreshToken) {
      return await this.refreshAccessToken();
    }

    throw new Error('No valid token available');
  }

  /**
   * Stores tokens to disk and memory
   */
  async storeTokens(tokenData) {
    this.accessToken = tokenData.access_token;
    this.refreshToken = tokenData.refresh_token || this.refreshToken;
    this.tokenExpiresAt = Date.now() + (tokenData.expires_in * 1000);

    // Save to disk
    const folder = path.dirname(this.tokenFile);
    fs.mkdirSync(folder, { recursive: true });

    fs.writeFileSync(
      this.tokenFile,
      JSON.stringify({
        access_token: this.accessToken,
        refresh_token: this.refreshToken,
        expires_at: this.tokenExpiresAt
      }, null, 2),
      'utf8'
    );
  }

  /**
   * Loads tokens from disk
   */
  loadTokensFromDisk() {
    try {
      if (fs.existsSync(this.tokenFile)) {
        const data = JSON.parse(fs.readFileSync(this.tokenFile, 'utf8'));
        this.accessToken = data.access_token;
        this.refreshToken = data.refresh_token;
        this.tokenExpiresAt = data.expires_at;
      }
    } catch (error) {
      console.warn('Failed to load Spotify tokens from disk:', error.message);
    }
  }

  /**
   * Clears all tokens (logout)
   */
  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = null;
    this.initReadyPromise();

    if (fs.existsSync(this.tokenFile)) {
      fs.unlinkSync(this.tokenFile);
    }
  }

  /**
   * Gets authentication headers for API requests
   */
  getAuthHeaders() {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }
    return {
      'Authorization': `Bearer ${this.accessToken}`
    };
  }
}

module.exports = SpotifyAuthService;
