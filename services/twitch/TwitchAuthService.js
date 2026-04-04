// services/twitch/TwitchAuthService.js

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * TwitchAuthService - Manages Twitch OAuth authentication and token lifecycle
 * Handles token storage, validation, refresh, and OAuth flow
 */
class TwitchAuthService {
  constructor({ clientId, clientSecret, redirectUri }) {
    if (!clientId) throw new Error('Twitch clientId missing');
    if (!clientSecret) throw new Error('Twitch clientSecret missing');
    if (!redirectUri) throw new Error('Twitch redirectUri missing');

    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;

    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = null;

    this.tokenFile = path.join(__dirname, '../../tokens/twitch_token.json');
    this.loadTokensFromDisk();

    // OAuth state for CSRF protection
    this.oauthState = null;
    this.readyPromise = null;
    this.readyResolve = null;
    this.readyReject = null;

    this.initReadyPromise();
  }

  initReadyPromise() {
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
  }

  /**
   * Returns the promise for OAuth completion
   * @returns {Promise<boolean>} Resolves when OAuth completes or fails
   */
  waitUntilReady() {
    return this.readyPromise;
  }

  /**
   * Gets OAuth URL if token is missing or invalid, otherwise resolves
   * @returns {Promise<string|null>} OAuth URL if needed, null if already authenticated
   */
  async getAuthUrlIfNeeded() {
    if (this.accessToken) {
      const valid = await this.validateToken();
      if (valid) {
        this.readyResolve(true);
        return null;
      } else {
        console.warn('[Twitch] Saved token invalid/expired. Re-authentication required.');
      }
    }
    return this.getAuthUrl();
  }

  /**
   * Generates and returns OAuth authorization URL
   * @returns {string} Authorization URL
   */
  getAuthUrl() {
    this.oauthState = crypto.randomBytes(16).toString('hex');

    const scope = 'channel:read:redemptions channel:manage:redemptions user:read:email chat:read chat:edit clips:edit';

    return (
      `https://id.twitch.tv/oauth2/authorize?` +
      `client_id=${encodeURIComponent(this.clientId)}&` +
      `redirect_uri=${encodeURIComponent(this.redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scope)}&` +
      `state=${encodeURIComponent(this.oauthState)}`
    );
  }

  /**
   * Handles OAuth callback and exchanges code for tokens
   * @param {string} code - Authorization code
   * @param {string} state - OAuth state from callback
   * @returns {Promise<Object>} Token information
   */
  async handleCallback(code, state) {
    if (!code) {
      throw new Error('Missing authorization code');
    }

    if (!state || state !== this.oauthState) {
      throw new Error('Invalid OAuth state (possible CSRF)');
    }

    let tokenResponse;
    try {
      tokenResponse = await axios.post(
        'https://id.twitch.tv/oauth2/token',
        null,
        {
          params: {
            client_id: this.clientId,
            client_secret: this.clientSecret,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: this.redirectUri
          }
        }
      );
    } catch (error) {
      throw new Error(`Token exchange failed: ${error.response?.data?.message || error.message}`);
    }

    await this.storeTokens(tokenResponse.data);

    return {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      expiresIn: tokenResponse.data.expires_in,
      scope: tokenResponse.data.scope
    };
  }

  /**
   * Refreshes the access token if expired
   * @returns {Promise<string>} New access token
   */
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await axios.post(
        'https://id.twitch.tv/oauth2/token',
        null,
        {
          params: {
            client_id: this.clientId,
            client_secret: this.clientSecret,
            refresh_token: this.refreshToken,
            grant_type: 'refresh_token'
          }
        }
      );

      await this.storeTokens(response.data);
      return this.accessToken;
    } catch (error) {
      throw new Error(`Token refresh failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Validates if access token is valid and not expired
   * @returns {Promise<boolean>} True if token is valid
   */
  async validateToken() {
    if (!this.accessToken || !this.tokenExpiresAt || Date.now() >= this.tokenExpiresAt) {
      return false;
    }

    try {
      // Validate by making test API call
      await axios.get('https://api.twitch.tv/helix/users', {
        headers: {
          'Client-ID': this.clientId,
          Authorization: `Bearer ${this.accessToken}`
        }
      });
      return true;
    } catch (error) {
      if (error.response?.status === 401) {
        console.warn('[Twitch] Token validation failed: token may be expired or invalid');
        return false;
      }
      console.warn('[Twitch] Token validation error:', error.message);
      return false;
    }
  }

  /**
   * Gets current valid access token, refreshing if needed
   * @returns {Promise<string>} Valid access token
   */
  async getValidToken() {
    if (this.accessToken && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    if (this.refreshToken) {
      return await this.refreshAccessToken();
    }

    throw new Error('No valid token available. User must authenticate.');
  }

  /**
   * Stores tokens to disk and memory
   * @param {Object} tokenData - Token data from OAuth
   */
  async storeTokens(tokenData) {
    this.accessToken = tokenData.access_token;
    this.refreshToken = tokenData.refresh_token || this.refreshToken;
    this.tokenExpiresAt = Date.now() + (tokenData.expires_in * 1000);

    // Ensure directory exists
    const folder = path.dirname(this.tokenFile);
    fs.mkdirSync(folder, { recursive: true }, (err) => {
      if (err && err.code !== 'EEXIST') throw err;
    });

    // Save token file
    fs.writeFileSync(
      this.tokenFile,
      JSON.stringify({
        access_token: this.accessToken,
        refresh_token: this.refreshToken,
        expires_at: this.tokenExpiresAt,
        scope: tokenData.scope
      }, null, 2),
      'utf8'
    );

    console.log('[Twitch] Token saved successfully');
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
        console.log('[Twitch] Tokens loaded from disk');
      } else {
        console.log('[Twitch] No token file found, authentication required');
      }
    } catch (error) {
      console.warn('[Twitch] Failed to load tokens from disk:', error.message);
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
      console.log('[Twitch] Tokens cleared');
    }
  }

  /**
   * Get authentication headers for API requests
   * @returns {Promise<Object>} Headers object with Authorization
   */
  async getAuthHeaders() {
    const token = await this.getValidToken();
    return {
      'Client-ID': this.clientId,
      'Authorization': `Bearer ${token}`
    };
  }

  /**
   * Get broadcaster ID for a channel
   * @param {string} channelName - Channel name
   * @returns {Promise<string>} Broadcaster ID
   */
  async getBroadcasterId(channelName) {
    try {
      const headers = await this.getAuthHeaders();
      const response = await axios.get(
        'https://api.twitch.tv/helix/users',
        {
          headers,
          params: { login: channelName }
        }
      );

      if (response.data.data.length === 0) {
        throw new Error(`Channel ${channelName} not found`);
      }

      return response.data.data[0].id;
    } catch (error) {
      throw new Error(`Failed to get broadcaster ID: ${error.message}`);
    }
  }
}

module.exports = TwitchAuthService;
