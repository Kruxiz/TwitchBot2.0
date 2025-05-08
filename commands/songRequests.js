const { parseActualSongUrlFromBigMessage, parseActualSongUriFromBigMessage, isUserEligible, getTrackId, handleMessageQueries } = require('../utils.js');
const { log } = require('../logger.js');
/**
 * Handles a song request from the Twitch channel.
 *
 * This function validates the provided song id,
 * checks if the user is eligible to request a song,
 * and adds the song to the queue if the user is eligible.
 *
 * @param {object} client - The Twitch client instance used to send messages.
 * @param {string} channel - The Twitch channel where the command was invoked.
 * @param {string} username - The username of the user who requested the song.
 * @param {string} message - The message containing the song id.
 * @param {object} tags - The tags object containing user information.
 * @param {object} twitchAPI - The Twitch API instance.
 * @param {object} spotifyAPI - The Spotify API instance.
 * @returns {Promise<boolean>} A promise which resolves to true if the song was added to the queue, false if the user is not eligible.
 */
handleSongRequest = async (client, channel, username, message, tags, twitchAPI, spotifyAPI, currentConfig) => {
    let validatedSongId = await validateSongRequest(message, channel, currentConfig, spotifyAPI);
    if (!validatedSongId) {
        client.say(channel, currentConfig.song_not_found);
        return false;
    } else if (currentConfig.use_cooldown && !usersOnCooldown.has(username)) {
        usersOnCooldown.add(username);
        setTimeout(() => {
            usersOnCooldown.delete(username)
        }, cooldownDuration);
    } else if (currentConfig.use_cooldown) {
        client.say(channel, `${username}, Please wait before requesting another song.`);
        return false;
    }

    return await addValidatedSongToQueue(client, validatedSongId, channel, username, tags, spotifyAPI, currentConfig);
}

/**
 * Validates a song request from the Twitch channel.
 *
 * This function takes a message string from the Twitch channel and attempts to extract a valid song id.
 * If a valid song id is found, it is returned. If not, the function attempts to search for the song
 * using the Spotify API. If the song is found, its id is returned. If the song is not found or
 * an error occurs, the function returns false.
 *
 * @param {string} message - The message containing the song id or search query.
 * @param {string} channel - The Twitch channel where the command was invoked.
 * @returns {Promise<string|boolean>} A promise which resolves to the validated song id if one is found, otherwise false.
 */
let validateSongRequest = async (message, channel, currentConfig, spotifyAPI) => {
    const parsedUrl = parseActualSongUrlFromBigMessage(message, currentConfig);
    if (parsedUrl) {
        const trackId = getTrackId(parsedUrl);
        return trackId;
    }

    const parsedUri = parseActualSongUriFromBigMessage(message, currentConfig);
    if (parsedUri) {
        return getTrackId(parsedUri);
    }

    try {
        const foundTrack = await spotifyAPI.searchTrackID(message, currentConfig);
        if (foundTrack === false) {
            log(`No track found in search for: ${message}`, currentConfig);
        }
        return foundTrack;
    } catch (error) {
        if (error?.response?.data?.error?.status === 401) {
            await spotifyAPI.refreshAccessToken();
            return await validateSongRequest(message, channel, currentConfig, spotifyAPI);
        } else {
            return false;
        }
    }
}

let addValidatedSongToQueue = async (client, songId, channel, callerUsername, tags, spotifyAPI, currentConfig) => {
    try {
        await addSongToQueue(client, songId, channel, callerUsername, tags, spotifyAPI, currentConfig);
    } catch (error) {
        console.log(error);
        // Skipping the error for now, let the users spam it
        // 403 error of not having premium is the same as with the request,
        // ^ TODO get one place to handle common Spotify error codes
    }

    return true;
}

let addSongToQueue = async (client, songId, channel, callerUsername, tags, spotifyAPI, currentConfig) => {
    
    let trackInfo = await spotifyAPI.getTrackInfo(songId);
    let trackName = trackInfo.name;
    let artists = trackInfo.artists.map(artist => artist.name).join(', ');

    let uri = trackInfo.uri;

    let duration = trackInfo.duration_ms / 1000;
    let eligible = isUserEligible(channel, tags, currentConfig.ignore_max_length);

    if (duration > currentConfig.max_duration && !eligible) {
        client.say(channel, `${trackName} is too long. The max duration is ${currentConfig.max_duration} seconds`);
        throw new Error(`${trackName} is too long. The max duration is ${currentConfig.max_duration} seconds`);
    }
    try {
        await spotifyAPI.addSongToQueue(uri);

    }
    catch (error) {
        // Token expired
        if (error?.response?.data?.error?.status === 401) {
            await spotifyAPI.refreshAccessToken();
            await addSongToQueue(client, songId, channel, callerUsername, tags, spotifyAPI, currentConfig);
        }
        if (error?.response?.data?.error?.status === 403) {
            client.say(channel, `It looks like Spotify doesn't want you to use it for some reason. Check the console for details.`);
            console.log(`Spotify doesn't allow requesting songs because: ${error.response.data.error.message}`);
            return false;
        }
        if (error?.response?.data?.error?.status === 400) {
            client.say(channel, currentConfig.song_not_found);
            return false;
        }
        if (error.message.includes("max")) {
            log(error.message);
        }
        else {
            console.log('ERROR WHILE REACHING SPOTIFY');
            console.log(error?.response?.data);
            console.log(error?.response?.status);
            return false;
        }
    }

    let trackParams = {
        artists: artists,
        trackName: trackName,
        username: callerUsername
    }

    client.say(channel, handleMessageQueries(currentConfig.added_to_queue_messages, trackParams));
}

module.exports = {
    handleSongRequest,
    validateSongRequest,
    addValidatedSongToQueue,
    addSongToQueue
};
