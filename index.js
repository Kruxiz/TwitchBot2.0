(async () => {
    const express = require('express');
    const tmi = require('tmi.js');
    const loadConfig = require('./config');
    const checkForUpdates = require('./updateCheck.js');
    const TwitchController = require('./controllers/twitchController.js');
    const SpotifyController = require('./controllers/spotifyController.js');
    const registerEventHandlers = require('./eventHandlers.js');

    const currentConfig = await loadConfig();
    checkForUpdates();

    //initialise the twitch controller
    const twitchAPI = new TwitchController();
    await twitchAPI.init(currentConfig);

    //define the twitch chat client
    const client = new tmi.Client({
        connection: {
            secure: true,
            reconnect: true
        },
        identity: {
            username: currentConfig.user_name,
            password: `oauth:${twitchAPI.token}`
        },
        channels: [currentConfig.channel_name]
    });

    client.connect().catch(console.error);
    //Log the channel connection
    console.log(`Logged in as ${currentConfig.user_name} on channel ${currentConfig.channel_name}`);

    console.log(`express server started on port ${currentConfig.express_port}`);
    //initialise the spotify controller
    const spotifyAPI = new SpotifyController(
        process.env.SPOTIFY_CLIENT_ID,
        process.env.SPOTIFY_CLIENT_SECRET,
        currentConfig.express_port
    );
    // Optionally refresh spotify token at startup
    spotifyAPI.init(currentConfig.express_port);
 
    registerEventHandlers(client, twitchAPI, spotifyAPI, currentConfig);

})();
