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
 * @param {object} config - The configuration object containing settings for song requests.
 * @returns {Promise<boolean>} A promise which resolves to true if the song was added to the queue, false if the user is not eligible.
 */
let handleSongRequest = async (client, channel, username, message, tags, twitchAPI, spotifyAPI, config) => {
    let songId = await validateSongRequest(message, channel, config, spotifyAPI);
    if (!songId) {
        client.say(channel, config.song_not_found);
        return false;
    }

    if (config.use_cooldown) {
        if (usersOnCooldown.has(username)) {
            client.say(channel, `${username}, please wait before requesting another song.`);
            return false;
        }
        usersOnCooldown.add(username);
        setTimeout(() => usersOnCooldown.delete(username), config.cooldown_duration * 1000);
    }

    return addSongToQueue(client, songId, channel, username, tags, spotifyAPI, config);
};


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
let validateSongRequest = async (message, channel, config, spotifyAPI) => {
    const parsedUrl = parseActualSongUrlFromBigMessage(message, config);
    if (parsedUrl) return getTrackId(parsedUrl, config);

    const parsedUri = parseActualSongUriFromBigMessage(message, config);
    if (parsedUri) return getTrackId(parsedUri, config);

    try {
        const foundTrack = await spotifyAPI.searchTrackID(message, config);
        if (!foundTrack) log(`No track found for: ${message}`, config);
        return foundTrack;
    } catch (error) {
        console.error(`Error while searching for track: ${error.message}`);
        return false;
    }
}

let addSongToQueue = async (client, songId, channel, username, tags, spotifyAPI, config) => {
    try {
        const { name, artists, uri, duration_ms } = await spotifyAPI.getTrackInfo(songId);
        const duration = duration_ms / 1000;
        const artistNames = artists.map(a => a.name).join(', ');

        if (duration > config.max_duration && !isUserEligible(channel, tags, config.ignore_max_length)) {
            const msg = `${name} is too long. Max duration is ${config.max_duration} seconds.`;
            client.say(channel, msg);
            return false;
        }

        await spotifyAPI.addSongToQueue(uri);

        client.say(channel, handleMessageQueries(config.added_to_queue_messages, {
            artists: artistNames,
            trackName: name,
            username
        }));

        return true;
    } catch (error) {
        console.error('Error adding song to queue:', error?.response?.data || error);
        client.say(channel, 'Error adding song to queue.')
        return false;
    }
};


module.exports = {
    handleSongRequest
};
