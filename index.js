// index.js - Application Entry Point

/**
 * Spotty Botty - Twitch bot for Spotify queue management
 * Main entry point that uses Application Orchestrator
 */

const loadConfig = require('./config');
const { loadSecrets } = require('./utils/secrets');

/**
 * Main application entry point
 * Loads configuration and secrets, creates Application orchestrator, and starts the app
 */
async function main() {
  try {
    console.log('🎵 Starting Spotty Botty...');

    // Load configuration from YAML file
    const config = await loadConfig();
    console.log('✅ Configuration loaded');

    // Load secrets (or empty object if not set)
    let secrets = loadSecrets() || {};

    // Create Application orchestrator
    const Application = require('./core/Application');
    const app = new Application(config, secrets);

    // Check for updates
    const checkForUpdates = require('./updateCheck.js');
    checkForUpdates();

    // Start application
    await app.start(config.express_port || 8888);

    // Setup graceful shutdown handlers
    setupShutdownHandlers(app);

  } catch (error) {
    console.error('❌ Failed to start application:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Sets up graceful shutdown handlers for the application
 * @param {Application} app - Application instance
 */
function setupShutdownHandlers(app) {
  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', async () => {
    console.log('\n⏹ Received SIGINT, shutting down gracefully...');
    await app.stop();
    process.exit(0);
  });

  // Handle SIGTERM (process termination)
  process.on('SIGTERM', async () => {
    console.log('\n⏹ Received SIGTERM, shutting down gracefully...');
    await app.stop();
    process.exit(0);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    console.error(error.stack);
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    console.error('💥 Unhandled Rejection:', reason);
    process.exit(1);
  });
}

// Run if called directly (node index.js)
if (require.main === module) {
  (async () => {
    await main();
  })();
}

module.exports = { main };
