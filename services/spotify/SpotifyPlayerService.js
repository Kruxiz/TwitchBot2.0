// services/spotify/SpotifyPlayerService.js

const axios = require('axios');

/**
 * SpotifyPlayerService - Manages Spotify playback and player state
 * Handles volume, playback control, and current track information
 */
class SpotifyPlayerService {
  constructor(authService) {
    this.authService = authService;
    this.baseURL = 'https://api.spotify.com/v1/me/player';
  }

  /**
   * Gets Spotify API headers with authentication
   */
  async getHeaders() {
    try {
      const token = await this.authService.getValidToken();
      return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
    } catch (error) {
      throw new Error(`Failed to get authentication token: ${error.message}`);
    }
  }

  /**
   * Gets the currently playing track
   * @returns {Promise<Object|null>} Current track information or null if nothing playing
   */
  async getCurrentTrack() {
    try {
      const headers = await this.getHeaders();
      const response = await axios.get(`${this.baseURL}/currently-playing`, { headers });

      if (response.status === 204 || !response.data) {
        return { isPlaying: false, track: null };
      }

      return {
        isPlaying: response.data.is_playing,
        track: {
          id: response.data.item.id,
          name: response.data.item.name,
          artists: response.data.item.artists,
          durationMs: response.data.item.duration_ms,
          progressMs: response.data.progress_ms
        }
      };
    } catch (error) {
      if (error.response?.status === 401) {
        // Token expired, try once more after refresh
        try {
          const headers = await this.getHeaders();
          const response = await axios.get(`${this.baseURL}/currently-playing`, { headers });
          if (response.status === 204 || !response.data) {
            return { isPlaying: false, track: null };
          }
          return { isPlaying: response.data.is_playing, track: response.data.item };
        } catch (retryError) {
          throw new Error(`Failed to get current track after token refresh: ${retryError.message}`);
        }
      }
      throw new Error(`Failed to get current track: ${error.message}`);
    }
  }

  /**
   * Gets current playback state
   * @returns {Promise<Object>} Playback state including device, shuffle, repeat mode
   */
  async getPlaybackState() {
    try {
      const headers = await this.getHeaders();
      const response = await axios.get(this.baseURL, { headers });

      if (response.status === 204) {
        return { isPlaying: false };
      }

      return {
        isPlaying: response.data.is_playing,
        device: response.data.device,
        progressMs: response.data.progress_ms,
        shuffleState: response.data.shuffle_state,
        repeatState: response.data.repeat_state,
        item: response.data.item
      };
    } catch (error) {
      throw new Error(`Failed to get playback state: ${error.message}`);
    }
  }

  /**
   * Gets current playback volume (0-100)
   * @returns {Promise<number>} Current volume percentage
   */
  async getVolume() {
    try {
      const state = await this.getPlaybackState();
      if (state.device) {
        return state.device.volume_percent;
      }
      return 0;
    } catch (error) {
      throw new Error(`Failed to get volume: ${error.message}`);
    }
  }

  /**
   * Sets playback volume
   * @param {number} volume - Volume percentage (0-100)
   * @returns {Promise<void>}
   */
  async setVolume(volume) {
    try {
      const headers = await this.getHeaders();
      await axios.put(
        `${this.baseURL}/volume`,
        null,
        {
          headers,
          params: { volume_percent: volume }
        }
      );
    } catch (error) {
      throw new Error(`Failed to set volume to ${volume}: ${error.message}`);
    }
  }

  /**
   * Pauses playback
   * @returns {Promise<void>}
   */
  async pause() {
    try {
      const headers = await this.getHeaders();
      await axios.put(`${this.baseURL}/pause`, {}, { headers });
    } catch (error) {
      throw new Error(`Failed to pause playback: ${error.message}`);
    }
  }

  /**
   * Resumes playback
   * @returns {Promise<void>}
   */
  async resume() {
    try {
      const headers = await this.getHeaders();
      await axios.put(`${this.baseURL}/play`, {}, { headers });
    } catch (error) {
      throw new Error(`Failed to resume playback: ${error.message}`);
    }
  }

  /**
   * Skips to next track
   * @returns {Promise<void>}
   */
  async skipNext() {
    try {
      const headers = await this.getHeaders();
      await axios.post(`${this.baseURL}/next`, {}, { headers });
    } catch (error) {
      throw new Error(`Failed to skip to next track: ${error.message}`);
    }
  }

  /**
   * Skips to previous track
   * @returns {Promise<void>}
   */
  async skipPrevious() {
    try {
      const headers = await this.getHeaders();
      await axios.post(`${this.baseURL}/previous`, {}, { headers });
    } catch (error) {
      throw new Error(`Failed to skip to previous track: ${error.message}`);
    }
  }

  /**
   * Seeks to position in current track
   * @param {number} positionMs - Position in milliseconds
   * @returns {Promise<void>}
   */
  async seek(positionMs) {
    try {
      const headers = await this.getHeaders();
      await axios.put(
        `${this.baseURL}/seek`,
        {},
        { headers, params: { position_ms: positionMs } }
      );
    } catch (error) {
      throw new Error(`Failed to seek to position ${positionMs}: ${error.message}`);
    }
  }

  /**
   * Gets recently played tracks
   * @param {number} limit - Number of tracks to return (max: 50)
   * @returns {Promise<Array>} Array of recently played tracks
   */
  async getRecentlyPlayed(limit = 10) {
    try {
      const headers = await this.getHeaders();
      const response = await axios.get(
        `https://api.spotify.com/v1/me/player/recently-played`,
        {
          headers,
          params: { limit: Math.min(limit, 50) }
        }
      );

      return response.data.items.map(item => ({
        track: {
          id: item.track.id,
          name: item.track.name,
          artists: item.track.artists,
          playedAt: item.played_at
        }
      }));
    } catch (error) {
      throw new Error(`Failed to get recently played tracks: ${error.message}`);
    }
  }
}

module.exports = SpotifyPlayerService;
