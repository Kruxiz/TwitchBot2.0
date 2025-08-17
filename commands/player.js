// Handles Spotify Device Player Commands
const { isUserEligible } = require('../utils.js');
const {formatQueue, formatTrack, formatHistory} = require('../utils/formatters.js');
const currentConfig = require('../config.js').currentConfig;
const volMin = 0;
const volMax = 100;
const clamp = (num, volMin, volMax) => Math.min(Math.max(num, volMin), volMax);
const axios = require('axios');
const { log } = require('../logger.js');
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
        let tracks = await spotifyAPI.getQueue();
        client.say(channel, formatQueue(tracks, currentConfig.queue_display_depth));
    } catch (error) {
        log(error, currentConfig, 'error');
        client.say(channel, `There was an error retrieving the queue.`);
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
        const track = await spotifyAPI.getCurrentTrack();
        client.say(channel, formatTrack(track));
    } catch (error) {
        log(error, currentConfig, 'error');
        client.say(channel, 'There was an error retrieving the current track.');
    }
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
        if (!eligible) return;

        let res = await spotifyAPI.request(async () => axios.get('https://api.spotify.com/v1/me/player', { headers: spotifyAPI.getSpotifyHeaders() }));
        let currVolume = res.data.device.volume_percent;

        log(`${tags[displayNameTag]}, the current volume is ${currVolume}!`, currentConfig);
        client.say(channel, `${tags[displayNameTag]}, the current volume is ${currVolume}!`);
    } catch (error) {
        log(error, currentConfig);
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
        const eligible = isUserEligible(channel, tags, currentConfig.volume_set_level);
        if (!eligible) return;

        let number = Number(arg);
        if (isNaN(number)) {
            client.say(channel, `${tags[displayNameTag]}, a number between 0 and 100 is required.`);
            return;
        }
        number = clamp(number, volMin, volMax);

        await spotifyAPI.request(async () => axios.put('https://api.spotify.com/v1/me/player/volume', null, { headers: spotifyAPI.getSpotifyHeaders(), params: { volume_percent: number } }));

        log(`${tags[displayNameTag]} has set the current volume to ${number}!`, currentConfig);
        client.say(channel, `${tags[displayNameTag]} has set the current volume to ${number}!`);
    } catch (error) {
        log(error, currentConfig);
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
    try {
        if (!usersHaveSkipped.has(username)) {
            startOrProgressVoteskip(client, channel, currentConfig);
            usersHaveSkipped.add(username);

            log(`${username} voted to skip the current song (${usersHaveSkipped.size}/${currentConfig.required_vote_skip})!`, currentConfig);
            client.say(channel, `${username} voted to skip the current song (${usersHaveSkipped.size}/${currentConfig.required_vote_skip})!`);
        }

        if (usersHaveSkipped.size >= currentConfig.required_vote_skip) {
            usersHaveSkipped.clear();
            clearTimeout(voteskipTimeout);

            const currentTrack = await spotifyAPI.getCurrentTrack();
            log(`Chat has skipped ${currentTrack} (${currentConfig.required_vote_skip}/${currentConfig.required_vote_skip})!`, currentConfig);
            client.say(channel, `Chat has skipped ${currentTrack} (${currentConfig.required_vote_skip}/${currentConfig.required_vote_skip})!`);

            await spotifyAPI.request(async () => axios.post('https://api.spotify.com/v1/me/player/next', null, { headers: spotifyAPI.getSpotifyHeaders() }));
        }
    } catch (error) {
        console.log(error);
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

    voteskipTimeout = setTimeout(() => resetVoteskip(client, channel), currentConfig.voteskip_timeout * 1000);
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
        const eligible = isUserEligible(channel, tags, currentConfig.skip_user_level);
        if (!eligible) return;

        const currentTrack = await spotifyAPI.getCurrentTrack();
        client.say(channel, `${tags[displayNameTag]} skipped ${currentTrack}!`);
        log(`${tags[displayNameTag]} skipped ${currentTrack}!`, currentConfig);

        await spotifyAPI.request(async () => axios.post('https://api.spotify.com/v1/me/player/next', null, { headers: spotifyAPI.getSpotifyHeaders() }));
    } catch (error) {
        log(error, currentConfig);
    }
}


/**
 * Handles a request for the user's recently played tracks.
 *
 * This function checks if the user is eligible for this command and then
 * calls the getRecentlyPlayed function of the SpotifyAPI instance to retrieve
 * the user's recently played tracks. If the request fails, it logs the error.
 *
 * @param {object} client - The Twitch client instance used to send messages.
 * @param {string} channel - The Twitch channel where the tracks will be printed.
 * @param {object} tags - The tags object containing user information.
 * @param {object} spotifyAPI - The Spotify API instance used to retrieve the recently played tracks.
 * @param {object} currentConfig - The current configuration object.
 */
handleGetRecentlyPlayed = async (client, channel, tags, spotifyAPI, currentConfig) => {
    try {
        log(`Requesting recently played tracks for ${tags[displayNameTag]}...`, currentConfig);
        const eligible = isUserEligible(channel, tags, currentConfig.history_user_level);
        if (!eligible) return;
        const history = await spotifyAPI.getRecentlyPlayed(client, channel, currentConfig);
        client.say(channel, formatHistory(history, currentConfig.history_display_depth));
    } catch (error) {
        log(error, currentConfig);
    }
}

module.exports = {
    handleQueue,
    handleTrackName,
    handleGetVolume,
    handleSetVolume,
    handleVoteSkip,
    handleSkipSong,
    handleGetRecentlyPlayed
};