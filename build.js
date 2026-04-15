const isWin = process.platform === 'win32';
const zipCommand = isWin ? '7z a -tzip' : 'zip -r';

const fs = require('fs-extra');
const execSync = require('child_process').execSync;

const distDir = 'dist';
const filesToCopy = [
  'index.js',
  'config.js',
  'eventHandlers.js',
  'spotipack_config.yaml',
  'package.json',
  'run.bat',
  'AUTOSTART-SETUP.bat',
  'CREATE-STARTUP-SHORTCUT.bat'
];

const dirsToCopy = [
  'node',
  'node_modules',
  'referenceConfig',
  'templates',
  'utils',
  'controllers',
  'commands',
  'core',
  'routes',
  'services',
  'middleware',
  'errors',
  'scripts',
  'public'
];

try {
  let version = '1.0.0';
  try {
    version = fs.readJsonSync('package.json').version;
  } catch (err) {
    console.warn('Could not read package.json version, using 1.0.0');
  }

  fs.emptyDirSync(distDir);

  // Copy directories
  dirsToCopy.forEach(dir => {
    if (fs.existsSync(dir)) {
      fs.copySync(dir, `${distDir}/${dir}`);
      console.log(`✓ Copied ${dir}/`);
    } else {
      console.warn(`⚠ Directory not found: ${dir}`);
    }
  });

  // Copy individual files
  filesToCopy.forEach(copyFile);

  console.log(`Creating ${version}.zip...`);
  execSync(`${zipCommand} ${version}.zip ${distDir}`);
  console.log(`✅ Build complete: ${version}.zip`);

} catch (err) {
  console.error('❌ Build failed:', err);
  process.exit(1);
}

function copyFile(file) {
  if (fs.existsSync(file)) {
    fs.copySync(file, `${distDir}/${file}`);
    console.log(`✓ Copied ${file}`);
  } else {
    console.warn(`⚠ File not found: ${file}`);
  }
}
