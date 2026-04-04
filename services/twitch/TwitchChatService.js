// services/twitch/TwitchChatService.js

const tmi = require('tmi.js');
const DomainEvents = require('../../core/DomainEvents');
const RetryableHttpClient = require('../../utils/RetryableHttpClient');

/**
 * TwitchChatService - Manages Twitch chat connection and messaging
 * Handles chat client lifecycle, message sending, and event handling
 */
class TwitchChatService {
  constructor(authService, config, eventBus) {
    this.authService = authService;
    this.config = config;
    this.eventBus = eventBus;
    this.authService = authService;
    this.config = config;
    this.client = new RetryableHttpClient(eventBus, 'twitch-chat', {
      baseURL: 'https://api.twitch.tv/helix',
      timeout: 10000
    });
    this.client = null;
    this.isConnected = false;
    this.eventCallbacks = {};
  }

  /**
   * Connects to Twitch chat
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.isConnected) {
      console.warn('[TwitchChat] Already connected');
      return;
    }

    const token = await this.authService.getValidToken();

    this.client = new tmi.Client({
      connection: {
        secure: true,
        reconnect: true,
        reconnectInterval: 1000,
        maxReconnectAttempts: 5
      },
      identity: {
        username: this.config.user_name,
        password: `oauth:${token}`
      },
      channels: [this.config.channel_name]
    });

    // Setup event listeners
    this.setupEventListeners();

    try {
      await this.client.connect();
      this.isConnected = true;
      console.log(`[TwitchChat] Connected as ${this.config.user_name} in #${this.config.channel_name}`);
    } catch (error) {
      console.error('[TwitchChat] Connection failed:', error.message);
      throw error;
    }
  }

  /**
   * Sets up internal event listeners for the chat client
   * Converts tmi.js events to DomainEvents and emits via EventBus
   */
  setupEventListeners() {
    this.client.on('connected', () => {
      console.log('[TwitchChat] Client connected');
      this.emit(DomainEvents.Twitch.ChatConnected, {});
    });

    this.client.on('disconnected', (reason) => {
      console.log('[TwitchChat] Client disconnected:', reason);
      this.isConnected = false;
      this.emit(DomainEvents.Twitch.ChatDisconnected, { reason });
    });

    this.client.on('reconnect', () => {
      console.log('[TwitchChat] Reconnecting...');
    });

    this.client.on('message', (channel, tags, message, self) => {
      if (self) return; // Ignore own messages

      this.emit(DomainEvents.Twitch.MessageReceived, {
        channel,
        tags,
        message,
        username: tags.username,
        displayName: tags['display-name']
      });
    });

    this.client.on('cheer', (channel, tags, message) => {
      this.emit(DomainEvents.Twitch.UserCheered, {
        channel,
        tags,
        message,
        username: tags.username,
        bits: Number(tags.bits || 0)
      });
    });

    this.client.on('subscription', (channel, username, method, message, tags) => {
      this.emit(DomainEvents.Twitch.UserSubscribed, {
        channel,
        username,
        method,
        message,
        tags
      });
    });

    this.client.on('resub', (channel, username, months, message, tags) => {
      this.emit(DomainEvents.Twitch.UserResubscribed, {
        channel,
        username,
        months,
        message,
        tags
      });
    });
  }

  /**
   * Adds a listener for chat events
   * @param {string} event - Event name (message, cheer, subscription, etc.)
   * @param {function} callback - Event callback
   */
  on(event, callback) {
    if (!this.eventCallbacks[event]) {
      this.eventCallbacks[event] = [];
    }
    this.eventCallbacks[event].push(callback);
  }

  /**
   * Emits an event to the EventBus
   * @param {string} event - Event from DomainEvents
   * @param {any} data - Event data
   */
  emit(event, data) {
    if (this.eventBus) {
      this.eventBus.emit(event, data);
    } else {
      // Fallback to local callbacks for backward compatibility
      const callbacks = this.eventCallbacks[event];
      if (callbacks) {
        callbacks.forEach(callback => {
          try {
            callback(data);
          } catch (error) {
            console.error(`[TwitchChat] Event listener error for "${event}":`, error);
          }
        });
      }
    }
  }

  /**
   * Sends a message to the chat
   * @param {string} channel - Channel to send to
   * @param {string} message - Message to send
   * @returns {Promise<void>}
   */
  async say(channel, message) {
    if (!this.isConnected) {
      throw new Error('Not connected to chat');
    }

    if (!message || message.length === 0) {
      throw new Error('Cannot send empty message');
    }

    // Twitch chat rate limit: 20 messages per 30 seconds per channel
    // Basic implementation - wait 1.5 second per message to stay under limit
    await new Promise(resolve => setTimeout(resolve, 1500));

    try {
      await this.client.say(channel, message);
    } catch (error) {
      console.error(`[TwitchChat] Failed to send message:`, error.message);
      throw error;
    }
  }

  /**
   * Gets chatters in the channel
   * @returns {Promise<Array>} Array of usernames
   */
  async getChatters() {
    // This would need Twitch Helix API integration
    // For now, return empty array
    return [];
  }

  /**
   * Checks if user is eligible based on roles
   * @param {string} channel - Channel name
   * @param {Object} tags - User tags from message
   * @param {Array<string>} allowedLevels - Array of allowed user levels
   * @returns {Promise<boolean>} True if user is eligible
   */
  async isUserEligible(channel, tags, allowedLevels) {
    // Convert tags to lowercase for case-insensitive matching
    const userRoles = [];
    const username = tags.username;
    const channelName = channel.replace('#', '').toLowerCase();

    // Streamer (channel owner)
    if (tags.badges?.broadcaster === '1' || username === channelName) {
      userRoles.push('streamer');
    }

    // Moderator
    if (tags.mod === true || String(tags.mod) === '1') {
      userRoles.push('mod');
    }

    // VIP
    if (tags.badges?.vip === '1') {
      userRoles.push('vip');
    }

    // Subscriber
    if (tags.badges?.subscriber === '1' || tags['badge-info']?.subscriber) {
      userRoles.push('sub');
    }

    // Everyone else (including followers)
    userRoles.push('everyone');

    // Check if user has any of the allowed roles
    return userRoles.some(role => allowedLevels.includes(role));
  }

  /**
   * Adds a command listener
   * @param {string} commandName - Command name (e.g., "!song")
   * @param {function} handler - Command handler function
   */
  onCommand(commandName, handler) {
    if (!this.commandHandlers) {
      this.commandHandlers = {};
    }
    this.commandHandlers[commandName.toLowerCase()] = handler;
  }

  /**
   * Disconnects from chat
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
      console.log('[TwitchChat] Disconnected');
    }
  }
}

module.exports = TwitchChatService;
