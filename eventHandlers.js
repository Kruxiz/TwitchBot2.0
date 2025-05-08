// eventHandlers.js
// Require the Commannd Handlers
const { handleSongRequest, validateSongRequest, addValidatedSongToQueue, addSongToQueue } = require('./commands/songRequests.js');
const { handleQueue, handleGetVolume, handleSetVolume, handleTrackName, handleVoteSkip} = require('./commands/player.js');
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
    
        const messageToLower = message.toLowerCase();
        const command = messageToLower.split(" ")[0];
        const args = messageToLower.split(" ").slice(1);
    
        if (currentConfig.usage_types.includes(commandUsageType)
            && currentConfig.command_alias.includes(command)
            && isUserEligible(channel, tags, currentConfig.command_user_level)) {
            
            if (!args.length) {
                client.say(currentConfig.channel_name, `${tags[displayNameTag]}, usage: !songrequest song-link (Spotify -> Share -> Copy Song Link)`);
            } else {
                await handleSongRequest(client, channel, tags[displayNameTag], message, tags, twitchAPI, spotifyAPI, currentConfig);
            }
    
            return; // stop here if handled
        }
    
        const commandHandlers = {
            '!volume': async () => {
                if (!args.length) {
                    await handleGetVolume(client, channel, tags, currentConfig, spotifyAPI);
                } else {
                    await handleSetVolume(client, channel, tags, args[0], currentConfig, spotifyAPI);
                }
            },
            [currentConfig.skip_alias]: async () => {
                await handleSkipSong(client, channel, tags, spotifyAPI, currentConfig);
            },
            '!song': async () => {
                if (currentConfig.use_song_command) {
                    await handleTrackName(client, channel, spotifyAPI);
                }
            },
            '!queue': async () => {
                if (currentConfig.use_queue_command) {
                    await handleQueue(client, channel, spotifyAPI, currentConfig);
                }
            },
            '!voteskip': async () => {
                if (currentConfig.allow_vote_skip) {
                    await handleVoteSkip(client, channel, tags[displayNameTag], spotifyAPI, currentConfig);
                }
            },
            '!clip': async () => {
                if (isUserEligible(channel, tags, currentConfig.clip_user_level)) {
                    try {
                        const clipUrl = await twitchAPI.createClip();
                        if (clipUrl) {
                            client.say(channel, clipUrl);
                        } else {
                            client.say(channel, 'There was a problem creating the clip');
                        }
                    } catch (error) {
                        console.error(error);
                        client.say(channel, 'There was a problem creating the clip');
                    }
                }
            }
        };
    
        const handler = commandHandlers[command];
        if (handler) {
            await handler();
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
