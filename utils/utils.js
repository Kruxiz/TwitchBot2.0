// Description: Utility functions for Twitch bot

const { log } = require('./logger.js');

const currentConfig = require('../config.js').currentConfig;

// Strict Spotify regex constants
const SPOTIFY_BASE_URL = 'https://open.spotify.com';
const SPOTIFY_TRACK_PATH = `${SPOTIFY_BASE_URL}/track/`;

// Matches only valid Spotify track URLs, not other sites
// Examples matched:
// - https://open.spotify.com/track/1abcDEF123
// - https://open.spotify.com/intl-en/track/1abcDEF123?si=xyz
// Rejects anything from other domains
// Spotify track URL — only valid if the entire string is a proper Spotify track link
const SPOTIFY_TRACK_URL_REGEX = /^(?:https?:\/\/)?open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{10,})(?:\?.*)?$/i;

// Spotify URI — only valid if the entire string is exactly a Spotify track URI
const SPOTIFY_URI_REGEX = /^spotify:track:([A-Za-z0-9]{10,})$/i;

/**
 * Checks if a user is eligible for a command based on their roles.
 *
 * @param {string} channel - The channel where the command was invoked.
 * @param {object} tags - The tags object containing user information.
 * @param {string[]} rolesArray - An array of roles to check against.
 * @returns {boolean} True if the user is eligible for the command, false otherwise.
 */
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
 * Attempts to parse a Spotify track URL from a message string.
 *
 * @param {string} message - The message string to parse.
 * @returns {string|null} The parsed Spotify track URL if successful, null otherwise.
 */
function parseActualSongUrlFromBigMessage(message) {
    if (typeof message !== 'string') return null;
    const match = message.trim().match(SPOTIFY_TRACK_URL_REGEX);
    if (!match) return null;
    const trackId = match[1];
    return `${SPOTIFY_TRACK_PATH}${trackId}`;
}

/**
 * Attempts to parse a Spotify track URI from a message string.
 *
 * @param {string} message - The message string to parse.
 * @returns {string|null} The parsed Spotify track URI if successful, null otherwise.
 */
function parseActualSongUriFromBigMessage(message) {
    if (typeof message !== 'string') return null;
    const match = message.trim().match(SPOTIFY_URI_REGEX);
    if (!match) return null;
    const trackId = match[1];
    return `${SPOTIFY_TRACK_PATH}${trackId}`;
}

/**
 * Attempts to parse a song input message into a usable form.
 *
 * Checks for Spotify track URLs and URIs in the message, and if found, returns
 * an object with the type set to 'url' and the value set to the extracted URL.
 * If no URL or URI is found, assumes the message is a search term and returns
 * an object with the type set to 'search' and the value set to the cleaned search term.
 *
 * @param {string} message - The message to parse.
 * @returns {Object|null} - An object containing the parsed song input, or null if no input is found.
 */
function parseSongInput(message) {
    const url = parseActualSongUrlFromBigMessage(message);
    if (url) return { type: 'url', value: url };

    const uri = parseActualSongUriFromBigMessage(message);
    if (uri) return { type: 'url', value: uri };

    // Fallback: assume it's a search term
    const cleaned = message.trim();
    if (cleaned.length > 0) {
        return { type: 'search', value: cleaned };
    }

    return null;
}

/**
 * Given a Spotify URL, returns the track ID from it if it is not blocked. Otherwise, returns false.
 *
 * @param {string} url - The Spotify URL
 * @returns {string|false} The track ID if it is not blocked, or false if it is
 */
function getTrackId(url, currentConfig) {
    if (typeof url !== 'string') return false;
    const match = url.trim().match(SPOTIFY_TRACK_URL_REGEX);
    if (!match) return false;
    const trackId = match[1];
    return currentConfig.blocked_tracks.includes(trackId) ? false : trackId;
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