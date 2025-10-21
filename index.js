(async () => {
    const express = require('express');
    const bodyParser = require('body-parser');
    const fs = require('fs');
    const yaml = require('js-yaml');
    const path = require('path');
    const tmi = require('tmi.js');
    const loadConfig = require('./config');
    const checkForUpdates = require('./updateCheck.js');
    const TwitchController = require('./controllers/twitchController.js');
    const SpotifyController = require('./controllers/spotifyController.js');
    const registerEventHandlers = require('./eventHandlers.js');
    const open = require('open');

    let currentConfig = await loadConfig();
    checkForUpdates();

    // === Express setup ===
    const app = express();
    const HOST = '127.0.0.1';
    app.use(bodyParser.json());

    // Endpoint: get current config
    app.get('/config', (req, res) => {
        res.json(currentConfig);
    });

    // Endpoint: update config
    app.post('/config', (req, res) => {
        try {
            // merge new values into config
            Object.assign(currentConfig, req.body);

            // write back to YAML file
            fs.writeFileSync(
                'spotipack_config.yaml',
                yaml.dump(currentConfig, { indent: 2 })
            );

            console.log("✅ Config updated via web request");
            res.json({ success: true, updated: currentConfig });
        } catch (err) {
            console.error("❌ Failed to update config:", err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // Serve Dashboard HTML
    app.get('/dashboard', (req, res) => {
        const usageTypes = ['command', 'channel_points', 'bits'];
        const userLevels = [ 'streamer', 'mod', 'vip', 'sub', 'everyone'];

        function renderUserLevelOptionsMulti(selectedArray, prefix) {
            return userLevels.map(level => `
                <div class="form-check">
                    <input class="form-check-input" type="checkbox"
                           name="${prefix}_levels" value="${level}" id="${prefix}_level_${level}"
                           ${selectedArray.includes(level) ? 'checked' : ''}>
                    <label class="form-check-label" for="${prefix}_level_${level}">
                        ${level.charAt(0).toUpperCase() + level.slice(1)}
                    </label>
                </div>
            `).join('');
        }        
        

        let html = fs.readFileSync(path.join(process.cwd(), 'templates/dashboard.html'), 'utf8');

        // Replace placeholders
        html = html.replace('{{user_name}}', currentConfig.user_name)
            .replace('{{channel_name}}', currentConfig.channel_name)
            .replace('{{custom_reward_id}}', currentConfig.custom_reward_id || '')
            .replace('{{logs_checked}}', currentConfig.logs ? 'checked' : '')
            .replace('{{automatic_redemption_checked}}', currentConfig.automatic_refunds ? 'checked' : '')
            .replace('{{use_song_command_checked}}', currentConfig.use_song_command ? 'checked' : '')
            .replace('{{use_queue_command_checked}}', currentConfig.use_queue_command ? 'checked' : '')
            .replace('{{use_history_command_checked}}', currentConfig.use_history_command ? 'checked' : '')
            .replace('{{use_skip_command_checked}}', currentConfig.use_skip_command ? 'checked' : '')
            .replace('{{user_level_options_song}}', renderUserLevelOptionsMulti(currentConfig.command_user_level, 'song'))
            .replace('{{user_level_options_queue}}', renderUserLevelOptionsMulti(currentConfig.queue_user_level, 'queue'))
            .replace('{{user_level_options_history}}', renderUserLevelOptionsMulti(currentConfig.history_user_level, 'history'))
            .replace('{{user_level_options_skip}}', renderUserLevelOptionsMulti(currentConfig.skip_user_level, 'skip'))
            .replace('{{usage_types}}', currentConfig.usage_types.join(', '))
            .replace('{{usage_message}}', currentConfig.usage_message)
            .replace('{{blocked_tracks}}', currentConfig.blocked_tracks.join(','))
            .replace('{{command_alias}}', currentConfig.command_alias.join(','))
            .replace('{{skip_alias}}', currentConfig.skip_alias.join(','))
            .replace('{{max_duration}}', currentConfig.max_duration)
            .replace('{{usage_type_options}}', usageTypes.map(t =>
                `<option value="${t}" ${currentConfig.usage_types.includes(t) ? 'selected' : ''}>${t}</option>`
            ).join(''));

        res.send(html);
    });

    // Handle Dashboard POST
    app.post('/dashboard', express.urlencoded({ extended: true }), (req, res) => {
        try {
            // Strings
            currentConfig.user_name = req.body.user_name;
            currentConfig.channel_name = req.body.channel_name;

            // Numbers
            currentConfig.max_duration = parseInt(req.body.max_duration) || currentConfig.max_duration;

            // Booleans
            currentConfig.use_song_command = req.body.use_song_command === 'on';
            currentConfig.use_queue_command = req.body.use_queue_command === 'on';
            currentConfig.use_history_command = req.body.use_history_command === 'on';
            currentConfig.use_skip_command = req.body.use_skip_command === 'on';
            currentConfig.automatic_refunds = req.body.redemption_management === 'on';
            currentConfig.logs = req.body.logs === 'on';
            
            currentConfig.command_user_level = Array.isArray(req.body.song_levels) 
                ? req.body.song_levels 
                : [req.body.song_levels || []];
            
            currentConfig.queue_user_level = Array.isArray(req.body.queue_levels) 
                ? req.body.queue_levels 
                : [req.body.queue_levels || []];
            
            currentConfig.history_user_level = Array.isArray(req.body.history_levels) 
                ? req.body.history_levels 
                : [req.body.history_levels || []];
            
            currentConfig.skip_user_level = Array.isArray(req.body.skip_levels) 
                ? req.body.skip_levels 
                : [req.body.skip_levels || []];

            // Arrays
            if (Array.isArray(req.body.usage_types)) {
                currentConfig.usage_types = req.body.usage_types;
            } else if (typeof req.body.usage_types === 'string') {
                currentConfig.usage_types = [req.body.usage_types];
            }

            currentConfig.blocked_tracks = req.body.blocked_tracks.split(',').map(t => t.trim()).filter(Boolean);
            currentConfig.command_alias = req.body.command_alias.split(',').map(t => t.trim()).filter(Boolean);
            currentConfig.skip_alias = req.body.skip_alias.split(',').map(t => t.trim()).filter(Boolean);

            // Save updated config to file
            saveConfig(currentConfig);

            console.log("✅ Config updated via dashboard");
            res.redirect('/dashboard');
        } catch (err) {
            console.error("❌ Failed to update config via dashboard:", err);
            res.status(500).send('Failed to save settings');
        }
    });

    // start server
    app.listen(currentConfig.express_port, () => {
        console.log(`Express server running at http://${HOST}:${currentConfig.express_port}`);
        console.log(`Dashboard available at http://${HOST}:${currentConfig.express_port}/dashboard`);
    });

    open(`http://${HOST}:${currentConfig.express_port}/dashboard`).catch(console.error);

    // === Twitch/Spotify setup ===
    const twitchAPI = new TwitchController();
    await twitchAPI.init(currentConfig);

    const client = new tmi.Client({
        connection: { secure: true, reconnect: true },
        identity: {
            username: currentConfig.user_name,
            password: `oauth:${twitchAPI.token}`
        },
        channels: [currentConfig.channel_name]
    });

    client.connect().catch(console.error);
    console.log(`Logged in as ${currentConfig.user_name} on channel ${currentConfig.channel_name}`);

    const spotifyAPI = new SpotifyController(
        process.env.SPOTIFY_CLIENT_ID,
        process.env.SPOTIFY_CLIENT_SECRET,
        currentConfig.express_port
    );
    spotifyAPI.init(app);

    registerEventHandlers(client, twitchAPI, spotifyAPI, currentConfig);

    function saveConfig(newConfig) {
        fs.writeFileSync('spotipack_config.yaml', yaml.dump(newConfig, { indent: 2 }), 'utf8');
        
        newFileContents = fs.readFileSync('spotipack_config.yaml', 'utf8');
        currentconFig = yaml.load(newFileContents);
    }
})();