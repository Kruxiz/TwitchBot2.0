const axios = require('axios');
const express = require('express');
const open = require('open');
const { log } = require('../logger');

// Constants
let spotifyAccessToken = '';
let spotifyRefreshToken = '';

module.exports = class SpotifyController {
    constructor(clientId, clientSecret, port) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.refreshToken = null;
        this.accessToken = null;
        this.redirectUri = `http://localhost:${port}/callback`;
    }
    // Express Initialization Method
    init(port) {
        let app = express();

        //log the redirect uri
        console.log(`Redirect URI: ${this.redirectUri}`);
        // Login Route
        app.get('/login', (req, res) => {
            const scope = 'user-modify-playback-state user-read-playback-state user-read-currently-playing';
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
                let tokenResponse = await axios.post('https://accounts.spotify.com/api/token', params, config);

                if (tokenResponse.status !== 200) {
                    return res.status(400).send('Error: Failed to get tokens');
                }

                this.accessToken = tokenResponse.data.access_token;
                this.refreshToken = tokenResponse.data.refresh_token;

                // Store the refresh token for later use
                this.refreshToken = spotifyRefreshToken;
                
                res.send('Tokens refreshed successfully. You can close this tab');
            } catch (error) {
                console.error('Error during token exchange:', error);
                res.status(500).send('Internal Server Error');
            }
        });

        app.get('/now-playing', (req, res) => {
            res.send(`
              <html>
                <head>
                  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600&display=swap" rel="stylesheet">
                  <style>
                    body {
                      margin: 0;
                      font-family: 'Montserrat', sans-serif;
                      background: transparent;
                      color: rgb(255, 255, 255);
                    }
          
                    .bar {
                      height: 8px;
                      background: white;
                      width: 100%;
                    }
          
                    .track-container {
                      display: flex;
                      align-items: center;
                      background: rgba(36, 6, 73, 0.15);
                      padding: 14px 22px;
                      border-radius: 0;
                      animation: fadeIn 0.8s ease-in-out;
                    }
          
                    .spotify-logo {
                      width: 28px;
                      height: 28px;
                      margin-right: 12px;
                    }
          
                    .track {
                    font-size: clamp(36px, 3vw, 36px);
                    font-weight: 600;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    }
        
          
                    @keyframes fadeIn {
                      from { opacity: 0; transform: translateY(10px); }
                      to { opacity: 1; transform: translateY(0); }
                    }
                  </style>
                </head>
                <body>
                  <div class="bar"></div>
                  <div class="track-container">
                    <img class="spotify-logo" src="https://storage.googleapis.com/pr-newsroom-wp/1/2023/05/Spotify_Primary_Logo_RGB_White.png" alt="Spotify">
                    <div class="track" id="track-text">Loading...</div>
                  </div>
                  <div class="bar"></div>
          
                  <script>
                    async function fetchTrack() {
                      try {
                        const res = await fetch('/now-playing-track');
                        const data = await res.text();
                        document.getElementById('track-text').textContent = data || 'Nothing playing right now';
                      } catch (e) {
                        console.error('Error fetching track:', e);
                      }
                    }
          
                    fetchTrack();
                    setInterval(fetchTrack, 5000); // Refresh every 5 seconds
                  </script>
                </body>
              </html>
            `);
          });
        
          app.get('/now-playing-track', async (req, res) => {
            const track = await this.getCurrentTrack();
            res.send(track || 'Nothing playing right now');
          });

        // Start Express Server
        app.listen(port, () => {
            console.log(`App is running. Visit ${this.redirectUri} to refresh Spotify API tokens if the page didn't open automatically..`);
        });

        open(`http://localhost:${port}/login`);
        console.log(`Now Playing overlay available at http://localhost:${port}/now-playing`);
    }

    // Refresh Access Token
    async refreshAccessToken() {
        const params = new URLSearchParams();
        params.append('refresh_token', this.refreshToken);
        params.append('grant_type', 'refresh_token');
        params.append('redirect_uri', this.redirectUri);

        try {
            const response = await axios.post('https://accounts.spotify.com/api/token', params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(this.clientId + ':' + this.clientSecret).toString('base64')
                }
            });
            this.accessToken = response.data.access_token;
            this.refreshToken = response.data.refresh_token; // In case the refresh token is updated
        } catch (error) {
            console.log(`Error refreshing token: ${error.message}`);
        }
    }

    // Get Track Info
    async getTrackInfo(trackId) {
        if (!this.accessToken) {
            await this.refreshAccessToken();
        }

        try {
            const response = await axios.get(`https://api.spotify.com/v1/tracks/${trackId}`, {
                headers: { 'Authorization': `Bearer ${this.accessToken}` }
            });
            return response.data;
        } catch (err) {
            console.error('Failed to get track info:', err.response ? err.response.data : err);
            throw err;
        }
    }


    /**
     * Retrieves the currently playing track from Spotify
     * @returns {string} The title of the currently playing track, formatted as "Track Name - Artist(s)"
     * @throws {Error} If there is an error fetching the current track
     */
    async getCurrentTrack() {
        try {
            let spotifyHeaders = this.getSpotifyHeaders();
            const response = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
                headers: {
                    Authorization: `Bearer ${this.accessToken}` 
                }
            });
    
            if (response.status === 204 || !response.data) {
                return null; // No song currently playing
            }
    
            const item = response.data.item;
            const artists = item.artists.map(artist => artist.name).join(', ');
            const trackName = item.name;
    
            return `${trackName} – ${artists}`;
        } catch (error) {
            console.error('Error fetching current track:', error.response?.data || error.message);
            return null;
        }
    }

    async addSongToQueue(uri) {     
        let spotifyHeaders = this.getSpotifyHeaders();
        if (!this.accessToken) {
            await this.refreshAccessToken();
        }
        try {
            let res = await axios.post(`https://api.spotify.com/v1/me/player/queue?uri=${uri}`, {}, { headers: spotifyHeaders });

            return res.data;
        } catch (error) {
            console.error('Error adding song to queue:', error.response ? error.response.data : error);
            throw error;
        }
    }

    /**
 * Searches Spotify for a track ID based on a given search string, excluding command aliases, and returns it if the track is not blocked.
 * @param {string} searchString - Search string to look for a track ID.
 * @returns {string | false} - Track ID if found and not blocked, false otherwise.
 */
    async searchTrackID(searchString, currentConfig) {
    // Excluding command aliases from the query string
    currentConfig.command_alias.forEach(alias => {
        searchString = searchString.replace(alias, '');
    });
    let spotifyHeaders = this.getSpotifyHeaders();
    searchString = searchString.replace(/-/, ' ');
    searchString = searchString.replace(/ by /, ' ');
    searchString = encodeURIComponent(searchString);
    const searchResponse = await axios.get(`https://api.spotify.com/v1/search?q=${searchString}&type=track`, {
        headers: spotifyHeaders
    });
    let trackId = searchResponse.data.tracks.items[0]?.id;
    if (currentConfig.blocked_tracks.includes(trackId)) {
        return false;
    } else {
        return trackId;
    }
}

    /**
     * Formats auth headers
     * @returns {{Authorization: string}}
     */
    getSpotifyHeaders() {
        return {
            'Authorization': `Bearer ${this.accessToken}`
        };
    }
}