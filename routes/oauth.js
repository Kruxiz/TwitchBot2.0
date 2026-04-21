// routes/oauth.js

/**
 * OAuth callback routes for Twitch and Spotify
 * Delegates to respective controller's callback handler
 */
module.exports = function oauthRoutes(services = {}) {
  const express = require('express');
  const router = express.Router();

  // Generic callback handler for both services
  router.get('/:service(twitch|spotify)', async (req, res) => {
    const service = services[req.params.service];

    if (!service) {
      return res.status(404).send('Service not found');
    }

    try {
      await service._handleCallback(req, res);
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.status(500).send('OAuth failed');
    }
  });

  return router;
};
