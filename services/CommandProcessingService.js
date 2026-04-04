// services/CommandProcessingService.js

const { isUserEligible } = require('../utils/utils');

/**
 * CommandProcessingService - Orchestrates command processing and execution
 * Handles command registration, routing, user validation, and cooldown management
 */
class CommandProcessingService {
  constructor(twitchChatService, spotifyServices, config) {
    this.twitchChat = twitchChatService;
    this.spotifyPlayer = spotifyServices.player;
    this.spotifyQueue = spotifyServices.queue;
    this.config = config;

    this.commandHandlers = new Map();
    this.cooldowns = new Map(); // username -> cooldown timeout
    this.rateLimits = new Map(); // command -> rate limit

    this.setupEventListeners();
  }

  /**
   * Sets up event listeners for Twitch chat events
   */
  setupEventListeners() {
    // Listen for chat messages
    this.twitchChat.on('message', async (data) => {
      await this.handleMessage(data);
    });

    // Listen for cheers
    this.twitchChat.on('cheer', async (data) => {
      await this.handleCheer(data);
    });

    // Listen for subscriptions
    this.twitchChat.on('subscription', async (data) => {
      await this.handleSubscription(data);
    });

    // Listen for resubscriptions
    this.twitchChat.on('resub', async (data) => {
      await this.handleResub(data);
    });
  }

  /**
   * Registers a command handler
   * @param {string} command - Command name (e.g., "!song")
   * @param {Function} handler - Async handler function
   * @param {Object} config - Command configuration (userLevels, cooldown, etc.)
   */
  registerCommand(command, handler, config = {}) {
    const lowerCommand = command.toLowerCase();
    this.commandHandlers.set(lowerCommand, {
      handler,
      config: {
        userLevels: config.userLevels || ['everyone'],
        usageTypes: config.usageTypes || ['command'],
        cooldownMs: config.cooldownMs || 0,
        aliases: config.aliases || []
      }
    });

    // Register aliases
    if (config.aliases) {
      config.aliases.forEach(alias => {
        this.commandHandlers.set(alias.toLowerCase(), {
          handler,
          config: this.commandHandlers.get(lowerCommand).config
        });
      });
    }
  }

  /**
   * Parses a message to extract command and arguments
   * @param {string} message - Raw message
   * @returns {Object} {command: string, args: Array<string>}
   */
  parseCommand(message) {
    const trimmed = message.trim();
    if (!trimmed) return null;

    const parts = trimmed.split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).filter(arg => arg.length > 0);

    return { command, args, raw: trimmed };
  }

  /**
   * Handles incoming chat messages
   * @param {Object} data - Message data (channel, tags, message, etc.)
   */
  async handleMessage(data) {
    const { channel, tags, message } = data;

    // Parse command
    const parsed = this.parseCommand(message);
    if (!parsed) return;

    // Find command handler
    const handlerInfo = this.commandHandlers.get(parsed.command);
    if (!handlerInfo) return; // Not a command we handle

    // Check if command is enabled for this usage type
    if (!handlerInfo.config.usageTypes.includes('command')) {
      return;
    }

    // Check user eligibility
    const eligible = await this.twitchChat.isUserEligible(channel, tags, handlerInfo.config.userLevels);
    if (!eligible) {
      return;
    }

    // Check cooldown
    if (handlerInfo.config.cooldownMs > 0) {
      const username = tags.username;
      const cooldownKey = `${parsed.command}:${username}`;
      const remainingCooldown = this.getRemainingCooldown(cooldownKey);

      if (remainingCooldown > 0) {
        const cooldown = Math.ceil(remainingCooldown / 1000);
        this.twitchChat.say(channel, `${tags['display-name']}, please wait ${cooldown} seconds before using this command again.`);
        return;
      }

      this.setCooldown(cooldownKey, handlerInfo.config.cooldownMs);
    }

    try {
      await handlerInfo.handler({
        command: parsed.command,
        args: parsed.args,
        raw: parsed.raw,
        username: tags.username,
        displayName: tags['display-name'] || tags.username,
        channel,
        tags,
        config: this.config
      });
    } catch (error) {
      console.error(`[Command] Error executing command "${parsed.command}":`, error);
      this.twitchChat.say(channel, `Sorry ${tags['display-name']}, there was an error processing your command.`);
    }
  }

  /**
   * Handles cheer (bits) events
   * @param {Object} data - Cheer data
   */
  async handleCheer(data) {
    // Implementation for cheer-based commands/rewards
    const { bits } = data;

    // Trigger reward if bits threshold met
    if (bits >= 100) { // 100 bits threshold (configurable)
      this.emit('bits-redeemed', data);
    }
  }

  /**
   * Handles subscription events
   * @param {Object} data - Subscription data
   */
  async handleSubscription(data) {
    this.emit('subscription', data);
  }

  /**
   * Handles resubscription events
   * @param {Object} data - Resubscription data
   */
  async handleResub(data) {
    this.emit('resub', data);
  }

  /**
   * Gets remaining cooldown time
   * @param {string} key - Cooldown key
   * @returns {number} Remaining cooldown in milliseconds
   */
  getRemainingCooldown(key) {
    const cooldown = this.cooldowns.get(key);
    if (!cooldown) return 0;

    const now = Date.now();
    const remaining = cooldown - now;
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Sets cooldown for a command/user combination
   * @param {string} key - Cooldown key
   * @param {number} durationMs - Cooldown duration in milliseconds
   */
  setCooldown(key, durationMs) {
    const expiresAt = Date.now() + durationMs;
    this.cooldowns.set(key, expiresAt);

    // Clean up after cooldown expires
    setTimeout(() => {
      this.cooldowns.delete(key);
    }, durationMs);
  }

  /**
   * Emits an event
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emit(event, data) {
    const eventName = `command:${event}`;
    // In future, could integrate with EventBus
    console.log(`[Command] Event emitted: ${eventName}`, data);
  }

  /**
   * Processes a song request command
   * @param {Object} params - Command parameters
   */
  async processSongRequest({ channel, username, message, tags, songId }) {
    try {
      // Validate song
      const validation = await this.spotifyQueue.validateTrack(songId, this.config);
      if (!validation.valid) {
        this.twitchChat.say(channel, `${tags['display-name']}, ${validation.error}`);
        return false;
      }

      // Check duration
      if (validation.trackInfo.durationSec > this.config.max_duration) {
        this.twitchChat.say(channel, `${validation.trackInfo.name} is too long. Max: ${this.config.max_duration}s`);
        return false;
      }

      // Check duplicate (config)
      if (this.config.disable_duplicates_in_queue) {
        const isDup = await this.spotifyQueue.isDuplicate(songId);
        if (isDup) {
          this.twitchChat.say(channel, `${tags['display-name']}, that song is already in the queue.`);
          return false;
        }
      }

      // Add to queue
      await this.spotifyQueue.addToQueue(validation.trackInfo.uri);

      // Notify channel
      const artistNames = validation.trackInfo.artists.map(a => a.name).join(', ');
      this.twitchChat.say(channel, `${validation.trackInfo.name} by ${artistNames} added to queue! 🎵`);

      return true;
    } catch (error) {
      console.error('[Command] Song request error:', error);
      this.twitchChat.say(channel, `${tags['display-name']}, sorry, I couldn't add that song.`);
      return false;
    }
  }

  /**
   * Processes a skip command
   * @param {Object} params - Command parameters
   */
  async processSkip({ channel, username, tags }) {
    try {
      await this.spotifyPlayer.skipNext();
      this.twitchChat.say(channel, `${tags['display-name']} skipped to the next track! ⏭️`);
      return true;
    } catch (error) {
      console.error('[Command] Skip error:', error);
      this.twitchChat.say(channel, `${tags['display-name']}, couldn't skip track.`);
      return false;
    }
  }

  /**
   * Shows current track to channel
   * @param {Object} params - Command parameters
   */
  async processNowPlaying({ channel, tags }) {
    try {
      const current = await this.spotifyPlayer.getCurrentTrack();
      if (!current || !current.track) {
        this.twitchChat.say(channel, `${tags['display-name']}, nothing is playing right now.`);
        return;
      }

      const artists = current.track.artists.map(a => a.name).join(', ');
      this.twitchChat.say(channel, `🎵 Now playing: ${current.track.name} by ${artists}`);
    } catch (error) {
      console.error('[Command] Now playing error:', error);
      this.twitchChat.say(channel, `${tags['display-name']}, couldn't get current track.`);
    }
  }

  /**
   * Shows current queue to channel
   * @param {Object} params - Command parameters
   */
  async processQueue({ channel, tags }) {
    try {
      const queue = await this.spotifyQueue.getQueue();
      const items = queue.length > 0 ? queue : [];

      if (items.length === 0) {
        this.twitchChat.say(channel, `${tags['display-name']}, the queue is empty.`);
        return;
      }

      const queueMessage = items.slice(0, 5) // Limit to first 5
        .map((item, idx) => `${idx + 1}. ${item.track.name}`)
        .join(' | ');

      const suffix = items.length > 5 ? ` (+${items.length - 5} more)` : '';
      this.twitchChat.say(channel, `${tags['display-name']}, queue: ${queueMessage}${suffix}`);
    } catch (error) {
      console.error('[Command] Queue error:', error);
      this.twitchChat.say(channel, `${tags['display-name']}, couldn't fetch queue.`);
    }
  }

  async processVolume({ channel, tags, volume }) {
    try {
      const currentVolume = await this.spotifyPlayer.getVolume();

      if (volume === undefined) {
        // Just get current volume
        this.twitchChat.say(channel, `${tags['display-name']}, current volume: ${currentVolume}%`);
      } else {
        // Set volume
        const newVolume = Math.max(0, Math.min(100, parseInt(volume, 10)));
        await this.spotifyPlayer.setVolume(newVolume);
        this.twitchChat.say(channel, `${tags['display-name']}, volume set to ${newVolume}%`);
      }
    } catch (error) {
      console.error('[Command] Volume error:', error);
      this.twitchChat.say(channel, `${tags['display-name']}, couldn't get/set volume.`);
    }
  }
}

module.exports = CommandProcessingService;
