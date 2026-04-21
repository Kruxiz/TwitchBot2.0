// eventHandlers.js
// Require the Commannd Handlers
const { handleSongRequest, validateSongRequest, addValidatedSongToQueue, addSongToQueue } = require('./commands/songRequests.js');
const { handleQueue, handleGetVolume, handleSetVolume, handleTrackName, handleVoteSkip, handleSkipSong, handleGetRecentlyPlayed } = require('./commands/player.js');
// ... import other handlers
const { isUserEligible } = require('./utils/utils.js');
const { log } = require('./utils/logger.js');


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

        // function to register single or multiple aliases
        function registerCommand(aliases, handler, handlers) {
            if (!aliases) return;
            if (!Array.isArray(aliases)) aliases = [aliases]; // ensure aliases is an array
            for (const alias of aliases) {
                handlers[alias] = handler;
            }
        }

        const commandHandlers = {};

        // 🎵 Song request (can be multiple aliases)
        registerCommand(currentConfig.command_alias, async () => {
            if (!args.length) {
                client.say(
                    channel,
                    `${tags['display-name']}, usage: !songrequest song-link (Spotify -> Share -> Copy Song Link)`
                );
            } else if (isUserEligible(channel, tags, currentConfig.command_user_level) &&
                currentConfig.usage_types.includes(commandUsageType)) {
                await handleSongRequest(
                    client,
                    channel,
                    tags['display-name'],
                    message,
                    tags,
                    spotifyAPI,
                    currentConfig
                );
            }
        }, commandHandlers);

        registerCommand("!volume", async () => {
            if (!args.length) {
                await handleGetVolume(client, channel, tags, currentConfig, spotifyAPI);
            } else {
                await handleSetVolume(client, channel, tags, args[0], currentConfig, spotifyAPI);
            }
        }, commandHandlers);

        registerCommand(currentConfig.skip_alias, async () => {
            await handleSkipSong(client, channel, tags, spotifyAPI, currentConfig);
        }, commandHandlers);

        registerCommand("!song", async () => {
            if (currentConfig.use_song_command) {
                await handleTrackName(client, channel, tags, spotifyAPI, currentConfig);
            }
        }, commandHandlers);


        registerCommand("!queue", async () => {
            if (currentConfig.use_queue_command) {
                await handleQueue(client, channel, tags, spotifyAPI, currentConfig);
            }
        }, commandHandlers);

        registerCommand("!voteskip", async () => {
            if (currentConfig.allow_vote_skip) {
                await handleVoteSkip(
                    client,
                    channel,
                    tags['display-name'],
                    spotifyAPI,
                    currentConfig
                );
            }
        }, commandHandlers);

        registerCommand("!clip", async () => {
            if (isUserEligible(channel, tags, currentConfig.clip_user_level)) {
                try {
                    const clipUrl = await twitchAPI.createClip();
                    client.say(channel, clipUrl || "There was a problem creating the clip");
                } catch (error) {
                    console.error(error);
                    client.say(channel, "There was a problem creating the clip");
                }
            }
        }, commandHandlers);


        registerCommand("!history", async () => {
            if (currentConfig.use_history_command) {
                try {
                    log(`History command invoked by ${tags['display-name']}`, currentConfig);
                    await handleGetRecentlyPlayed(client, channel, tags, spotifyAPI, currentConfig);
                } catch (error) {
                    console.error("Error handling history command:", error);
                    client.say(channel, "There was a problem retrieving the recently played songs.");
                }
            }
        }, commandHandlers);

        // Dispatcher
        const handler = commandHandlers[command];
        if (handler) {
            await handler();
        }
    });

    /*client.on('cheer', async (channel, state, message) => {
        // existing cheer logic
    });*/

    client.on('redeem', async (channel, username, rewardType, tags, message) => {
        log(`Reward ID: ${rewardType}`, currentConfig);
        if (currentConfig.usage_types.includes(channelPointsUsageType) &&
            rewardType === currentConfig.custom_reward_id) {
            let result = await handleSongRequest(
                client,
                channel,
                tags['display-name'],
                message,
                tags,
                spotifyAPI,
                currentConfig
            );

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
