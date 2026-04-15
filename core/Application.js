const express = require('express');
const EventBus = require('./EventBus');
const RecoveryManager = require('../errors/RecoveryManager');
const BotStateManager = require('./BotStateManager');

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
    this.eventBus = null;
    this.recoveryManager = null;
    this.botStateManager = null;
  }

  /**
   * Starts the application
   * Always starts web server and RecoveryManager
   * Bot services start based on auto_start_bot config or manual control
   * If secrets are invalid, starts in setup-only mode
   * @param {number} port - Port to listen on (default: 8888)
   */
  async start(port = 8888) {
    console.log('🚀 Starting Spotty Botty...');
    console.log('📊 Dashboard will be available at all times');

    // Check if setup is required
    if (!this.hasValidSecrets()) {
      console.log('🔐 Missing secrets, entering setup mode...');
      await this.startSetupOnly(port);
      return;
    }

    // Normal startup
    console.log('✅ Secrets valid, starting application...');

    // Always create eventBus and RecoveryManager
    console.log('🔔 Creating EventBus and RecoveryManager...');
    this.eventBus = new EventBus();
    this.recoveryManager = new RecoveryManager(this.eventBus);

    // Always create Express app and register routes
    this.createExpressApp();
    this.setupMiddleware();
    this.registerRoutes();

    // Create and initialize BotStateManager
    this.botStateManager = new BotStateManager(this, this.config);
    await this.botStateManager.initialize();

    // Start HTTP server (always running)
    this.startWebServer(port);

    // Make BotStateManager available to routes
    this.expressApp.locals.botStateManager = this.botStateManager;

    // Start bot services if auto_start_bot is true OR if saved state was running
    const savedState = this.config.botState;
    const shouldAutoStart = savedState
      ? savedState.isRunning && savedState.isRunning === true
      : this.config.auto_start_bot === true;

    if (shouldAutoStart) {
      console.log('🤖 Auto-starting bot services...');
      await this.botStateManager.startBot();
    } else {
      console.log('🤖 Bot services will start manually from dashboard');
      console.log('📊 Visit http://localhost:8888/dashboard to control the bot');
    }

    // Handle graceful shutdown
    this.setupShutdownHandlers();
  }

  /**
   * Starts the web server
   * Always available
   */
  startWebServer(port) {
    const host = this.config.express_host || 'localhost';
    this.server = this.expressApp.listen(port, () => {
      console.log(`🌐 Express server running at http://${host}:${port}`);
      console.log(`📊 Dashboard available at http://${host}:${port}/dashboard`);
      console.log(`🎵 Overlay available at http://${host}:${port}/now-playing`);
      this.isRunning = true;
    });
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
   * Registers all application routes
   */
  registerRoutes() {
    console.log('🛣️ Registering routes...');

    const setupRoutes = require('../routes/setup');
    const configRoutes = require('../routes/config');
    const dashboardRoutes = require('../routes/dashboard');
    const oauthRoutes = require('../routes/oauth');

    // Main routes
    this.expressApp.use('/setup', setupRoutes(this.config, this.secrets));
    this.expressApp.use('/config', configRoutes(this.config));
    this.expressApp.use('/dashboard', dashboardRoutes(this.config));
    this.expressApp.use('/callback', oauthRoutes(this.services));

    // Static assets
    this.expressApp.use(express.static('public'));

    console.log('✅ Routes registered');
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

    // Stop bot services first
    if (this.botStateManager && this.botStateManager.isBotRunning) {
      console.log('🛑 Stopping bot services...');
      await this.botStateManager.stopBot();
    }

    // Close HTTP server (web interface)
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
