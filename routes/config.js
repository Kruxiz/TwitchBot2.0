// routes/config.js

const yaml = require('js-yaml');
const fs = require('fs');

/**
 * Configuration API routes
 * GET /config - Returns current configuration
 * POST /config - Updates configuration
 */
module.exports = function configRoutes(config) {
  const express = require('express');
  const router = express.Router();

  /**
   * GET /config
   * Returns the current configuration as JSON
   */
  router.get('/', (req, res) => {
    res.json(config);
  });

  /**
   * POST /config
   * Updates the configuration from JSON body
   * Saves to spotipack_config.yaml
   */
  router.post('/', (req, res) => {
    try {
      // Apply updates to config object
      Object.assign(config, req.body);

      // Save to file
      saveConfig(config);

      console.log('✅ Config updated via API');
      res.json({ success: true, updated: config });
    } catch (err) {
      console.error('❌ Failed to update config:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};

/**
 * Saves configuration to YAML file
 * @param {object} config - Configuration object
 */
function saveConfig(config) {
  fs.writeFileSync(
    'spotipack_config.yaml',
    yaml.dump(config, { indent: 2 }),
    'utf8'
  );
}
