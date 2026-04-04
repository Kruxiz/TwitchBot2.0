// routes/setup.js

const fs = require('fs');
const path = require('path');
const { saveSecrets } = require('../utils/secrets');

/**
 * Registration routes for initial setup
 * GET /setup - Show setup page
 * POST /setup - Save secrets and redirect
 */
module.exports = function setupRoutes(config, secrets) {
  const express = require('express');
  const router = express.Router();

  /**
   * GET /setup
   * Shows the setup page if secrets are invalid
   * Redirects to dashboard if secrets are already valid
   */
  router.get('/', (req, res) => {
    // If secrets are valid, redirect to dashboard
    if (secrets && secretsAreValid(secrets)) {
      return res.redirect('/dashboard');
    }

    // Load and render setup template
    let html = fs.readFileSync(
      path.join(process.cwd(), 'templates/setup.html'),
      'utf8'
    );

    const baseUrl = getBaseUrl(config);

    html = html
      .replace('{{TWITCH_REDIRECT_URI}}', `${baseUrl}/callback/twitch`)
      .replace('{{SPOTIFY_REDIRECT_URI}}', `${baseUrl}/callback/spotify`);

    res.send(html);
  });

  /**
   * POST /setup
   * Saves secrets and triggers restart
   */
  router.post('/', (req, res) => {
    const secrets = {
      twitch: {
        clientId: req.body.twitchClientId?.trim(),
        clientSecret: req.body.twitchClientSecret?.trim(),
      },
      spotify: {
        clientId: req.body.spotifyClientId?.trim(),
        clientSecret: req.body.spotifyClientSecret?.trim(),
      },
    };

    // Save secrets
    saveSecrets(secrets);

    console.log('🔐 Secrets saved. Restarting process...');

    // Send success response and trigger restart
    res.send(`
      <h2>✅ Setup complete</h2>
      <p>Restarting…</p>
      <script>setTimeout(() => location.href='/', 500);</script>
    `);

    // Exit to trigger restart by process manager
    res.on('finish', () => {
      setTimeout(() => process.exit(10), 300);
    });
  });

  return router;
};

/**
 * Checks if secrets are valid
 * @param {object} secrets - Secrets object
 * @returns {boolean} true if secrets are valid
 */
function secretsAreValid(secrets) {
  return require('../utils/secrets').secretsAreValid(secrets);
}

/**
 * Gets the base URL for the application
 * @param {object} config - Config object
 * @returns {string} Base URL
 */
function getBaseUrl(config) {
  return `http://${config.express_host || 'localhost'}:${config.express_port || 8888}`;
}
