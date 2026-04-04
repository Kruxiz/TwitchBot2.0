// services/twitch/TwitchRewardService.js

const axios = require('axios');
const DomainEvents = require('../../core/DomainEvents');
const RetryableHttpClient = require('../../utils/RetryableHttpClient');

/**
 * TwitchRewardService - Manages Twitch Channel Points rewards and redemptions
 * Handles custom reward creation, redemption monitoring, and refunds
 */
class TwitchRewardService {
  constructor(authService, config, eventBus) {
    this.authService = authService;
    this.config = config;
    this.eventBus = eventBus;
    this.rewardId = config.custom_reward_id || null;
    this.broadcasterId = null;
    this.redemptionMonitor = null;
    this.client = new RetryableHttpClient(eventBus, 'twitch-rewards', {
      baseURL: 'https://api.twitch.tv/helix',
      timeout: 10000
    });
  }

  /**
   * Emits an event via EventBus
   * @param {string} event - DomainEvents.Twitch.* constant
   * @param {Object} data - Event payload
   */
  emit(event, data) {
    if (this.eventBus) {
      this.eventBus.emit(event, data);
    }
  }

  /**
   * Initializes the reward service
   * @param {string} channelName - Channel/broadcaster name
   */
  async init(channelName) {
    if (!channelName) {
      throw new Error('Channel name required for reward service initialization');
    }

    this.broadcasterId = await this.authService.getBroadcasterId(channelName);

    if (this.rewardId) {
      console.log(`[TwitchReward] Using existing reward ID: ${this.rewardId}`);
    } else {
      console.log('[TwitchReward] Creating new custom reward...');
      this.rewardId = await this.createCustomReward();
    }

    // Validate reward exists and is enabled
    await this.validateReward();
  }

  /**
   * Creates a custom Channel Points reward
   * @returns {Promise<string>} Reward ID
   */
  async createCustomReward() {
    try {
      const headers = await this.authService.getAuthHeaders();

      const response = await axios.post(
        'https://api.twitch.tv/helix/channel_points/custom_rewards',
        {
          title: 'Request a Song',
          cost: 100, // 100 channel points
          is_enabled: true,
          is_paused: false,
          is_user_input_required: true,
          prompt: 'Enter a Spotify song link or search term',
          should_redemptions_skip_request_queue: false
        },
        { headers, params: { broadcaster_id: this.broadcasterId } }
      );

      const rewardId = response.data.data[0].id;
      console.log(`[TwitchReward] Created custom reward: ${rewardId}`);

      return rewardId;
    } catch (error) {
      console.error('[TwitchReward] Failed to create custom reward:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Gets all custom rewards for the broadcaster
   * @returns {Promise<Array>} Array of rewards
   */
  async getCustomRewards() {
    try {
      const headers = await this.authService.getAuthHeaders();

      const response = await axios.get(
        'https://api.twitch.tv/helix/channel_points/custom_rewards',
        {
          headers,
          params: { broadcaster_id: this.broadcasterId }
        }
      );

      return response.data.data;
    } catch (error) {
      console.error('[TwitchReward] Failed to get rewards:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Validates that the reward exists and is properly configured
   */
  async validateReward() {
    try {
      if (!this.rewardId) {
        throw new Error('No reward ID configured');
      }

      const rewards = await this.getCustomRewards();
      const reward = rewards.find(r => r.id === this.rewardId);

      if (!reward) {
        throw new Error(`Reward ${this.rewardId} not found or has been deleted`);
      }

      if (!reward.is_enabled) {
        throw new Error(`Reward ${this.rewardId} is disabled`);
      }

      if (reward.is_paused) {
        console.warn('[TwitchReward] Warning: reward is paused');
      }

      return reward;
    } catch (error) {
      console.error('[TwitchReward] Reward validation failed:', error.message);
      throw error;
    }
  }

  /**
   * Updates a custom reward
   * @param {Object} updates - Properties to update
   */
  async updateReward(updates) {
    try {
      const headers = await this.authService.getAuthHeaders();

      await axios.patch(
        `https://api.twitch.tv/helix/channel_points/custom_rewards`,
        updates,
        {
          headers,
          params: {
            broadcaster_id: this.broadcasterId,
            id: this.rewardId
          }
        }
      );

      console.log('[TwitchReward] Reward updated successfully');
    } catch (error) {
      console.error('[TwitchReward] Failed to update reward:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Deletes a custom reward
   */
  async deleteReward() {
    try {
      if (!this.rewardId) {
        throw new Error('No reward ID to delete');
      }

      const headers = await this.authService.getAuthHeaders();

      await axios.delete(
        'https://api.twitch.tv/helix/channel_points/custom_rewards',
        {
          headers,
          params: {
            broadcaster_id: this.broadcasterId,
            id: this.rewardId
          }
        }
      );

      console.log(`[TwitchReward] Deleted reward: ${this.rewardId}`);
      this.rewardId = null;
    } catch (error) {
      console.error('[TwitchReward] Failed to delete reward:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Gets recent redemptions
   * @param {string} status - Filter by status (UNFULFILLED, FULFILLED, CANCELED)
   * @returns {Promise<Array>} Recent redemptions
   */
  async getRecentRedemptions(status = 'UNFULFILLED') {
    try {
      const headers = await this.authService.getAuthHeaders();

      const response = await axios.get(
        'https://api.twitch.tv/helix/channel_points/custom_rewards/redemptions',
        {
          headers,
          params: {
            broadcaster_id: this.broadcasterId,
            reward_id: this.rewardId,
            status,
            first: 50
          }
        }
      );

      return response.data.data;
    } catch (error) {
      console.error('[TwitchReward] Failed to get redemptions:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Updates redemption status
   * @param {string} redemptionId - Redemption ID
   * @param {string} status - Status (FULFILLED or CANCELED)
   * @returns {Promise<void>}
   */
  async updateRedemptionStatus(redemptionId, status) {
    try {
      if (!['FULFILLED', 'CANCELED'].includes(status)) {
        throw new Error(`Invalid status: ${status}`);
      }

      const headers = await this.authService.getAuthHeaders();

      await axios.patch(
        'https://api.twitch.tv/helix/channel_points/custom_rewards/redemptions',
        { status },
        {
          headers,
          params: {
            broadcaster_id: this.broadcasterId,
            reward_id: this.rewardId,
            id: redemptionId
          }
        }
      );

      console.log(`[TwitchReward] Redemption ${redemptionId} marked as ${status}`);
    } catch (error) {
      console.error('[TwitchReward] Failed to update redemption:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Marks redemption as fulfilled
   * @param {string} redemptionId - Redemption ID
   */
  async fulfillRedemption(redemptionId) {
    await this.updateRedemptionStatus(redemptionId, 'FULFILLED');
  }

  /**
   * Cancels (refunds) a redemption
   * @param {string} redemptionId - Redemption ID
   */
  async cancelRedemption(redemptionId) {
    await this.updateRedemptionStatus(redemptionId, 'CANCELED');
  }

  /**
   * Starts monitoring for new redemptions
   * @param {Function} onRedemption - Callback for new redemptions
   */
  startRedemptionMonitor(onRedemption) {
    if (this.redemptionMonitor) {
      console.warn('[TwitchReward] Redemption monitor already running');
      return;
    }

    console.log('[TwitchReward] Starting redemption monitor...');

    this.redemptionMonitor = setInterval(async () => {
      try {
        const redemptions = await this.getRecentRedemptions('UNFULFILLED');

        for (const redemption of redemptions) {
          // Emit redemption event
          this.emit(DomainEvents.Twitch.RewardRedeemed, {
            redemptionId: redemption.id,
            userId: redemption.user_id,
            userName: redemption.user_login,
            input: redemption.user_input,
            rewardId: redemption.reward.id,
            rewardTitle: redemption.reward.title,
            cost: redemption.reward.cost,
            timestamp: redemption.redeemed_at
          });

          // Process the redemption
          await onRedemption(redemption);

          if (this.config.automatic_refunds) {
            await this.fulfillRedemption(redemption.id);
          }
        }
      } catch (error) {
        console.error('[TwitchReward] Redemption monitor error:', error.message);
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Stops monitoring for redemptions
   */
  stopRedemptionMonitor() {
    if (this.redemptionMonitor) {
      clearInterval(this.redemptionMonitor);
      this.redemptionMonitor = null;
      console.log('[TwitchReward] Stopped redemption monitor');
    }
  }

  /**
   * Disables automatic refunds
   */
  disableAutomaticRefunds() {
    this.config.automatic_refunds = false;
    console.log('[TwitchReward] Automatic refunds disabled');
  }

  /**
   * Enables automatic refunds
   */
  enableAutomaticRefunds() {
    this.config.automatic_refunds = true;
    console.log('[TwitchReward] Automatic refunds enabled');
  }

  /**
   * Gets reward statistics
   * @returns {Promise<Object>} Reward statistics
   */
  async getStats() {
    try {
      const redemptions = await this.getRecentRedemptions();
      const fulfilled = redemptions.filter(r => r.status === 'FULFILLED').length;
      const cancelled = redemptions.filter(r => r.status === 'CANCELED').length;

      return {
        total: redemptions.length,
        fulfilled,
        cancelled,
        pending: redemptions.filter(r => r.status === 'UNFULFILLED').length
      };
    } catch (error) {
      throw new Error(`Failed to get stats: ${error.message}`);
    }
  }
}

module.exports = TwitchRewardService;
