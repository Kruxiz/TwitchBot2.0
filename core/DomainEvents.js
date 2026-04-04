// core/DomainEvents.js
// Event constants for the event-driven architecture

const DomainEvents = {
  // Twitch Events
  Twitch: {
    // Chat Events
    MessageReceived: 'twitch.message.received',
    ChatConnected: 'twitch.chat.connected',
    ChatDisconnected: 'twitch.chat.disconnected',

    // User Interaction Events
    RewardRedeemed: 'twitch.reward.redeemed',
    UserSubscribed: 'twitch.user.subscribed',
    UserResubscribed: 'twitch.user.resubscribed',
    UserCheered: 'twitch.user.cheered',

    // Channel Events
    ChannelHosted: 'twitch.channel.hosted',
    ChannelRaided: 'twitch.channel.raided',

    // Moderation Events
    UserBanned: 'twitch.user.banned',
    UserTimedOut: 'twitch.user.timedout'
  },

  // Spotify Events
  Spotify: {
    // Playback Events
    TrackStarted: 'spotify.track.started',
    TrackEnded: 'spotify.track.ended',
    PlaybackPaused: 'spotify.playback.paused',
    PlaybackResumed: 'spotify.playback.resumed',
    TrackSkipped: 'spotify.track.skipped',

    // Queue Events
    TrackQueued: 'spotify.track.queued',
    QueueChanged: 'spotify.queue.changed',
    TrackRemoved: 'spotify.track.removed',
    QueueCleared: 'spotify.queue.cleared',

    // Player Control Events
    VolumeChanged: 'spotify.volume.changed',
    RepeatChanged: 'spotify.repeat.changed',
    ShuffleChanged: 'spotify.shuffle.changed',

    // Authentication Events
    AuthenticationRequired: 'spotify.auth.required',
    AuthenticationSuccess: 'spotify.auth.success',
    AuthenticationFailed: 'spotify.auth.failed'
  },

  // Command Events
  Command: {
    CommandExecuted: 'command.executed',
    CommandFailed: 'command.failed',
    CooldownTriggered: 'command.cooldown.triggered',
    RateLimitExceeded: 'command.ratelimit.exceeded'
  },

  // System Events
  System: {
    // Application Lifecycle
    ApplicationStarted: 'system.application.started',
    ApplicationStopped: 'system.application.stopped',
    ShutdownRequested: 'system.shutdown.requested',

    // Configuration
    ConfigUpdated: 'system.config.updated',
    ConfigInvalid: 'system.config.invalid',

    // Errors and Recovery
    ServiceError: 'system.service.error',
    ServiceReady: 'system.service.ready',
    RecoveryAttempt: 'system.recovery.attempt',
    RecoveryFailed: 'system.recovery.failed',
    RecoverySuccess: 'system.recovery.success'
  },

  // Overlay/Web Dashboard Events
  Overlay: {
    NowPlayingUpdated: 'overlay.nowplaying.updated',
    QueueUpdated: 'overlay.queue.updated',
    StatsUpdated: 'overlay.stats.updated'
  }
};

module.exports = DomainEvents;
