// middleware/authGate.js
const { secretsAreValid } = require('../utils/secrets');

/**
 * Creates authentication gate middleware
 * If secrets are invalid, redirects all requests to /setup (except /setup and /callback)
 */
function createAuthGate(secrets) {
  return (req, res, next) => {
    // Allow setup and callback routes when secrets are invalid
    if (!secretsAreValid(secrets)) {
      if (req.path !== '/setup' && !req.path.startsWith('/callback')) {
        return res.redirect('/setup');
      }
    }
    next();
  };
}

module.exports = createAuthGate;
