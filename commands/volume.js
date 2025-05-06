const { isUserEligible } = require('../utils.js');
const currentConfig = require('../config.js').currentConfig;
const volMin = 0;
const volMax = 100;
const clamp = (num, volMin, volMax) => Math.min(Math.max(num, volMin), volMax);
const axios = require('axios');
const log = require('../logger.js');
const displayNameTag = 'display-name';
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

module.exports = {  handleGetVolume, handleSetVolume };