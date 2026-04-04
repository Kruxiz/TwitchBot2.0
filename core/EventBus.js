// core/EventBus.js
// Simple event dispatcher for event-driven architecture

class EventBus {
  constructor() {
    this.listeners = new Map();
    this.isEnabled = true;
  }

  /**
   * Register an event handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   * @returns {Function} Unsubscribe function
   */
  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);

    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  /**
   * Emit an event to all listeners
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emit(event, data) {
    if (!this.isEnabled) {
      console.warn(`[EventBus] Events disabled, event ${event} not emitted`);
      return;
    }

    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`[EventBus] Error in event handler for ${event}:`, error);
          // Emit error event for recovery
          this.emit('system.error', { error, event, data });
        }
      });
    }
  }

  /**
   * Remove an event handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler to remove
   */
  off(event, handler) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Clear all event handlers for an event
   * @param {string} event - Event name
   */
  removeAllListeners(event) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get listener count for an event
   * @param {string} event - Event name
   * @returns {number} Number of listeners
   */
  listenerCount(event) {
    const handlers = this.listeners.get(event);
    return handlers ? handlers.length : 0;
  }

  /**
   * Enable/disable event emissions
   * @param {boolean} enabled - Enable or disable
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
  }
}

module.exports = EventBus;
