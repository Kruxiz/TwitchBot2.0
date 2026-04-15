// config.js
const fs = require('fs');
const YAML = require('yaml');
const path = require('path');

const STATE_FILE = path.join(process.cwd(), 'bot_state.json');

async function loadConfig(configPath = 'spotipack_config.yaml') {
  const file = fs.readFileSync(path.resolve(configPath), 'utf8');
  const config = YAML.parse(file);

  // Set default express_host if not specified
  if (!config.express_host) {
    config.express_host = 'spottybotty.local';
  }

  // Set default oauth_host if not specified
  if (!config.oauth_host) {
    config.oauth_host = 'localhost'; // Use localhost for OAuth compatibility
  }

  // Load bot state if exists
  const botState = loadBotState();
  if (botState) {
    config.botState = botState;
  }

  return config;
}

/**
 * Load bot state from state file
 * @returns {object|null} Bot state or null if not exists
 */
function loadBotState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('❌ Failed to load bot state from', STATE_FILE, ':', error);
  }
  return null;
}

module.exports = loadConfig;
module.exports.loadBotState = loadBotState;
