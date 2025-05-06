// Description: Utility functions for Twitch bot

const { log } = require('./logger.js');

const currentConfig = require('./config.js').currentConfig;

//spotify regex constants
const spotifyShareUrlBase = 'https://open.spotify.com';
const spotifyShareUrlMaker = `${spotifyShareUrlBase}/track/`;
const spotifyShareUrlMakerRegex = `${spotifyShareUrlBase}/(?:.*)?track/[^\\s]+`;
const spotifyShareUriMaker = 'spotify:track:';

function isUserEligible(channel, tags, rolesArray) {
    const username = tags.username;
    const channelName = channel.replace('#', '');

    const streamer = 'streamer';
    const mod = 'mod';
    const vip = 'vip';
    const sub = 'sub';
    const everyone = 'everyone';

    //log(`Checking user: ${username}`);
    //log(`Tags: ${JSON.stringify(tags)}`);
    //log(`Roles to check: ${rolesArray}`);

    const roleChecks = [
        { check: tags.badges?.broadcaster === '1' || username === channelName, role: streamer },
        { check: tags.mod === true || tags.mod === '1', role: mod },
        { check: tags.badges?.vip === '1', role: vip },
        { check: tags.badges?.subscriber === '1' || tags['badge-info']?.subscriber, role: sub },
        { check: true, role: everyone },
    ];

    return roleChecks.some(({ check, role }) => check && rolesArray.includes(role));
}

/**
 * Extracts the Spotify track URL from a given message.
 *
 * This function uses a regular expression to search for a Spotify track URL
 * pattern within the input message string. If a match is found, it returns
 * the matched URL. If no match is found, it returns null.
 *
 * @param {string} message - The message containing the potential Spotify track URL.
 * @returns {string|null} - The extracted Spotify track URL if found, otherwise null.
 */
function parseActualSongUrlFromBigMessage(message, currentConfig) {
    log(`Parsing message: ${message}`, currentConfig);
    const regex = new RegExp(spotifyShareUrlMakerRegex);
    let match = message.match(regex);
    log(`Match: ${match}`, currentConfig);
    if (match !== null) {
        return match[0];
    } else {
        return null;
    }
}

/**
 * Parses a Spotify song URI from a given message.
 *
 * Uses a regular expression to search for a Spotify song URI pattern within
 * the input message string. If a match is found, it constructs a Spotify URL
 * using the extracted song ID and returns it. If no match is found, returns null.
 *
 * @param {string} message - The message containing the potential Spotify URI.
 * @returns {string|null} - The constructed Spotify song URL if a URI is found, otherwise null.
 */
function parseActualSongUriFromBigMessage(message, currentConfig) {
    log(`Parsing message: ${message}`, currentConfig);
    const regex = new RegExp(`${spotifyShareUriMaker}[^\\s]+`);
    log(`Regex: ${regex}`, currentConfig);
    let match = message.match(regex);
    log(`Match: ${match}`, currentConfig);
    if (match !== null) {
        spotifyIdToUrl = spotifyShareUrlMaker + match[0].split(':')[2];
        return spotifyIdToUrl;
    } else {
        return null;
    }
}

/**
 * Given a Spotify URL, returns the track ID from it if it is not blocked. Otherwise, returns false.
 *
 * @param {string} url - The Spotify URL
 * @returns {string|false} The track ID if it is not blocked, or false if it is
 */
function getTrackId(url) {
    let trackId = url.split('/').pop().split('?')[0];
    if (currentConfig.blocked_tracks.includes(trackId)) {
        return false;
    } else {
        return trackId;
    }
}

/**
 * Generates a random message from the given array and replaces placeholders with the given parameters.
 * Placeholders are in the format $(parameterName). If a parameter is not given, the placeholder will remain in the message.
 * @param {string[]} messages - An array of messages to choose from.
 * @param {object} params - An object with the parameters to replace in the message.
 * @returns {string} A random message with the replaced placeholders.
 */
function handleMessageQueries(messages, params) {
    let newMessage = messages[Math.floor(Math.random() * messages.length)];

    if (params.username) {
        newMessage = newMessage.replace('$(username)', params.username);
    }
    if (params.trackName) {
        newMessage = newMessage.replace('$(trackName)', params.trackName);
    }
    if (params.artists) {
        newMessage = newMessage.replace('$(artists)', params.artists);
    }

    return newMessage;
}

module.exports = {
    isUserEligible,
    parseActualSongUrlFromBigMessage,
    parseActualSongUriFromBigMessage,
    getTrackId,
    handleMessageQueries
};