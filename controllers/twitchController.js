// controllers/twitchController.js
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { ToadScheduler, SimpleIntervalJob, AsyncTask } = require('toad-scheduler');

module.exports = class TwitchController {
  constructor({ clientId, clientSecret, redirectUri }) {
    if (!clientId) throw new Error('Twitch clientId missing');
    if (!clientSecret) throw new Error('Twitch clientSecret missing');
    if (!redirectUri) throw new Error('Twitch redirectUri missing');

    this.refunds_active = true;

    this.CLIENT_ID = clientId;
    this.CLIENT_SECRET = clientSecret;
    this.REDIRECT_URI = redirectUri;

    this.TOKEN_FILE = path.join(__dirname, '../tokens/twitch_token.json');

    // OAuth coordination (so index.js can await readiness if desired)
    this._oauthState = null;
    this._readyResolve = null;
    this._readyReject = null;
    this._readyPromise = new Promise((res, rej) => {
      this._readyResolve = res;
      this._readyReject = rej;
    });
  }

  registerRoutes(app) {
    // Start auth
    app.get('/auth/twitch', (req, res) => {
      res.redirect(this.getAuthUrl());
    });

    // Callback
    app.get('/callback/twitch', this._handleCallback.bind(this));

    console.log('Twitch routes registered: /auth/twitch, /callback/twitch');
  }

  waitUntilReady() {
    return this._readyPromise;
  }

  /**
   * If token exists+valid -> returns null.
   * If token missing/invalid -> returns the auth URL to open.
   */
  async getAuthUrlIfNeeded() {
    this.token = this.getSavedToken();
    if (this.token) {
      const ok = await this.validateTwitchToken();
      if (ok) {
        this._readyResolve(true);
        return null;
      }
    }
    return this.getAuthUrl();
  }

  /**
   * Returns the Twitch OAuth authorization URL to open.
   *
   * Generates a valid Twitch OAuth authorization URL using the client ID, redirect URI, scope, and state.
   * The URL is of the form: https://id.twitch.tv/oauth2/authorize?client_id=...&redirect_uri=...&response_type=code&scope=...&state=...
   *
   * @returns {string} The Twitch OAuth authorization URL to open.
   */
  getAuthUrl() {
    this._oauthState = crypto.randomBytes(16).toString('hex');

    const scope =
      'channel:read:redemptions channel:manage:redemptions user:read:email chat:read chat:edit clips:edit';

    return (
      `https://id.twitch.tv/oauth2/authorize` +
      `?client_id=${encodeURIComponent(this.CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(this.REDIRECT_URI)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(this._oauthState)}`
    );
  }

/**
 * Handles the Twitch OAuth callback from the authorization flow.
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
    try {
      const { code, state, error, error_description } = req.query;

      if (error) {
        res.status(400).send(`Twitch OAuth error: ${error} ${error_description || ''}`);
        this._readyReject(new Error(`Twitch OAuth error: ${error}`));
        return;
      }

      if (!code) {
        res.status(400).send('Missing "code" from Twitch');
        this._readyReject(new Error('Missing Twitch code'));
        return;
      }

      if (!state || state !== this._oauthState) {
        res.status(400).send('Invalid state (possible CSRF or stale login).');
        this._readyReject(new Error('Invalid Twitch OAuth state'));
        return;
      }

      const tokenRes = await axios.post('https://id.twitch.tv/oauth2/token', null, {
        params: {
          client_id: this.CLIENT_ID,
          client_secret: this.CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: this.REDIRECT_URI,
        },
      });

      // Ensure folder exists, save token payload
      const folder = path.dirname(this.TOKEN_FILE);
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(this.TOKEN_FILE, JSON.stringify(tokenRes.data, null, 2), 'utf8');

      this.token = tokenRes.data.access_token;

      res.send('✅ Twitch OAuth complete. You may now close this tab.');
      this._readyResolve(true);
    } catch (err) {
      console.error('Twitch OAuth callback error:', err.response?.data || err.message);
      res.status(500).send('Twitch OAuth failed');
      this._readyReject(err);
    }
  }

  async init(chatbotConfig) {
    // Load token (if any) and validate
    this.token = this.getSavedToken();

    if (!this.token) {
      // Token missing -> wait for OAuth callback
      console.log('[Twitch] No saved token. Visit /auth/twitch to connect.');
      // Don’t resolve here; index.js should open auth URL if needed and then waitUntilReady()
      await this.waitUntilReady();
    } else {
      console.log('[Twitch] Loaded saved Twitch token.');
      const ok = await this.validateTwitchToken();
      if (!ok) {
        console.warn('[Twitch] Saved token invalid/expired. Visit /auth/twitch to reconnect.');
        await this.waitUntilReady();
      }
    }

    // At this point, we should have a token
    this.broadcaster_id = await this.getBroadcasterId(chatbotConfig.channel_name);

    // Create/check reward
    await this.checkRewardExistence(chatbotConfig);

    // Token validation scheduler
    this.scheduler = new ToadScheduler();
    const validateTask = new AsyncTask('ValidateTwitchToken', async () => {
      await this.validateTwitchToken();
    });
    const validateJob = new SimpleIntervalJob({ hours: 1, runImmediately: true }, validateTask);
    this.scheduler.addSimpleIntervalJob(validateJob);

    if (!this.refunds_active) {
      console.error('[Twitch] Refunds disabled due to token validation failure.');
      this.reward_id = chatbotConfig.custom_reward_id;
      return;
    }
  }

      /**
     * Creates a Twitch clip for the current broadcaster.
     *
     * This function sends a request to the Twitch API to create a clip of the 
     * current stream for the broadcaster associated with this instance. The 
     * created clip does not have a delay.
     *
     * @returns {Promise<string|null>} - Returns the URL of the created clip if 
     * successful, otherwise returns null if an error occurs.
     */
      async createClip() {
        //Create the Clip
        try {
            const res = await axios.post('https://api.twitch.tv/helix/clips', null, {
                params: {
                    broadcaster_id: this.broadcaster_id,
                    has_delay: false
                },
                headers: this.getTwitchHeaders()
            });
            const clipURL = `https://clips.twitch.tv/${res.data.data[0].id}`;
            return clipURL;
        } catch (error) {
            console.error("Error creating clip:", error);
            return null;
        }
    }

  getSavedToken() {
    if (fs.existsSync(this.TOKEN_FILE)) {
      const data = JSON.parse(fs.readFileSync(this.TOKEN_FILE, 'utf8'));
      this.token = data.access_token;
      return this.token;
    }
    return null;
  }

/**
* Refreshes the Twitch access token using the refresh token stored in a file.
* 
* This function checks if the token file exists and reads the refresh token from it.
* It then makes a POST request to the Twitch OAuth endpoint to get a new access token.
* If successful, it updates the internal access token state and writes the new token
* data back to the file. If refreshing fails, it logs the error and returns false.
* 
* @returns {Promise<boolean>} Resolves to true if the token was refreshed successfully, otherwise false.
*/  async refreshAccessToken() {
    if (!fs.existsSync(this.TOKEN_FILE)) {
      console.error('No refresh token available.');
      return false;
    }

    const tokenData = JSON.parse(fs.readFileSync(this.TOKEN_FILE, 'utf8'));
    if (!tokenData.refresh_token) {
      console.error('Refresh token missing from token file.');
      return false;
    }

    try {
      const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
        params: {
          grant_type: 'refresh_token',
          refresh_token: tokenData.refresh_token,
          client_id: this.CLIENT_ID,
          client_secret: this.CLIENT_SECRET,
        },
      });

      this.token = res.data.access_token;

      fs.writeFileSync(this.TOKEN_FILE, JSON.stringify(res.data, null, 2), 'utf8');
      console.log('Access token refreshed successfully.');
      return true;
    } catch (err) {
      console.error('Failed to refresh access token:', err.response?.data || err.message);
      return false;
    }
  }

    /**
     * Formats auth headers
     * @returns {{Authorization: string, "Client-ID": string}}
     */
  getTwitchHeaders() {
    return {
      Authorization: `Bearer ${this.token}`,
      'Client-ID': this.CLIENT_ID,
    };
  }

  /**
 * Check if we have created a reward in a past session. If so, we will use that reward.
 * Otherwise we will create a new reward.
 * @param chatbotConfig - for settings in order to create a new reward
 */
async checkRewardExistence(chatbotConfig) {
    try {
        let res = await axios.get('https://api.twitch.tv/helix/channel_points/custom_rewards', {
            params: {
                'broadcaster_id': this.broadcaster_id,
                'only_manageable_rewards': true
            },
            headers: this.getTwitchHeaders()
        });
        if (res.data.data.length === 0) {
            await this.createReward(chatbotConfig.custom_reward_name, chatbotConfig.custom_reward_cost);
        }
        else {
            this.reward_id = res.data.data[0].id;
        }
    } catch (error) {
        console.error(error);
    }
}

/**
* Validates the current Twitch OAuth token.
* Attempts to verify the token by making a GET request to the Twitch validation endpoint.
* If the token is invalid, it tries to refresh the token. If refreshing fails, it disables refunds but keeps the chat active.
* Checks if the token has the necessary scope for managing redemptions. If not, disables refunds.
* Updates the `refunds_active` state based on the validation results.
* Logs relevant information and errors during the process.
*/
  async validateTwitchToken() {
    try {
      const res = await axios.get('https://id.twitch.tv/oauth2/validate', {
        headers: { Authorization: `OAuth ${this.token}` },
        validateStatus: (status) => [200, 401].includes(status),
      });

      if (res.status === 401) {
        console.warn('[Twitch] Token invalid, attempting refresh...');
        const refreshed = await this.refreshAccessToken();
        if (!refreshed) {
          console.error('[Twitch] Token refresh failed. Refunds will be disabled.');
          this.refunds_active = false;
          return false;
        }
        return await this.validateTwitchToken();
      }

      if (res.status === 200 && !res.data.scopes.includes('channel:manage:redemptions')) {
        console.warn('[Twitch] Token valid but missing channel:manage:redemptions.');
        this.refunds_active = false;
        return false;
      }

      this.refunds_active = true;
      return true;
    } catch (error) {
      console.error('[Twitch] Token validation error:', error);
      this.refunds_active = false;
      return false;
    }
  }
  /**
 * Refunds points, returns true is successful, false otherwise.
 * @returns {Promise<boolean>}
 */
async refundPoints() {
    // refunds not activated.
    if (!this.refunds_active) { return false; }
    try {
        let id = await this.getLastRedemptionId();
        if (id === null) { return false; }
        await axios.patch(`https://api.twitch.tv/helix/channel_points/custom_rewards/redemptions`,
            { 'status': 'CANCELED' },
            {
                params: {
                    'id': id,
                    'broadcaster_id': this.broadcaster_id,
                    'reward_id': this.reward_id
                },
                headers: this.getTwitchHeaders()
            });
        return true;
    } catch (error) {
        return false;
    }

}

/**
* Completes Point Redemption, returns true if successful, false otherwise.
* @returns {Promise<boolean>}
*/
async fulfillRedemption() {
    if (!this.refunds_active) { return false; }
    try {
        let id = await this.getLastRedemptionId();
        if (id === null) { return false; }
        await axios.patch(`https://api.twitch.tv/helix/channel_points/custom_rewards/redemptions`,
            { 'status': 'FULFILLED' },
            {
                params: {
                    'id': id,
                    'broadcaster_id': this.broadcaster_id,
                    'reward_id': this.reward_id
                },
                headers: this.getTwitchHeaders()
            });
        return true;
    } catch (error) {
        return false;
    }

}

/**
* Creates a new channel point reward
* @param name - name of the new reward
* @param cost - cost of the new reward
*/
async createReward(name, cost) {
    try {
        let res = await axios.post('https://api.twitch.tv/helix/channel_points/custom_rewards',
            {
                'title': name,
                'cost': parseInt(cost),
                'is_user_input_required': true
            },
            {
                params: { 'broadcaster_id': this.broadcaster_id },
                headers: this.getTwitchHeaders()
            });
        this.reward_id = res.data.data[0].id;
    } catch (error) {
        console.error(error);
    }
}

/**
* Gets current broadcaster_id from channel_name
* @param broadcaster_name
*/
async getBroadcasterId(broadcaster_name) {
    try {
        let res = await axios.get('https://api.twitch.tv/helix/users',
            {
                params: { 'login': broadcaster_name },
                headers: this.getTwitchHeaders(),
                validateStatus: function (status) {
                    return status < 500;
                }
            });
        if (res.status === 200) {
            return res.data.data[0].id;
        }
        // this is fatal and many parts will not work without this, means twitch oauth is broken
        console.error("Failed to get broadcaster ID!");
        console.error("This likely means your OAuth token is invalid. Please check your token. If this error persists, contact devs.");
    } catch (error) {
        console.error(error);
    }
}

/**
* Gets the id of the last redemption for use in refundPoints()
* @returns {Promise<string>}
*/
async getLastRedemptionId() {
    try {
        let res = await axios.get('https://api.twitch.tv/helix/channel_points/custom_rewards/redemptions', {
            params: {
                'broadcaster_id': this.broadcaster_id,
                'reward_id': this.reward_id,
                'status': 'UNFULFILLED',
                'sort': 'NEWEST',
                'first': 1
            },
            headers: this.getTwitchHeaders()
        });
        // Check that the returned array isn't empty
        if (res.data.data.length === 0) {
            console.error(`The redemptions array was empty. ` +
                `Please make sure that you have not enabled 'skip redemption requests queue.'`);
            return null;
        }
        // If the last redeemed ID was over a minute ago, something is wrong.
        if (Date.now() - Date.parse(res.data.data[0].redeemed_at) > 60_000) {
            console.error(`The latest reward was redeemed over a minute ago. Please contact the devs.`);
            return null;
        }
        return res.data.data[0].id;
    } catch (error) {
        console.error(error);
        return null;
    }

}

  // keep: createClip, checkRewardExistence, createReward, getBroadcasterId, refundPoints, fulfillRedemption, getLastRedemptionId...
};
        