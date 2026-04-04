// routes/dashboard.js

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Dashboard routes for configuration management
 * GET /dashboard - Show dashboard page
 * POST /dashboard - Update configuration based on form submission
 */
module.exports = function dashboardRoutes(config) {
  const express = require('express');
  const router = express.Router();

  /**
   * GET /dashboard
   * Renders the configuration dashboard
   */
  router.get('/', (req, res) => {
    let html = fs.readFileSync(
      path.join(process.cwd(), 'templates/dashboard.html'),
      'utf8'
    );

    const userLevelOptions = renderUserLevelOptions(config);

    html = html
      .replace('{{user_name}}', config.user_name)
      .replace('{{channel_name}}', config.channel_name)
      .replace('{{custom_reward_id}}', config.custom_reward_id || '')
      .replace('{{logs_checked}}', config.logs ? 'checked' : '')
      .replace('{{automatic_redemption_checked}}', config.automatic_refunds ? 'checked' : '')
      .replace('{{use_song_command_checked}}', config.use_song_command ? 'checked' : '')
      .replace('{{use_queue_command_checked}}', config.use_queue_command ? 'checked' : '')
      .replace('{{use_history_command_checked}}', config.use_history_command ? 'checked' : '')
      .replace('{{use_skip_command_checked}}', config.use_skip_command ? 'checked' : '')
      .replace('{{user_level_options_song}}', userLevelOptions.song)
      .replace('{{user_level_options_queue}}', userLevelOptions.queue)
      .replace('{{user_level_options_history}}', userLevelOptions.history)
      .replace('{{user_level_options_skip}}', userLevelOptions.skip)
      .replace('{{usage_types}}', (config.usage_types || []).join(', '))
      .replace('{{usage_message}}', config.usage_message || '')
      .replace('{{blocked_tracks}}', (config.blocked_tracks || []).join(','))
      .replace('{{command_alias}}', (config.command_alias || []).join(','))
      .replace('{{skip_alias}}', (config.skip_alias || []).join(','))
      .replace('{{max_duration}}', config.max_duration || '420')
      .replace('{{disable_duplicates_in_queue_checked}}', config.disable_duplicates_in_queue ? 'checked' : '')
      .replace('{{usage_type_options}}', renderUsageTypeOptions(config));

    res.send(html);
  });

  /**
   * POST /dashboard
   * Updates configuration from form submission
   */
  router.post('/', (req, res) => {
    try {
      // Update configuration from form data
      updateConfigFromForm(req.body, config);

      // Save to YAML file
      saveConfig(config);

      console.log('✅ Config updated via dashboard');
      res.redirect('/dashboard');
    } catch (err) {
      console.error('❌ Failed to update config via dashboard:', err);
      res.status(500).send('Failed to save settings');
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

/**
 * Updates configuration from form submission
 * @param {object} body - Request body from form
 * @param {object} config - Configuration object to update
 */
function updateConfigFromForm(body, config) {
  // Strings
  config.user_name = body.user_name;
  config.channel_name = body.channel_name;

  // Numbers
  config.max_duration = parseInt(body.max_duration, 10) || config.max_duration;

  // Booleans
  config.use_song_command = body.use_song_command === 'on';
  config.use_queue_command = body.use_queue_command === 'on';
  config.use_history_command = body.use_history_command === 'on';
  config.use_skip_command = body.use_skip_command === 'on';
  config.automatic_refunds = body.redemption_management === 'on';
  config.logs = body.logs === 'on';
  config.disable_duplicates_in_queue = body.disable_duplicates_in_queue === 'on';

  // Arrays for user levels
  config.command_user_level = getArrayFromBody(body.song_levels);
  config.queue_user_level = getArrayFromBody(body.queue_levels);
  config.history_user_level = getArrayFromBody(body.history_levels);
  config.skip_user_level = getArrayFromBody(body.skip_levels);

  // Usage types
  config.usage_types = getArrayFromBody(body.usage_types);

  // Blocked tracks
  config.blocked_tracks = (body.blocked_tracks || '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  // Command aliases
  config.command_alias = (body.command_alias || '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  config.skip_alias = (body.skip_alias || '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);
}

/**
 * Gets array value from form body (handles both array and single value)
 * @param {any} value - Value from form body
 * @returns {Array<string>} Array of values
 */
function getArrayFromBody(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [value].filter(Boolean);
  return [];
}

/**
 * Renders user level checkbox options for commands
 * @param {object} config - Configuration object
 * @returns {object} Object with options for each command type
 */
function renderUserLevelOptions(config) {
  const userLevels = ['streamer', 'mod', 'vip', 'sub', 'everyone'];

  return {
    song: renderOptions(userLevels, config.command_user_level, 'song'),
    queue: renderOptions(userLevels, config.queue_user_level, 'queue'),
    history: renderOptions(userLevels, config.history_user_level, 'history'),
    skip: renderOptions(userLevels, config.skip_user_level, 'skip')
  };

  function renderOptions(levels, selectedArray, prefix) {
    const selected = Array.isArray(selectedArray) ? selectedArray : [];
    return levels
      .map((level) => `
        <div class="form-check">
          <input class="form-check-input" type="checkbox"
                 name="${prefix}_levels" value="${level}" id="${prefix}_level_${level}"
                 ${selected.includes(level) ? 'checked' : ''}>
          <label class="form-check-label" for="${prefix}_level_${level}">
            ${level.charAt(0).toUpperCase() + level.slice(1)}
          </label>
        </div>
      `)
      .join('');
  }
}

/**
 * Renders usage type select options
 * @param {object} config - Configuration object
 * @returns {string} HTML for select options
 */
function renderUsageTypeOptions(config) {
  const usageTypes = ['command', 'channel_points', 'bits'];

  return usageTypes
    .map(t => `
      <option value="${t}" ${(config.usage_types || []).includes(t) ? 'selected' : ''}>
        ${t.charAt(0).toUpperCase() + t.slice(1).replace('_', ' ')}
      </option>
    `)
    .join('');
}
