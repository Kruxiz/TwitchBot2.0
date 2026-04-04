const fs = require('fs');
const path = require('path');

const SECRETS_FILE = path.join(process.cwd(), 'secrets.json');

function loadSecrets() {
    if (!fs.existsSync(SECRETS_FILE)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8'));
}

function saveSecrets(secrets) {
    fs.writeFileSync(SECRETS_FILE, JSON.stringify(secrets, null, 2), 'utf8');
}

function secretsAreValid(secrets) {
    return (
        secrets?.twitch?.clientId &&
        secrets?.twitch?.clientSecret &&
        secrets?.spotify?.clientId &&
        secrets?.spotify?.clientSecret
    );
}

module.exports = {
    loadSecrets,
    saveSecrets,
    secretsAreValid
};
