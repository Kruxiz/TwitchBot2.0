const { parseActualSongUrlFromBigMessage, parseActualSongUriFromBigMessage, isUserEligible, getTrackId, handleMessageQueries } = require('../utils/utils.js');
const { log } = require('../utils/logger.js');

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
let handleSongRequest = async (client, channel, username, message, tags, spotifyAPI, config) => {
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
    if (config.disable_duplicates_in_queue) {
        let duplicateCheck = await spotifyAPI.getQueue();
        if (duplicateCheck && duplicateCheck.some(track => track.id === songId)) {
            client.say(channel, `${username}, that song is already in the queue.`);
            return false;
        }
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
    if (!message || typeof message !== 'string') return false;
    const cleanedMessage = message.trim();

    // 1 Check if it's a Spotify URL
    if (/open\.spotify\.com/i.test(cleanedMessage)) {
        const parsedUrl = parseActualSongUrlFromBigMessage(cleanedMessage);
        if (parsedUrl) {
            const trackId = getTrackId(parsedUrl, config);
            if (trackId) return trackId;
            log(`Blocked or invalid Spotify URL: ${parsedUrl}`, config);
            return false;
        }
        return false; // contains spotify.com but not a valid track
    }

    // 2 Check if it's a Spotify URI
    if (cleanedMessage.startsWith('spotify:track:')) {
        const parsedUri = parseActualSongUriFromBigMessage(cleanedMessage);
        if (parsedUri) {
            const trackId = getTrackId(parsedUri, config);
            if (trackId) return trackId;
            log(`Blocked or invalid Spotify URI: ${parsedUri}`, config);
            return false;
        }
        return false;
    }

    // 3 Reject non-Spotify URLs outright
    if (/https?:\/\//i.test(cleanedMessage)) {
        log(`Rejected non-Spotify URL: ${cleanedMessage}`, config);
        return false;
    }

    // 4 Otherwise, treat as a search term
    try {
        const foundTrack = await spotifyAPI.searchTrackID(cleanedMessage, config);
        if (!foundTrack) {
            log(`No Spotify track found for: "${cleanedMessage}"`, config);
            return false;
        }
        if (config.blocked_tracks?.includes(foundTrack)) {
            log(`Blocked track found during search: ${foundTrack}`, config);
            return false;
        }
        return foundTrack;
    } catch (error) {
        console.error(`Error while searching for track "${cleanedMessage}": ${error.message}`);
        return false;
    }
}

/**
 * Adds a song to the user's Spotify queue.
 *
 * @param {object} client - The Twitch client instance used to send messages.
 * @param {string} songId - The Spotify ID of the song to be added.
 * @param {string} channel - The Twitch channel where the command was invoked.
 * @param {string} username - The username of the user who requested the song.
 * @param {object} tags - The tags object containing user information.
 * @param {object} spotifyAPI - The Spotify API instance.
 * @param {object} config - The configuration object containing settings for song requests.
 * @returns {Promise<boolean>} A promise which resolves to true if the song was added to the queue, otherwise false.
 */
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
