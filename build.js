const isWin = process.platform === 'win32';
const zipCommand = isWin ? '7z a -tzip' : 'zip -r';

const fs = require('fs-extra');
const execSync = require('child_process').execSync;

const distDir = 'dist';
const filesToCopy = [   'index.js', 
                        'config.js',
                        'eventHandlers.js',
                        'updatecheck.js',
                        'package.json', 
                        'run.bat' ];

try {
    let version = fs.readJsonSync('package.json').version;
    fs.emptyDirSync(distDir);
    fs.copySync('node', `${distDir}/node`);
    fs.copySync('node_modules', `${distDir}/node_modules`);
    fs.copySync('referenceConfig/spotipack_config.yaml', `${distDir}/spotipack_config.yaml`);
    fs.copySync('templates', `${distDir}/templates`);
    fs.copySync('utils', `${distDir}/utils`);
    fs.copySync('controllers', `${distDir}/controllers`);
    fs.copySync('commands', `${distDir}/commands`);
    filesToCopy.map(copyFile);
    execSync(`${zipCommand} ${version}.zip dist`);
} catch (err) {
    console.error(err);
}

function copyFile(file) {
    fs.copySync(file, `${distDir}/${file}`);
}