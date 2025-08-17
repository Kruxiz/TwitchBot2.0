const axios = require('axios');
const express = require('express');
const open = require('open');
const { log } = require('../logger.js');
const fs = require('fs');
const path = require('path');

module.exports = class SpotifyController {
    constructor(clientId, clientSecret, port) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.refreshToken = null;
        this.accessToken = null;
        this.redirectUri = `http://127.0.0.1:${port}/callback`;
        this.tokenFile = path.join(__dirname, '../tokens/spotify_tokens.json');
        this.loadTokensFromDisk();
    }

    /**
     * Loads the saved Spotify access and refresh tokens from a file.
     *
     * If the file exists, it reads the tokens from the file and updates the
     * corresponding instance variables. If the file does not exist or there
     * is an error reading the file, it logs an error message.
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
            console.error('Error loading tokens:', err);
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
            // Ensure the directory exists
            const dir = path.dirname(this.tokenFile);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
            // Write the token file
            fs.writeFileSync(this.tokenFile, JSON.stringify({
                accessToken: this.accessToken,
                refreshToken: this.refreshToken
            }, null, 2));
    
            console.log('Spotify tokens saved successfully.');
        } catch (err) {
            console.error('Error saving tokens:', err);
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
     * Initializes the Spotify OAuth flow and sets up routes for token exchange and current track display.
     *
     * This method configures an Express application to handle Spotify OAuth authentication.
     * It defines the following routes:
     * 1. `/login`: Redirects the user to Spotify's authorization page with the necessary scopes.
     * 2. `/callback`: Handles the OAuth callback, exchanges the authorization code for tokens,
     *    and stores the access and refresh tokens.
     * 3. `/now-playing`: Serves an HTML page displaying the currently playing track.
     * 4. `/now-playing-track`: Returns the current track information as plain text.
     *
     * Starts the Express server on the specified port and opens the login page in the default browser.
     *
     * @param {number} port - The port on which the Express server will listen.
         * Initializes the Spotify OAuth flow and sets up routes
     */
    init(port) {
        let app = express();
        // Login Route
        app.get('/login', (req, res) => {
            const scope = 'user-modify-playback-state user-read-playback-state user-read-currently-playing user-read-recently-played';
            const authParams = new URLSearchParams();
            authParams.append('response_type', 'code');
            authParams.append('client_id', this.clientId);
            authParams.append('redirect_uri', this.redirectUri);
            authParams.append('scope', scope);
            res.redirect(`https://accounts.spotify.com/authorize?${authParams}`);
        });

        // Callback Route
        app.get('/callback', async (req, res) => {
            let code = req.query.code || null;

            if (!code) {
                return res.status(400).send('Error: Missing authorization code.');
            }

            const params = new URLSearchParams();
            params.append('code', code);
            params.append('redirect_uri', this.redirectUri);
            params.append('grant_type', 'authorization_code');

            const config = {
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(this.clientId + ':' + this.clientSecret).toString('base64'),
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            };

            try {
                const tokenResponse = await this.request(() =>
                    axios.post('https://accounts.spotify.com/api/token', params, config),
                    0 // No retry on initial token exchange
                );

                if (tokenResponse.data.refresh_token) {
                    this.refreshToken = tokenResponse.data.refresh_token;

                }
                this.accessToken = tokenResponse.data.access_token;
                this.saveTokensToDisk(); // Save tokens to disk
                console.log('Tokens saved successfully.');
                res.send('Tokens refreshed successfully. You can close this tab');
            } catch (error) {
                console.error('Error during token exchange:', error.message);
                res.status(500).send('Internal Server Error');
            }
        });

        const overlayHTML = fs.readFileSync(path.join(process.cwd(), 'now-playing.html'), 'utf8');

        app.get('/now-playing', (req, res) => {
            res.send(overlayHTML);
        });

        app.get('/now-playing-track', async (req, res) => {
            let track = await this.getCurrentTrack();
            track = track.data.item;
            res.send(track.name + " - " + track.artists.map(a => a.name).join(', ') || 'Nothing playing right now');
        });

        // Start Express Server
        app.listen(port, () => {
            console.log(`App running. Visit http://localhost:${port}/login to refresh tokens.`);
        });

        open(`http://127.0.0.1:${port}/login`);
        console.log(`Now Playing overlay available at http://127.0.0.1:${port}/now-playing`);
    }

    // Refresh Access Token
    async refreshAccessToken() {
        if (!this.refreshToken) return;

        const params = new URLSearchParams();
        params.append('refresh_token', this.refreshToken);
        params.append('grant_type', 'refresh_token');
        //params.append('redirect_uri', this.redirectUri); not required for refresh tokens

        const config = {
            headers: {
                'Authorization': 'Basic ' + Buffer.from(this.clientId + ':' + this.clientSecret).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        };

        try {
            const response = await axios.post('https://accounts.spotify.com/api/token', params, config);
            if (response.data.refresh_token) {
                this.refreshToken = response.data.refresh_token;
            }
            this.accessToken = response.data.access_token;
            this.saveTokensToDisk(); // <-- Save to disk here
            console.log('Spotify access token refreshed successfully.');
        } catch (error) {
            console.error('Error refreshing token:', error.message);
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
            axios.get('https://api.spotify.com/v1/me/player/currently-playing', { headers: this.getSpotifyHeaders() })
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
        searchString = searchString.replace(/-/, ' ').replace(/ by /, ' ').trim();

        if (!searchString) return false;

        const encoded = encodeURIComponent(searchString);
        const response = await this.request(() =>
            axios.get(`https://api.spotify.com/v1/search?q=${encoded}&type=track`, { headers: this.getSpotifyHeaders() })
        );

        const trackId = response.data.tracks.items[0]?.id;
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
    async getRecentlyPlayed(client, channel, currentConfig) {
        await this.ensureAccessToken();

        return this.request(() =>
            axios.get('https://api.spotify.com/v1/me/player/recently-played', { headers: this.getSpotifyHeaders() })
        ).then(res => res.data.items || []);
    }

    async getQueue (){
        await this.ensureAccessToken();
        return this.request(() =>
            axios.get('https://api.spotify.com/v1/me/player/queue', { headers: this.getSpotifyHeaders() })
        ).then (res => res.data.queue || []);
    }

    getSpotifyHeaders() {
        return { 'Authorization': `Bearer ${this.accessToken}` };
    }
};
