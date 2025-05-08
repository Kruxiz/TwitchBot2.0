// config.js
const fs = require('fs');
const YAML = require('yaml');
const path = require('path');

async function loadConfig(configPath = 'spotipack_config.yaml') {
    const file = fs.readFileSync(path.resolve(configPath), 'utf8');
    const config = YAML.parse(file);

    // optionally: validate config schema here

    return config;
}

module.exports = loadConfig;
