const isWin = process.platform === 'win32';
const zipCommand = isWin ? '7z a -tzip' : 'zip -r';

const fs = require('fs-extra');
const execSync = require('child_process').execSync;

const distDir = 'dist';
const filesToCopy = [   'index.js', 
                        './controllers/twitchController.js',
                        './controllers/spotifyController.js',
                        './commands/player.js',
                        './commands/songRequests.js',
                        'config.js',
                        'eventHandlers.js',
                        'logger.js',
                        'utils.js',
                        'updatecheck.js',
                        'package.json', 
                        'run.bat' ];

try {
    let version = fs.readJsonSync('package.json').version;
    fs.emptyDirSync(distDir);
    fs.copySync('node', `${distDir}/node`);
    fs.copySync('node_modules', `${distDir}/node_modules`);
    fs.copySync('referenceConfig/spotipack_config.yaml', `${distDir}/spotipack_config.yaml`);
    filesToCopy.map(copyFile);
    execSync(`${zipCommand} ${version}.zip dist`);
} catch (err) {
    console.error(err);
}

function copyFile(file) {
    fs.copySync(file, `${distDir}/${file}`);
}