// errors/RecoveryManager.js
// Manages error recovery and graceful shutdown

const DomainEvents = require('../core/DomainEvents');

class RecoveryManager {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.recoveryStrategies = new Map();
    this.recoveryAttempts = new Map();
    this.maxRecoveryAttempts = 3;
    this.setupGlobalHandlers();
  }

  /**
   * Register a recovery strategy for a specific error code
   * @param {string} errorCode - Error code to handle
   * @param {Function} strategy - Async recovery function (error, context) => Promise
   */
  register(errorCode, strategy) {
    if (!errorCode || typeof strategy !== 'function') {
      throw new Error('Recovery strategy requires errorCode and strategy function');
    }
    this.recoveryStrategies.set(errorCode, strategy);
    console.log(`[RecoveryManager] Registered recovery strategy for ${errorCode}`);
  }

  /**
   * Setup global error handlers
   * @private
   */
  setupGlobalHandlers() {
    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('💥 Uncaught Exception:', error);
      this.eventBus && this.eventBus.emit(DomainEvents.System.ServiceError, {
        service: 'application',
        error,
        context: { type: 'uncaughtException' }
      });
      await this.attemptRecovery('UNCAUGHT_EXCEPTION', error, { type: 'uncaughtException' });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason, promise) => {
      console.error('💥 Unhandled Rejection:', reason);
      this.eventBus && this.eventBus.emit(DomainEvents.System.ServiceError, {
        service: 'application',
        error: reason,
        context: { type: 'unhandledRejection', promise }
      });
      await this.attemptRecovery('UNHANDLED_REJECTION', reason, { type: 'unhandledRejection', promise });
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', async () => {
      console.log('\n⏹ Received SIGINT, attempting graceful shutdown...');
      this.eventBus && this.eventBus.emit(DomainEvents.System.ShutdownRequested, {
        reason: 'SIGINT'
      });
      await this.gracefulShutdown();
    });

    // Handle SIGTERM
    process.on('SIGTERM', async () => {
      console.log('\n⏹ Received SIGTERM, attempting graceful shutdown...');
      this.eventBus && this.eventBus.emit(DomainEvents.System.ShutdownRequested, {
        reason: 'SIGTERM'
      });
      await this.gracefulShutdown();
    });

    // Handle service errors from event bus
    if (this.eventBus) {
      this.eventBus.on(DomainEvents.System.ServiceError, async ({ service, error, context }) => {
        await this.attemptRecovery(error.code || 'SERVICE_ERROR', error, { service, ...context });
      });
    }
  }

  /**
   * Attempt to recover from an error
   * @param {string} errorCode - Error code
   * @param {Error} error - Error object
   * @param {Object} context - Error context
   * @returns {Promise<Boolean>} True if recovery successful
   */
  async attemptRecovery(errorCode, error, context = {}) {
    const strategy = this.recoveryStrategies.get(errorCode);
    const attemptKey = `${errorCode}:${error.message || 'unknown'}`;

    if (!strategy) {
      console.error(`[RecoveryManager] No recovery strategy for ${errorCode}`);
      await this.gracefulShutdown();
      return false;
    }

    // Track recovery attempts
    const attempts = this.recoveryAttempts.get(attemptKey) || 0;
    if (attempts >= this.maxRecoveryAttempts) {
      console.error(`[RecoveryManager] Max recovery attempts (${this.maxRecoveryAttempts}) exceeded for ${errorCode}`);
      await this.gracefulShutdown();
      return false;
    }

    this.recoveryAttempts.set(attemptKey, attempts + 1);

    try {
      console.log(`[RecoveryManager] Attempt ${attempts + 1}/${this.maxRecoveryAttempts} recovery for ${errorCode}`);
      this.eventBus && this.eventBus.emit(DomainEvents.System.RecoveryAttempt, {
        errorCode,
        attempt: attempts + 1,
        maxAttempts: this.maxRecoveryAttempts,
        error,
        context
      });

      await strategy(error, context, this);

      console.log(`[RecoveryManager] Recovery successful for ${errorCode}`);
      this.eventBus && this.eventBus.emit(DomainEvents.System.RecoverySuccess, {
        errorCode,
        error
      });

      // Reset recovery attempts on success
      this.recoveryAttempts.delete(attemptKey);
      return true;

    } catch (recoveryError) {
      console.error(`[RecoveryManager] Recovery failed for ${errorCode}:`, recoveryError);
      this.eventBus && this.eventBus.emit(DomainEvents.System.RecoveryFailed, {
        errorCode,
        error,
        recoveryError
      });

      await this.gracefulShutdown();
      return false;
    }
  }

  /**
   * Perform graceful shutdown
   * @param {string} reason - Shutdown reason
   */
  async gracefulShutdown(reason = 'unknown') {
    console.log(`[RecoveryManager] Graceful shutdown initiated (reason: ${reason})`);

    // Allow services time to cleanup
    if (this.eventBus) {
      this.eventBus.emit(DomainEvents.System.ShutdownRequested, {
        reason,
        timestamp: new Date().toISOString()
      });

      // Wait for services to handle shutdown
      console.log('[RecoveryManager] Waiting 2 seconds for services to cleanup...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('[RecoveryManager] Exiting process');
    process.exit(1); // Exit with error code
  }

  /**
   * Register default recovery strategies
   * Should be called after services are initialized
   * @param {Object} services - Available services (auth, chat, etc.)
   */
  registerDefaultStrategies(services) {
    // Spotify auth recovery
    this.register('SPOTIFY_AUTH_ERROR', async (error, context) => {
      console.log('[Recovery] Spotify auth failed, attempting re-authentication');
      if (services.spotifyAuth) {
        await services.spotifyAuth.refreshToken();
      } else {
        console.error('[Recovery] Spotify auth service not available');
      }
    });

    // Spotify rate limit recovery
    this.register('SPOTIFY_RATE_LIMIT_ERROR', async (error, context) => {
      const retryAfter = error.retryAfter || 60;
      console.log(`[Recovery] Spotify rate limited, backing off for ${retryAfter}s`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));

      // Retry operation if provided
      if (context.retry) {
        await context.retry();
      }
    });

    // Twitch auth recovery
    this.register('TWITCH_AUTH_ERROR', async (error, context) => {
      console.log('[Recovery] Twitch auth failed, attempting re-authentication');
      if (services.twitchAuth) {
        await services.twitchAuth.refreshToken();
      } else {
        throw new Error('Twitch auth service not available');
      }
    });

    // Twitch disconnection recovery
    this.register('TWITCH_DISCONNECTED', async (error, context) => {
      console.log('[Recovery] Twitch disconnected, attempting reconnection');
      if (services.twitchChat) {
        await services.twitchChat.reconnect();
      } else {
        throw new Error('Twitch chat service not available');
      }
    });

    // Generic service error recovery
    this.register('SERVICE_ERROR', async (error, context) => {
      console.log('[Recovery] Generic service error, backoff and retry');
      const delay = context.service === 'spotify' ? 3000 : 1000;
      await new Promise(resolve => setTimeout(resolve, delay));

      if (context.retry) {
        await context.retry();
      }
    });

    console.log('[RecoveryManager] Default recovery strategies registered');
  }

  /**
   * Clear all recovery strategies
   */
  clearStrategies() {
    this.recoveryStrategies.clear();
    this.recoveryAttempts.clear();
    console.log('[RecoveryManager] All recovery strategies cleared');
  }
}

module.exports = RecoveryManager;
