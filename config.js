// config.js
const fs = require('fs');
const YAML = require('yaml');
const path = require('path');

async function loadConfig(configPath = 'spotipack_config.yaml') {
    const file = fs.readFileSync(path.resolve(configPath), 'utf8');
    const config = YAML.parse(file);

    // optionally: validate config schema here

    // Set default express_host if not specified
  if (!config.express_host) {
    config.express_host = 'spottybotty.local';
  }

  // Set default oauth_host if not specified
  if (!config.oauth_host) {
    config.oauth_host = 'localhost';  // Use localhost for OAuth compatibility
  }

  return config;
}

module.exports = loadConfig;
