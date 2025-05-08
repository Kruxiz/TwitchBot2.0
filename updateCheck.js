// updateChecker.js
const axios = require('axios');
const pack = require('./package.json');

function checkForUpdates() {
    axios.get("https://api.github.com/repos/Kruxiz/TwitchBot2.0/releases/latest")
        .then(r => {
            if (r.data.tag_name > pack.version) {
                console.log(`An update is available at ${r.data.html_url}`);
            }
        }, () => console.log("Failed to check for updates."));
}

module.exports = checkForUpdates;
