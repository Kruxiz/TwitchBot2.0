// utils/formatters.js
function formatQueue(tracks, depth) {
    if (!tracks.length) return 'Nothing in the queue.';
    tracks = tracks.slice(0, depth).map((qItem, i) => ({
      name: qItem.name,
      artists: qItem.artists.map(a => a.name),
      index: i + 1
    }))
    return `▶️ Next ${tracks.length} songs: ` + 
           tracks.map(t => `• ${t.index}) ${t.artists.join(', ')} - ${t.name}`).join(' ');
  }
  
  function formatTrack(track) {
    if (!track) return 'Seems like no music is playing right now';
    track = track.data.item || track; // Handle both direct and wrapped track objects
    return `▶️ ${track.artists.map(a => a.name).join(', ')} - ${track.name} -> ${track.external_urls.spotify}`;
  }

  function formatHistory(history, depth) {
    if (!history.length) return 'No recently played songs.';
    history = history.slice(0, depth).map((qItem, i) => ({
      name: qItem.track.name,
      artists: qItem.track.artists.map(a => a.name),
      index: i + 1
    }))
    return `▶️ Last ${history.length} songs: ` + 
    history.map(h => `• ${h.index}) ${h.artists.join(', ')} - ${h.name}`).join(' ');
  }

  function formatSkipTrack(track) {
    if (!track) return 'No track to skip.';
    track = track.data.item || track; // Handle both direct and wrapped track objects
    return `▶️ Skipping ${track.artists.map(a => a.name).join(', ')} - ${track.name} -> ${track.external_urls.spotify}`;
  }
  
  function formatVoteSkipTrack(track) {
    if (!track) return 'No track to skip.';
    track = track.data.item || track; // Handle both direct and wrapped track objects
    return `Chat has skipped ${track.artists.map(a => a.name).join(', ')} - ${track.name} -> ${track.external_urls.spotify}`;
  }

module.exports = { formatQueue, formatTrack, formatHistory, formatSkipTrack, formatVoteSkipTrack };