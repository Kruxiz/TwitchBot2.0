// twitchController.js
const axios = require('axios');
const path = require('path');
const open = require('open');
const { ToadScheduler, SimpleIntervalJob, AsyncTask } = require('toad-scheduler');
const fs = require('fs');
const express = require('express');

module.exports = class TwitchController {
/**
 * Initializes a new instance of the TwitchController class.
 * Sets the client ID and client secret from environment variables.
 * Initializes the redirect URI for OAuth callbacks.
 * Activates refunds by default.
 */
    constructor() {
        this.refunds_active = true; // refunds are active by default
        this.CLIENT_ID = process.env.TWITCH_CLIENT_ID;
        this.CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
        this.REDIRECT_URI = 'http://localhost:3000/callback';
        this.TOKEN_FILE = path.join(__dirname, 'twitch_token.json');
    }

    async init(chatbotConfig) {
        // Try passed token or fallback to saved token
        this.token = this.getSavedToken();
        if (!this.token) {
            console.log("No saved token found, starting OAuth flow...");
            await this.startOAuthServer();
            this.token = this.getSavedToken();  // Retrieve token saved by startOAuthServer
        } else {
            console.log("Loaded saved Twitch token.");
            const isValid = await this.validateTwitchToken();
            if (!isValid) {
                console.warn("Saved token is invalid or expired. Starting OAuth flow...");
                await this.startOAuthServer();
                this.token = this.getSavedToken();

                // Optionally: validate the new token again
                const newIsValid = await this.validateTwitchToken();
                if (!newIsValid) {
                    console.error("Newly obtained token is still invalid. Initialization failed.");
                    return;
                }
            }
        }

        this.broadcaster_id = await this.getBroadcasterId(chatbotConfig.channel_name);
        // check if the reward exists, if not create it
        await this.checkRewardExistence(chatbotConfig);

        // Set up token validation job
        this.scheduler = new ToadScheduler();
        const validateTask = new AsyncTask('ValidateTwitchToken', async () => {
            await this.validateTwitchToken();
        });
        const validateJob = new SimpleIntervalJob({ hours: 1, runImmediately: true }, validateTask);
        this.scheduler.addSimpleIntervalJob(validateJob);

        // Validate token and check reward
        if (!this.refunds_active) {
            console.error("Refunds were enabled, but token validation failed.");
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

/**
 * Starts a local Express server to handle the OAuth flow for Twitch authentication.
 * 
 * This server listens on port 3000 and provides two endpoints:
 * 1. `/login`: Redirects the user to the Twitch OAuth authorization page for user authentication.
 * 2. `/callback`: Handles the OAuth callback with the authorization code, exchanges it for an access token,
 *    and saves the token data to a file for future use. Closes the server after completing the flow.
 * 
 * The function returns a Promise that resolves with the access token upon successful authentication,
 * or rejects with an error if the OAuth process fails.
 */startOAuthServer() {
        return new Promise((resolve, reject) => {
            const app = express();

            // OAuth login route
            app.get('/login', (req, res) => {
                const scope = 'channel:read:redemptions channel:manage:redemptions user:read:email chat:read chat:edit clips:edit';
                const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${this.CLIENT_ID}&redirect_uri=${encodeURIComponent(this.REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scope)}`;
                res.redirect(authUrl);
            });

            // OAuth callback route
            app.get('/callback', async (req, res) => {
                const code = req.query.code;
                console.log("Received OAuth code:", code); // Debug log to ensure callback is hit
                try {
                    const tokenRes = await axios.post('https://id.twitch.tv/oauth2/token', null, {
                        params: {
                            client_id: this.CLIENT_ID,
                            client_secret: this.CLIENT_SECRET,
                            code,
                            grant_type: 'authorization_code',
                            redirect_uri: this.REDIRECT_URI
                        }
                    });

                    // Save the token to file
                    fs.writeFileSync(this.TOKEN_FILE, JSON.stringify(tokenRes.data, null, 2));
                    console.log("Twitch token saved to file.");
                    this.token = tokenRes.data.access_token;

                    // Send response to user
                    res.send("Twitch OAuth complete. You may now close this tab.");
                    // Force close the server without waiting for other connections
                    console.log("Forcefully closing server..."); // Debug log to ensure server.close() is called
                    server.close(() => {
                        console.log("OAuth server closed.");
                        resolve(this.token);
                    });

                } catch (err) {
                    console.error("OAuth error:", err.response?.data || err.message);
                    res.status(500).send("OAuth failed");

                    // Force close the server in case of an error
                    console.log("Force closing server with error..."); // Debug log to ensure server.close() is called
                    server.close(() => {
                        console.log("OAuth server closed with error.");
                        reject(err);

                        // Shut down the bot process if OAuth fails
                        console.log("Shutting down the bot due to error...");
                        process.exit(1); // Exit immediately with error code
                    });
                }
            });

            // Start the server and open the OAuth login page
            const server = app.listen(3000, () => {
                open(`http://localhost:3000/login`);
                console.log("OAuth server started on http://localhost:3000.");
            });

            // Log server startup to confirm it's running
            console.log("OAuth server is now running...");
        });
    }


    /**
     * Retrieves the saved Twitch access token from a file.
     * 
     * This function checks if the token file exists and reads the access token from it.
     * If the token is successfully read, it updates the internal token state and returns it.
     * If the token file does not exist, the function returns false.
     * 
     * @returns {string|boolean} The access token if it exists, otherwise false.
     */

    getSavedToken() {
        if (fs.existsSync(this.TOKEN_FILE)) {
            const data = JSON.parse(fs.readFileSync(this.TOKEN_FILE));
            this.token = data.access_token;
            return this.token;
            console.log(`token: ${this.token}`);
        }
        return false;
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
*/    async refreshAccessToken() {
        if (!fs.existsSync(this.TOKEN_FILE)) {
            console.error("No refresh token available.");
            return false;
        }

        const tokenData = JSON.parse(fs.readFileSync(this.TOKEN_FILE));
        if (!tokenData.refresh_token) {
            console.error("Refresh token missing from token file.");
            return false;
        }

        try {
            const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
                params: {
                    grant_type: 'refresh_token',
                    refresh_token: tokenData.refresh_token,
                    client_id: this.CLIENT_ID,
                    client_secret: this.CLIENT_SECRET
                }
            });

            this.token = res.data.access_token;

            // Save updated tokens to file
            fs.writeFileSync(this.TOKEN_FILE, JSON.stringify(res.data, null, 2));
            console.log("Access token refreshed successfully.");
            return true;
        } catch (err) {
            console.error("Failed to refresh access token:", err.response?.data || err.message);
            return false;
        }
    }

    /**
     * Formats auth headers
     * @returns {{Authorization: string, "Client-ID": string}}
     */
    getTwitchHeaders() {
        return {
            'Authorization': `Bearer ${this.token}`,
            'Client-ID': this.CLIENT_ID
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
            let res = await axios.get('https://id.twitch.tv/oauth2/validate', {
                headers: { 'Authorization': `OAuth ${this.token}` },
                validateStatus: (status) => [200, 401].includes(status)
            });

            if (res.status === 401) {
                console.warn('[Twitch] Token invalid, attempting refresh...');
                const refreshed = await this.refreshAccessToken();

                if (!refreshed) {
                    console.error('[Twitch] Token refresh failed. Refunds will be disabled, but chat will remain active.');
                    this.refunds_active = false;
                    return false;  // return false here!
                }

                // Revalidate with new token
                return await this.validateTwitchToken();
            }

            if (res.status === 200 && !res.data['scopes'].includes('channel:manage:redemptions')) {
                console.warn('[Twitch] Token is valid, but missing "channel:manage:redemptions". Channel Points handling disabled.');
                this.refunds_active = false;
                return false;  // return false: valid token but missing scope
            } else if (res.status === 200) {
                this.refunds_active = true;
                return true;  // return true: valid token & has required scope
            }

        } catch (error) {
            console.error('[Twitch] Token validation error:', error);
            this.refunds_active = false;
            return false;  // ⬅️ return false in case of exception
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
            this.reward_id = res.data.data.id;
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
        }

    }
}