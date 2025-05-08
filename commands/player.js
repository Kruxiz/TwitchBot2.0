//Handles Spotify Device Player Commands
const { isUserEligible } = require('../utils.js');
const currentConfig = require('../config.js').currentConfig;
const volMin = 0;
const volMax = 100;
const clamp = (num, volMin, volMax) => Math.min(Math.max(num, volMin), volMax);
const axios = require('axios');
const {log} = require('../logger.js');
const displayNameTag = 'display-name';
const usersHaveSkipped = new Set();

/**
 * Handles printing the current queue of songs.
 *
 * This function checks if the user is eligible to use the command
 * and then attempts to print the queue to the specified channel.
 * If the request fails, it logs the error.
 *
 * @param {object} client - The Twitch client instance used to send messages.
 * @param {string} channel - The Twitch channel where the command was invoked.
 * @param {object} spotifyAPI - The Spotify API instance.
 * @returns {Promise<void>} A promise which resolves when the queue has been printed.
 */
handleQueue = async (client, channel, spotifyAPI, currentConfig) => {
    try {
        await printQueue(client, channel, spotifyAPI, currentConfig);
    } catch (error) {
        // Token expired
        if (error?.response?.data?.error?.status === 401) {
            await spotifyAPI.refreshAccessToken();
            await printQueue(client, channel, spotifyAPI);
        } else {
            client.say(channel, `Seems like no music is playing right now`);
        }
    }
}

/**
 * Retrieves and prints the current queue of songs from Spotify.
 *
 * This function fetches the queue of songs from the Spotify API and prints
 * the next few songs in the queue to the specified Twitch channel. The number
 * of songs displayed is determined by the `queue_display_depth` setting in
 * the current configuration. If no songs are in the queue, a message is sent
 * to the channel indicating the queue is empty.
 *
 * @param {object} client - The Twitch client instance used to send messages.
 * @param {string} channel - The Twitch channel where the queue will be printed.
 * @param {object} spotifyAPI - The Spotify API instance used to retrieve the queue.
 */
printQueue = async (client, channel, spotifyAPI, currentConfig) => {
    let spotifyHeaders = spotifyAPI.getSpotifyHeaders();

    let res = await axios.get('https://api.spotify.com/v1/me/player/queue', {
        headers: spotifyHeaders
    });

    if (!res.data?.currently_playing || !res.data?.queue) {
        client.say(channel, 'Nothing in the queue.')
    }
    else {
        let songIndex = 1;
        let concatQueue = '';
        let queueDepthIndex = currentConfig.queue_display_depth;

        res.data.queue?.every(qItem => {
            let trackName = qItem.name;
            let artists = qItem.artists[0].name;
            concatQueue += `• ${songIndex}) ${artists} - ${trackName} `;

            queueDepthIndex--;
            songIndex++;

            // using 'every' to loop instead of 'foreach' allows us to break out of a loop like this
            // so we can keep it
            if (queueDepthIndex <= 0) {
                return false;
            }
            else {
                return true;
            }
        })

        client.say(channel, `▶️ Next ${currentConfig.queue_display_depth} songs: ${concatQueue}`);
    }
}

/**
 * Handles printing the current track name to the Twitch channel.
 *
 * This function attempts to retrieve and print the current track name
 * from Spotify to the specified channel. If the Spotify access token
 * is expired, it refreshes the token and retries the operation.
 *
 * @param {object} client - The Twitch client instance used to send messages.
 * @param {string} channel - The Twitch channel where the track name will be printed.
 * @param {object} spotifyAPI - The Spotify API instance used to retrieve track information.
 */
handleTrackName = async (client, channel, spotifyAPI) => {
    try {
        await printTrackName(client, channel, spotifyAPI);
    } catch (error) {
        // Token expired
        if (error?.response?.data?.error?.status === 401) {
            await spotifyAPI.refreshAccessToken();
            await printTrackName(client, channel);
        } else {
            console.log(error);
            client.say(channel, 'Seems like no music is playing right now');
        }
    }
}

/**
 * Retrieves and prints the current track name from Spotify to the specified Twitch channel.
 *
 * This function fetches the currently playing track from the Spotify API and prints
 * the track name and a link to the track to the specified Twitch channel. If no track
 * is currently playing, a message is sent to the channel indicating that no music
 * is playing.
 *
 * @param {object} client - The Twitch client instance used to send messages.
 * @param {string} channel - The Twitch channel where the track name will be printed.
 * @param {object} spotifyAPI - The Spotify API instance used to retrieve track information.
 */
printTrackName = async (client, channel, spotifyAPI) => {
    let spotifyHeaders = spotifyAPI.getSpotifyHeaders();
    res = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {headers: spotifyHeaders });
    let trackId = res.data.item.id;
    let trackInfo = await spotifyAPI.getTrackInfo(trackId);
    let trackName = trackInfo.name;
    let trackLink = res.data.item.external_urls.spotify;
    let artists = trackInfo.artists.map(artist => artist.name).join(', ');
    client.say(channel, `▶️ ${artists} - ${trackName} -> ${trackLink}`);
}

/**
 * Handles getting the Spotify playback volume for the user.
 *
 * This function checks if the user is eligible to get the volume
 * and then attempts to get the volume from the Spotify API.
 * If the request fails, it logs the error.
 *
 * @param {object} client - The Twitch client instance used to send messages.
 * @param {string} channel - The Twitch channel where the command was invoked.
 * @param {object} tags - The tags object containing user information.
 */
async function handleGetVolume(client, channel, tags, currentConfig, spotifyAPI) {
    try {
        let eligible = isUserEligible(channel, tags, currentConfig.volume_set_level);

        if (eligible) {
            let spotifyHeaders = spotifyAPI.getSpotifyHeaders();
            res = await axios.get('https://api.spotify.com/v1/me/player', { headers: spotifyHeaders });
            let currVolume = res.data.device.volume_percent;
            log(`${tags[displayNameTag]}, the current volume is ${currVolume.toString()}!`, currentConfig);
            client.say(channel, `${tags[displayNameTag]}, the current volume is ${currVolume.toString()}!`);
        }
    } catch (error) {
        console.log(error);
        // Skipping the error for now, let the users spam it
        // 403 error of not having premium is the same as with the request,
        // ^ TODO get one place to handle common Spotify error codes
    }
}

/**
 * Handles setting the Spotify playback volume for the user.
 *
 * This function checks if the user is eligible to set the volume
 * and then attempts to set the volume to the specified percentage.
 * If the provided argument is not a valid number, it informs the user.
 * The function also handles errors related to Spotify API requests.
 *
 * @param {object} client - The Twitch client instance used to send messages.
 * @param {string} channel - The Twitch channel where the command was invoked.
 * @param {object} tags - The tags object containing user information.
 * @param {string} arg - The desired volume level as a percentage (0-100).
 */
async function handleSetVolume(client, channel, tags, arg, currentConfig, spotifyAPI) {

    try {
        let eligible = isUserEligible(channel, tags, currentConfig.volume_set_level);

        if (eligible) {

            let number = 0;
            try {
                number = Number(arg);
                number = clamp(number, volMin, volMax);
            } catch (error) {
                console.log(error);
                client.say(channel, `${tags[displayNameTag]}, a number between 0 and 100 is required.`);
                return;
            }

            let spotifyHeaders = spotifyAPI.getSpotifyHeaders();
            //courtesy of greav
            res = await axios.put('https://api.spotify.com/v1/me/player/volume', null, { headers: spotifyHeaders, params: { volume_percent: number } });

            log(`${tags[displayNameTag]} has set the current volume to ${number.toString()}!`, currentConfig);
            client.say(channel, `${tags[displayNameTag]} has set the current volume to ${number.toString()}!`);
        }
    } catch (error) {
        console.log(error);
        client.say(channel, `There was a problem setting the volume`);
        // Skipping the error for now, let the users spam it
        // 403 error of not having premium is the same as with the request,
        // ^ TODO get one place to handle common Spotify error codes
    }
}

/**
 * Handles a user's vote to skip the current song.
 *
 * This function adds the user to the set of users who have voted to skip
 * and if the total number of users reaches the threshold, it clears the set
 * and skips the current song.
 *
 * @param {object} client - The Twitch client instance used to send messages.
 * @param {string} channel - The Twitch channel where the command was invoked.
 * @param {string} username - The username of the user who voted to skip.
 * @param {object} spotifyAPI - The Spotify API instance used to skip the song.
 * @param {object} currentConfig - The current configuration object.
 */
handleVoteSkip = async (client, channel, username, spotifyAPI, currentConfig) => {

    if (!usersHaveSkipped.has(username)) {
        startOrProgressVoteskip(client, channel, currentConfig);
        usersHaveSkipped.add(username);
        log(`${username} voted to skip the current song (${usersHaveSkipped.size}/${currentConfig.required_vote_skip})!`, currentConfig);
        client.say(channel, `${username} voted to skip the current song (${usersHaveSkipped.size}/${currentConfig.required_vote_skip})!`);
    }
    if (usersHaveSkipped.size >= currentConfig.required_vote_skip) {
        usersHaveSkipped.clear();
        clearTimeout(voteskipTimeout);
        log(`Chat has skipped ${await spotifyAPI.getCurrentTrack()} (${currentConfig.required_vote_skip}/${currentConfig.required_vote_skip})!`, currentConfig);
        client.say(channel, `Chat has skipped ${await spotifyAPI.getCurrentTrack()} (${currentConfig.required_vote_skip}/${currentConfig.required_vote_skip})!`);
        let spotifyHeaders = spotifyAPI.getSpotifyHeaders();
        res = await axios.post('https://api.spotify.com/v1/me/player/next', {}, { headers: spotifyHeaders }); 
    }
}

/**
 * Starts or continues the voteskip process for the specified channel.
 * If there are already people who have voted to skip, it clears the existing timeout.
 * It then sets a new timeout to reset the voteskip after the specified timeout period.
 * @param {object} client - The Twitch client instance.
 * @param {string} channel - The Twitch channel where the voteskip is happening.
 */
function startOrProgressVoteskip(client, channel, currentConfig) {
    if (usersHaveSkipped.size > 0) {
        clearTimeout(voteskipTimeout);
    }

    voteskipTimeout = setTimeout(function () { resetVoteskip(client, channel) }, currentConfig.voteskip_timeout * 1000);
}

/**
 * Resets the voteskip process for the specified channel.
 * This function is called when the timeout period for the voteskip process
 * has expired. It sends a message to the channel indicating that the voteskip
 * has timed out and clears the set of users who have already voted to skip.
 * @param {object} client - The Twitch client instance.
 * @param {string} channel - The Twitch channel where the voteskip is happening.
 */
function resetVoteskip(client, channel) {
    client.say(channel, `Voteskip has timed out... No song will be skipped at this time! catJAM`);
    usersHaveSkipped.clear();
}

/**
 * Handles a song skip request.
 *
 * If the user is eligible for a song skip, says a message in the channel indicating the song was skipped and logs the event.
 * Then, sends a request to the Spotify API to skip the current song.
 *
 * @param {object} client - The TwitchIO client.
 * @param {string} channel - The channel name to operate in.
 * @param {object} tags - The user's tags.
 */
handleSkipSong = async (client, channel, tags, spotifyAPI, currentConfig) => {
    try {
        let eligible = isUserEligible(channel, tags, currentConfig.skip_user_level);

        if (eligible) {
            client.say(channel, `${tags[displayNameTag]} skipped ${await spotifyAPI.getCurrentTrack()}!`);
            log(`${tags[displayNameTag]} skipped ${await spotifyAPI.getCurrentTrack()}!`, currentConfig);
            let spotifyHeaders = spotifyAPI.getSpotifyHeaders();
            res = await axios.post('https://api.spotify.com/v1/me/player/next', null, { headers: spotifyHeaders });
        }
    } catch (error) {
        console.log(error);
        // Skipping the error for now, let the users spam it
        // 403 error of not having premium is the same as with the request,
        // ^ TODO get one place to handle common Spotify error codes
    }
}
module.exports = {
    handleQueue,
    handleTrackName,
    handleGetVolume,
    handleSetVolume,
    handleVoteSkip,
    handleSkipSong
};