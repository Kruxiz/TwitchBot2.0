// core/Application.js

const express = require('express');
const EventBus = require('./EventBus');
const RecoveryManager = require('../errors/RecoveryManager');
const TwitchAuthService = require('../services/twitch/TwitchAuthService');
const TwitchChatService = require('../services/twitch/TwitchChatService');
const TwitchRewardService = require('../services/twitch/TwitchRewardService');
const SpotifyAuthService = require('../services/spotify/SpotifyAuthService');
const SpotifyPlayerService = require('../services/spotify/SpotifyPlayerService');
const SpotifyQueueService = require('../services/spotify/SpotifyQueueService');
const CommandProcessingService = require('../services/CommandProcessingService');

/**
 * Application Orchestrator
 * Centralizes application setup, service management, and lifecycle handling
 */
class Application {
  constructor(config, secrets) {
    this.config = config;
    this.secrets = secrets || {};
    this.expressApp = null;
    this.services = {};
    this.chatClient = null;
    this.server = null;
    this.isRunning = false;
  }

  /**
   * Starts the application
   * If secrets are invalid, starts in setup-only mode
   * Otherwise, starts full application with all services
   * @param {number} port - Port to listen on (default: 8888)
   */
  async start(port = 8888) {
    console.log('🚀 Starting Spotty Botty...');

    // Check if setup is required
    if (!this.hasValidSecrets()) {
      console.log('🔐 Missing secrets, entering setup mode...');
      await this.startSetupOnly(port);
      return;
    }

    // Normal startup
    console.log('✅ Secrets valid, starting full application...');
    await this.bootstrap();

    // Start HTTP server
    const host = this.config.express_host || 'localhost';
    this.server = this.expressApp.listen(port, () => {
      console.log(`🌐 Express server running at http://${host}:${port}`);
      console.log(`📊 Dashboard available at http://${host}:${port}/dashboard`);
      console.log(`🎵 Overlay available at http://${host}:${port}/now-playing`);
      this.isRunning = true;
    });

    // Handle graceful shutdown
    this.setupShutdownHandlers();
  }

  /**
   * Bootstraps the full application
   * Creates services, registers routes, connects clients
   */
  async bootstrap() {
    // 0. Create EventBus and RecoveryManager (Phase 3) 
    console.log('🔔 Creating EventBus and RecoveryManager...'); 
    this.eventBus = new EventBus(); 
    this.recoveryManager = new RecoveryManager(this.eventBus);

    // 1. Create Express app and setup middleware
    this.createExpressApp();
    this.setupMiddleware();

    // 2. Create and register services
    await this.createServices();

    // 3. Register routes
    this.registerRoutes();

    // 4. Connect to external services (OAuth flow)
    await this.connectExternalServices();

    // 5. Connect Twitch chat and register event handlers
    await this.connectTwitchChat();
    this.registerEventHandlers();

    console.log('✅ Application bootstrap complete');
  }

  /**
   * Creates the Express application
   */
  createExpressApp() {
    this.expressApp = express();
  }

  /**
   * Sets up Express middleware
   */
  setupMiddleware() {
    const authGate = require('../middleware/authGate');

    // Body parsing
    this.expressApp.use(express.json());
    this.expressApp.use(express.urlencoded({ extended: true }));

    // Auth gate (only redirect if secrets invalid AFTER setup)
    this.expressApp.use(authGate(this.secrets));
  }

  /**
   * Checks if secrets are valid
   * @returns {boolean} true if secrets are valid
   */
  hasValidSecrets() {
    const { secretsAreValid } = require('../utils/secrets');
    return secretsAreValid(this.secrets);
  }

  /**
   * Creates service instances for Phase 3 architecture
   */
  async createServices() {
    console.log('🔧 Creating services...');

    const oauthBaseUrl = `http://${this.config.oauth_host || 'localhost'}:${this.config.express_port || 8888}`;

    // Create auth services
    const twitchAuth = new TwitchAuthService({
      clientId: this.secrets.twitch.clientId,
      clientSecret: this.secrets.twitch.clientSecret,
      redirectUri: `${oauthBaseUrl}/callback/twitch`
    });

    const spotifyAuth = new SpotifyAuthService({
      clientId: this.secrets.spotify.clientId,
      clientSecret: this.secrets.spotify.clientSecret,
      redirectUri: `${oauthBaseUrl}/callback/spotify`
    });

    // Create Twitch services (event-driven)
    this.services.twitchChat = new TwitchChatService(twitchAuth, this.config, this.eventBus);
    this.services.twitchRewards = new TwitchRewardService(twitchAuth, this.config, this.eventBus);

    // Create Spotify services (event-driven)
    this.services.spotifyPlayer = new SpotifyPlayerService(spotifyAuth, this.eventBus);
    this.services.spotifyQueue = new SpotifyQueueService(spotifyAuth, this.eventBus);

    // Create command processor (consumes events from EventBus)
    this.services.commandProcessor = new CommandProcessingService(
      this.eventBus,
      this.services.twitchChat,
      {
        player: this.services.spotifyPlayer,
        queue: this.services.spotifyQueue
      },
      this.config
    );

    // Keep controllers for OAuth routing (delegating to services)
    const TwitchController = require('../controllers/twitchController');
    const SpotifyController = require('../controllers/spotifyController');
    this.services.twitch = new TwitchController({
      clientId: this.secrets.twitch.clientId,
      clientSecret: this.secrets.twitch.clientSecret,
      redirectUri: `http://${this.config.oauth_host || 'localhost'}:${this.config.express_port || 8888}/callback/twitch`
    });
    this.services.spotify = new SpotifyController({
      clientId: this.secrets.spotify.clientId,
      clientSecret: this.secrets.spotify.clientSecret,
      redirectUri: `http://${this.config.oauth_host || 'localhost'}:${this.config.express_port || 8888}/callback/spotify`
    });

    console.log('✅ Services created');
  }

  /**
   * Registers all application routes
   */
  registerRoutes() {
    console.log('🛣️  Registering routes...');

    const setupRoutes = require('../routes/setup');
    const configRoutes = require('../routes/config');
    const dashboardRoutes = require('../routes/dashboard');
    const oauthRoutes = require('../routes/oauth');

    // Main routes
    this.expressApp.use('/setup', setupRoutes(this.config, this.secrets));
    this.expressApp.use('/config', configRoutes(this.config));
    this.expressApp.use('/dashboard', dashboardRoutes(this.config));
    this.expressApp.use('/callback', oauthRoutes(this.services));

    // Controller routes (OAuth, overlay, etc.)
    this.services.twitch.registerRoutes(this.expressApp);
    this.services.spotify.registerRoutes(this.expressApp);

    // Static assets
    this.expressApp.use(express.static('public'));

    console.log('✅ Routes registered');
  }

  /**
   * Connects to external services (Twitch and Spotify via OAuth)
   * Opens browser windows for OAuth if needed
   */
  async connectExternalServices() {
    console.log('🔗 Connecting to external services...');
    const open = require('open');

    // Wait for OAuth completion
    const [twitchAuthUrl, spotifyAuthUrl] = await Promise.all([
      this.services.twitch.getAuthUrlIfNeeded(),
      this.services.spotify.getAuthUrlIfNeeded()
    ]);

    // Open OAuth flows if needed
    if (twitchAuthUrl) {
      console.log('🔑 Opening Twitch OAuth...');
      await open(twitchAuthUrl).catch(console.error);
    }

    if (spotifyAuthUrl) {
      console.log('🎵 Opening Spotify OAuth...');
      await open(spotifyAuthUrl).catch(console.error);
    }

    // Wait for both services to be ready
    await this.services.twitch.waitUntilReady();
    await this.services.spotify.waitUntilReady();

    console.log('✅ External services connected');
  }

  /**
   * Connects to Twitch chat using tmi.js
   */
  async connectTwitchChat() {
    console.log('💬 Connecting to Twitch chat...');

    const tmi = require('tmi.js');
    this.chatClient = new tmi.Client({
      connection: {
        secure: true,
        reconnect: true
      },
      identity: {
        username: this.config.user_name,
        password: `oauth:${this.services.twitch.token}`
      },
      channels: [this.config.channel_name]
    });

    // Initialize Twitch features (channel points, etc.)
    await this.services.twitch.init(this.config);

    // Connect to chat
    await this.chatClient.connect();

    console.log(`✅ Connected to Twitch as ${this.config.user_name} in #${this.config.channel_name}`);
  }

  /**
   * Registers event handlers for Twitch chat
   */
  registerEventHandlers() {
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
   * Starts application in setup-only mode
   * Used when secrets are invalid
   * @param {number} port - Port to listen on
   */
  async startSetupOnly(port) {
    console.log('🚀 Starting setup-only mode...');

    const express = require('express');
    const setupRoutes = require('../routes/setup');
    const oauthRoutes = require('../routes/oauth');
    const open = require('open');

    this.expressApp = express();

    // Publicly accessible routes
    this.expressApp.use(express.json());
    this.expressApp.use(express.urlencoded({ extended: true }));
    this.expressApp.use('/setup', setupRoutes(this.config, this.secrets));
    this.expressApp.use('/callback', oauthRoutes({}));
    this.expressApp.get('/', (req, res) => res.redirect('/setup'));
    this.expressApp.use('/assets', express.static('public'));

    // Start server
    const host = this.config.express_host || 'localhost';
    this.server = this.expressApp.listen(port, () => {
      const url = `http://${host}:${port}/setup`;
      console.log(`🌐 Setup server running at ${url}`);

      // Open browser to setup
      open(url).catch(console.error);
    });
  }

  /**
   * Sets up graceful shutdown handlers
   */
  setupShutdownHandlers() {
    const shutdown = async (signal) => {
      console.log(`\n⏹ Received ${signal}, shutting down gracefully...`);

      if (this.isRunning) {
        await this.stop();
      }

      console.log('✅ Shutdown complete');
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      console.error('💥 Uncaught Exception:', error);
      console.error(error.stack);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      console.error('💥 Unhandled Rejection:', reason);
      process.exit(1);
    });
  }

  /**
   * Gracefully stops the application
   */
  async stop() {
    console.log('🛑 Stopping application...');

    // Disconnect Twitch chat
    if (this.chatClient) {
      console.log('💬 Disconnecting from Twitch chat...');
      await this.chatClient.disconnect().catch(console.error);
    }

    // Close HTTP server
    if (this.server) {
      console.log('🌐 Closing HTTP server...');
      await new Promise(resolve => {
        this.server.close(resolve);
      });
    }

    this.isRunning = false;
    console.log('✅ Application stopped');
  }
}

module.exports = Application;
