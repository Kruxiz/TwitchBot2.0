// services/spotify/SpotifyQueueService.js

const axios = require('axios');

/**
 * SpotifyQueueService - Manages Spotify queue operations
 * Handles adding tracks, queue state, duplicate detection, and search
 */
class SpotifyQueueService {
  constructor(authService) {
    this.authService = authService;
    this.baseURL = 'https://api.spotify.com/v1/me';
  }

  /**
   * Gets Spotify API headers with authentication
   */
  async getHeaders() {
    try {
      const token = await this.authService.getValidToken();
      return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json`
      };
    } catch (error) {
      throw new Error(`Failed to get authentication token: ${error.message}`);
    }
  }

  /**
   * Gets the current user's playback queue
   * @returns {Promise<Array>} Array of tracks currently in queue
   */
  async getQueue() {
    try {
      const headers = await this.getHeaders();
      // Note: Spotify doesn't provide a direct endpoint to get queue
      // This is a limitation of Spotify's API
      // For now, return empty array and rely on duplicate detection via user state
      return [];
    } catch (error) {
      console.warn('Could not fetch queue:', error.message);
      return [];
    }
  }

  /**
   * Adds a track to the playback queue
   * @param {string} trackUri - Spotify URI of the track (spotify:track:...)
   * @returns {Promise<void>}
   */
  async addToQueue(trackUri) {
    try {
      const headers = await this.getHeaders();

      await axios.post(
        `${this.baseURL}/queue`,
        null,
        {
          headers,
          params: { uri: trackUri }
        }
      );
    } catch (error) {
      throw new Error(`Failed to add track to queue: ${error.message}`);
    }
  }

  /**
   * Gets information about a specific track
   * @param {string} trackId - Spotify track ID
   * @returns {Promise<Object>} Track information (name, artists, duration, uri)
   */
  async getTrackInfo(trackId) {
    try {
      const headers = await this.getHeaders();
      const response = await axios.get(
        `https://api.spotify.com/v1/tracks/${trackId}`,
        { headers }
      );

      const track = response.data;
      return {
        id: track.id,
        name: track.name,
        uri: track.uri,
        artists: track.artists.map(a => ({
          id: a.id,
          name: a.name,
          uri: a.uri
        })),
        durationMs: track.duration_ms,
        durationSec: track.duration_ms / 1000,
        album: {
          id: track.album.id,
          name: track.album.name,
          uri: track.album.uri
        }
      };
    } catch (error) {
      throw new Error(`Failed to get track info: ${error.message}`);
    }
  }

  /**
   * Searches Spotify for tracks
   * @param {string} query - Search query
   * @returns {Promise<string|null>} Track ID of first result, or null if not found
   */
  async searchTracks(query) {
    try {
      const headers = await this.getHeaders();
      const response = await axios.get(
        'https://api.spotify.com/v1/search',
        {
          headers,
          params: {
            q: query,
            type: 'track',
            limit: 1
          }
        }
      );

      if (response.data.tracks.items.length === 0) {
        return null;
      }

      return response.data.tracks.items[0].id;
    } catch (error) {
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  /**
   * Checks if a track is already in the queue or recently added
   * @param {string} trackId - Track ID to check
   * @param {Array<string>} userQueueHistory - User's recently queued tracks (for user-local duplicate check)
   * @returns {Promise<boolean>} True if duplicate found
   */
  async isDuplicate(trackId, userQueueHistory = []) {
    try {
      // Check against user's recent queue history (local deduplication per user)
      if (userQueueHistory.includes(trackId)) {
        return true;
      }

      // Note: Cannot check queue globally due to Spotify API limitations
      // For now, only user-local duplicate detection is supported
      return false;
    } catch (error) {
      console.warn('Duplicate check failed:', error.message);
      return false; // Continue if check fails
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
        `${this.baseURL}/player/recently-played`,
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
          durationMs: item.track.duration_ms
        },
        playedAt: item.played_at
      }));
    } catch (error) {
      throw new Error(`Failed to get recently played: ${error.message}`);
    }
  }

  /**
   * Validates a track can be added to queue (exists, not blocked, passes filters)
   * @param {string} trackId - Track ID to validate
   * @param {Object} config - Config for grace challenges and filters
   * @returns {Promise<Object>} Validation result {valid: boolean, trackInfo?, error?}
   */
  async validateTrack(trackId, config = {}) {
    try {
      const trackInfo = await this.getTrackInfo(trackId);

      // Check duration against max_duration if configured
      if (config.maxDuration && trackInfo.durationSec > config.maxDuration) {
        return {
          valid: false,
          error: `Track too long: ${trackInfo.durationSec}s (max: ${config.maxDuration}s)`,
          trackInfo
        };
      }

      // Check if blocked in config
      if (config.blockedTracks?.includes(trackId)) {
        return {
          valid: false,
          error: 'Track is blocked by configuration',
          trackInfo
        };
      }

      return {
        valid: true,
        trackInfo
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

module.exports = SpotifyQueueService;
