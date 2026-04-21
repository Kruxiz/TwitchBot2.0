const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(process.cwd(), 'bot_state.json');

/**
 * BotStateManager
 * Manages bot lifecycle (running/stopped) and persists state
 * Integrates with Application to control bot services
 */
class BotStateManager {
  constructor(application, config) {
    this.application = application;
    this.config = config;
    this.secrets = application.secrets;
    this.services = application.services || {};
    this.eventBus = application.eventBus;
    this.chatClient = null;
    this.isBotRunning = false;
    this.state = {
      isRunning: false,
      twitchConnected: false,
      spotifyConnected: false,
      lastStarted: null,
      lastStopped: null,
      totalRuns: 0
    };
  }

  /**
   * Initialize the BotStateManager - load existing state
   */
  async initialize() {
    await this.loadState();
    console.log('🎛️ BotStateManager initialized');
  }

  /**
   * Start bot services (Twitch chat, Spotify, etc.)
   * Extracted from Application.bootstrap()
   */
  async startBot() {
    if (this.isBotRunning) {
      console.log('⚠️ Bot is already running');
      return;
    }

    console.log('🤖 Starting bot services...');

    try {
      // Verify secrets are valid
      if (!this.hasValidSecrets()) {
        throw new Error('Invalid or missing OAuth secrets');
      }

      // Build the application (extracted from bootstrap)
      await this._startBotServices();

      this.isBotRunning = true;
      this.state.isRunning = true;
      this.state.lastStarted = new Date().toISOString();
      this.state.totalRuns++;

      await this.saveState();

      console.log('✅ Bot services started successfully');
    } catch (error) {
      console.error('❌ Failed to start bot:', error);
      this.isBotRunning = false;
      this.state.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop bot services gracefully
   */
  async stopBot() {
    if (!this.isBotRunning) {
      console.log('⚠️ Bot is already stopped');
      return;
    }

    console.log('🛑 Stopping bot services...');

    try {
      // Disconnect Twitch chat
      if (this.chatClient) {
        console.log('💬 Disconnecting from Twitch chat...');
        await this.chatClient.disconnect().catch(console.error);
      }

        // Keep HTTP server running - don't touch application.server
      // Clear remaining bot state
      this.isBotRunning = false;
      this.state.isRunning = false;
      this.state.twitchConnected = false;
      this.state.spotifyConnected = false;
      this.state.lastStopped = new Date().toISOString();

      await this.saveState();

      console.log('✅ Bot services stopped successfully');
    } catch (error) {
      console.error('❌ Failed to stop bot:', error);
      throw error;
    }
  }

  /**
   * Internal method: actually start the bot services
   * (extracted from Application.bootstrap to keep logic consistent)
   */
  async _startBotServices() {
    // 1. Create and register services (if not already created)
    if (!this.services.twitchChat) {
      await this._createBotServices();
    }

    // 2. Connect to external services (OAuth)
    await this._connectExternalServices();

    // 3. Connect to Twitch chat
    await this._connectTwitchChat();

    // 4. Register event handlers
    this._registerEventHandlers();

    this.state.twitchConnected = true;
    this.state.spotifyConnected = true;
  }

  /**
   * Create bot services (Twitch, Spotify, CommandProcessor)
   */
  async _createBotServices() {
    console.log('🔧 Creating bot services...');

    const EventBus = require('./EventBus');
    const RecoveryManager = require('../errors/RecoveryManager');
    const TwitchAuthService = require('../services/twitch/TwitchAuthService');
    const TwitchChatService = require('../services/twitch/TwitchChatService');
    const TwitchRewardService = require('../services/twitch/TwitchRewardService');
    const SpotifyAuthService = require('../services/spotify/SpotifyAuthService');
    const SpotifyPlayerService = require('../services/spotify/SpotifyPlayerService');
    const SpotifyQueueService = require('../services/spotify/SpotifyQueueService');
    const CommandProcessingService = require('../services/CommandProcessingService');

    // Use application's eventBus if exists, otherwise create
    if (!this.eventBus) {
      this.eventBus = new EventBus();
      this.recoveryManager = new RecoveryManager(this.eventBus);
    }

    const oauthBaseUrl = `http://${this.config.oauth_host || 'localhost'}:${this.config.express_port || 8888}`;
    const spotifyoAuthBaseUrl = `http://127.0.0.1:${this.config.express_port || 8888}`;

    // Create auth services
    const twitchAuth = new TwitchAuthService({
      clientId: this.secrets.twitch.clientId,
      clientSecret: this.secrets.twitch.clientSecret,
      redirectUri: `${oauthBaseUrl}/callback/twitch`
    });

    const spotifyAuth = new SpotifyAuthService({
      clientId: this.secrets.spotify.clientId,
      clientSecret: this.secrets.spotify.clientSecret,
      redirectUri: `${spotifyoAuthBaseUrl}/callback/spotify`
    });

    // Create Twitch services
    this.services.twitchChat = new TwitchChatService(twitchAuth, this.config, this.eventBus);
    this.services.twitchRewards = new TwitchRewardService(twitchAuth, this.config, this.eventBus);

    // Create Spotify services
    this.services.spotifyPlayer = new SpotifyPlayerService(spotifyAuth, this.eventBus);
    this.services.spotifyQueue = new SpotifyQueueService(spotifyAuth, this.eventBus);

    // Create command processor
    this.services.commandProcessor = new CommandProcessingService(
      this.eventBus,
      this.services.twitchChat,
      {
        player: this.services.spotifyPlayer,
        queue: this.services.spotifyQueue
      },
      this.config
    );

    // Create controllers for OAuth routing
    const TwitchController = require('../controllers/twitchController');
    const SpotifyController = require('../controllers/spotifyController');
    this.services.twitch = new TwitchController({
      clientId: this.secrets.twitch.clientId,
      clientSecret: this.secrets.twitch.clientSecret,
      redirectUri: `${oauthBaseUrl}/callback/twitch`
    });
    this.services.spotify = new SpotifyController({
      clientId: this.secrets.spotify.clientId,
      clientSecret: this.secrets.spotify.clientSecret,
      redirectUri: `${spotifyoAuthBaseUrl}/callback/spotify`
    });

    console.log('✅ Bot services created');
  }

  /**
   * Connect to external services (OAuth) - sequentially to avoid concurrency issues
   */
  async _connectExternalServices() {
    console.log('🔗 Connecting to external services...');
    const open = require('open');

    // Process Twitch OAuth first
    const twitchAuthUrl = await this.services.twitch.getAuthUrlIfNeeded();
    if (twitchAuthUrl) {
      console.log('🔑 Opening Twitch OAuth...');
      await open(twitchAuthUrl).catch(console.error);
      await this.services.twitch.waitUntilReady();
    }

    // Then process Spotify OAuth after Twitch completes
    const spotifyAuthUrl = await this.services.spotify.getAuthUrlIfNeeded();
    if (spotifyAuthUrl) {
      console.log('🎵 Opening Spotify OAuth...');
      await open(spotifyAuthUrl).catch(console.error);
      await this.services.spotify.waitUntilReady();
    }

    console.log('✅ External services connected');
  }

  /**
   * Connect to Twitch chat via tmi.js
   */
  async _connectTwitchChat() {
    console.log('💬 Connecting to Twitch chat...');

    const tmi = require('tmi.js');
    this.chatClient = new tmi.Client({
      connection: { secure: true, reconnect: true },
      identity: {
        username: this.config.user_name,
        password: `oauth:${this.services.twitch.token}`
      },
      channels: [this.config.channel_name]
    });

    await this.services.twitch.init(this.config);
    await this.chatClient.connect();

    console.log(`✅ Connected to Twitch as ${this.config.user_name} in #${this.config.channel_name}`);
  }

  /**
   * Register event handlers for Twitch chat
   */
  _registerEventHandlers() {
    console.log('🎧 Registering event handlers...');

    const registerEventHandlers = require('../eventHandlers');
    registerEventHandlers(
      this.chatClient,
      this.services.twitch,
      this.services.spotify,
      this.config
    );

    console.log('✅ Event handlers registered');
  }

  /**
   * Get current bot status
   */
  getStatus() {
    return {
      isRunning: this.isBotRunning,
      twitchConnected: this.state.twitchConnected,
      spotifyConnected: this.state.spotifyConnected,
      lastStarted: this.state.lastStarted,
      lastStopped: this.state.lastStopped,
      totalRuns: this.state.totalRuns,
      config: {
        autoStart: this.config.auto_start_bot
      }
    };
  }

  /**
   * Save bot state to disk
   */
  async saveState() {
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (error) {
      console.error('❌ Failed to save bot state:', error);
    }
  }

  /**
   * Load bot state from disk
   */
  async loadState() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const savedState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        this.state = { ...this.state, ...savedState };
        console.log('✅ Loaded bot state from', STATE_FILE);
      } else {
        console.log('⚠️ No bot_state.json found, using defaults');
        await this.saveState();
      }
    } catch (error) {
      console.error('❌ Failed to load bot state:', error);
    }
  }

  /**
   * Check if secrets are valid
   */
  hasValidSecrets() {
    const { secretsAreValid } = require('../utils/secrets');
    return secretsAreValid(this.secrets);
  }

  /**
   * Check if OAuth tokens exist
   * @returns {object} Token status object with boolean flags
   */
  getTokenStatus() {
    const fs = require('fs');
    const path = require('path');

    const tokensDir = path.join(process.cwd(), 'tokens');
    const twitchTokenFile = path.join(tokensDir, 'twitch_token.json');
    const spotifyTokenFile = path.join(tokensDir, 'spotify_tokens.json');

    const hasTwitchToken = fs.existsSync(twitchTokenFile);
    const hasSpotifyToken = fs.existsSync(spotifyTokenFile);

    return {
      hasTwitchToken,
      hasSpotifyToken,
      hasAllTokens: hasTwitchToken && hasSpotifyToken
    };
  }

  /**
   * Disconnect tokens (for logout/testing)
   */
  async disconnectTokens() {
    console.log('🔐 Disconnecting OAuth tokens...');

    this.state.twitchConnected = false;
    this.state.spotifyConnected = false;

    if (this.services.twitch && typeof this.services.twitch.clearTokens === 'function') {
      this.services.twitch.clearTokens();
    }
    if (this.services.spotify && typeof this.services.spotify.clearTokens === 'function') {
      this.services.spotify.clearTokens();
    }

    await this.saveState();
    console.log('✅ Tokens disconnected');
  }
}

module.exports = BotStateManager;
