// eventHandlers.js
//const { handleGetVolume} = require('./commands/volume.js').handleGetVolume;
//const { handleSetVolume } = require('./commands/volume.js').handleSetVolume;
const {handleGetVolume, handleSetVolume} = require('./commands/volume.js');
const { handleSongRequest, validateSongRequest, addValidatedSongToQueue, addSongToQueue } = require('./commands/handleSongRequest.js');
//const currentConfig = require('./config.js').currentConfig;
// ... import other handlers
const { isUserEligible } = require('./utils.js');
const { log } = require('./logger.js');


const channelPointsUsageType = 'channel_points';
const commandUsageType = 'command';
const bitsUsageType = 'bits';
const displayNameTag = 'display-name';
/**
 * Registers event handlers for the Twitch client.
 *
 * This function registers event handlers for the Twitch client to handle incoming messages, cheers, and redeems.
 *
 * @param {object} client - The Twitch client instance.
 * @param {object} twitchAPI - The Twitch API instance.
 * @param {object} currentConfig - The current configuration object.
 */
function registerEventHandlers(client, twitchAPI, spotifyAPI, currentConfig) {
    client.on('message', async (channel, tags, message, self) => {
        if (self) return;
        let messageToLower = message.toLowerCase();
 
        if (currentConfig.usage_types.includes(commandUsageType)
            && currentConfig.command_alias.includes(messageToLower.split(" ")[0])
            && isUserEligible(channel, tags, currentConfig.command_user_level)) {
            let args = messageToLower.split(" ")[1];
            if (!args) {
                client.say(currentConfig.channel_name, `${tags[displayNameTag]}, usage: !songrequest song-link (Spotify -> Share -> Copy Song Link)`);
            } else {
                await handleSongRequest(client, channel, tags[displayNameTag], message, tags, twitchAPI, spotifyAPI, currentConfig);
            }
        } else if (currentConfig.allow_volume_set && messageToLower.split(" ")[0] == '!volume') {
            let args = messageToLower.split(" ")[1];
            if (!args) {
                await handleGetVolume(client, channel, tags, currentConfig, spotifyAPI);
            } else {
                await handleSetVolume(client, channel, tags, args, currentConfig, spotifyAPI);
            }
        }
        else if (messageToLower === currentConfig.skip_alias) {
            await handleSkipSong(client, channel, tags);
        }
        else if (currentConfig.use_song_command && messageToLower === '!song') {
            await handleTrackName(client, channel);
        }
        else if (currentConfig.use_queue_command && messageToLower === '!queue') {
            await handleQueue(client, channel);
        }
        else if (currentConfig.allow_vote_skip && messageToLower === '!voteskip') {
            await handleVoteSkip(client, channel, tags[displayNameTag]);
        }
        else if (messageToLower === '!clip') {
            try{
                let eligible = isUserEligible(channel, tags, currentConfig.clip_user_level);
                if (eligible) {
                    let clipUrl = await twitchAPI.createClip();
                    if (clipUrl !== null) {
                        client.say(channel, clipUrl);
                    }
                    else {
                        client.say(channel, `There was a problem creating the clip`);
                        return null;
                    }
                    return clipUrl;
                }
            } catch (error) {
                console.log(error);
                client.say(channel, `There was a problem creating the clip`);
                return null;
            }
        }
    });

    client.on('cheer', async (channel, state, message) => {
        // existing cheer logic
    });

    client.on('redeem', async (channel, username, rewardType, tags, message) => {
        log(`Reward ID: ${rewardType}`, currentConfig);
        if (currentConfig.usage_types.includes(channelPointsUsageType) && rewardType === currentConfig.custom_reward_id) {
            let result = await handleSongRequest(client, channel, tags[displayNameTag], message, tags, twitchAPI, spotifyAPI, currentConfig);
            if (!result) {
                if (await twitchAPI.refundPoints()) {
                    log(`${username} redeemed a song request that couldn't be completed. It was refunded automatically.`, currentConfig);
                } else {
                    log(`${username} redeemed a song request that couldn't be completed. It could not be refunded automatically.`, currentConfig);
                }
            }
            if (result) {
                if (await twitchAPI.fulfillRedemption()) {
                    log(`${username} Redemption fulfilled successfully for reward ID ${rewardType}`, currentConfig);
                } else {
                    log(`${username} Redemption Failed to fulfill successfully for reward ID ${rewardType}`, currentConfig);
                }
            }
        }
    });
}

module.exports = registerEventHandlers;
