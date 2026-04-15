const fs = require('fs-extra');
const archiver = require('archiver');

const distDir = 'dist';
const filesToCopy = [
  'index.js',
  'config.js',
  'package.json',
  'run.bat'
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
  'scripts'
];

async function build() {
  try {
    let version = '1.0.0';
    try {
      version = fs.readJsonSync('package.json').version;
    } catch (err) {
      console.warn('Could not read package.json version, using 1.0.0');
    }

    console.log(`Building Spotty Botty v${version}...`);

    // Clean dist directory
    fs.emptyDirSync(distDir);
    console.log(`✓ Cleaned ${distDir}/`);

    // Copy directories
    for (const dir of dirsToCopy) {
      if (fs.existsSync(dir)) {
        fs.copySync(dir, `${distDir}/${dir}`);
        console.log(`✓ Copied ${dir}/`);
      } else {
        console.warn(`⚠ Directory not found: ${dir}`);
      }
    }

    // Copy individual files
    for (const file of filesToCopy) {
      if (fs.existsSync(file)) {
        fs.copySync(file, `${distDir}/${file}`);
        console.log(`✓ Copied ${file}`);
      } else {
        console.warn(`⚠ File not found: ${file}`);
      }
    }

    console.log(`\nCreating ${version}.zip...`);

    // Check if archiver is available
    try {
      require('archiver');
    } catch (e) {
      console.error('❌ archiver not installed! Run: npm install archiver');
      process.exit(1);
    }

    // Create write stream
    const output = fs.createWriteStream(`${version}.zip`);
    const archive = archiver('zip', { zlib: { level: 9 } });

    // Listen for archive completion
    await new Promise((resolve, reject) => {
      output.on('close', () => {
        const bytes = archive.pointer();
        console.log(`✅ Build complete: ${version}.zip (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
        resolve();
      });

      archive.on('error', (err) => {
        console.error('❌ Archive error:', err);
        reject(err);
      });

      archive.pipe(output);
      archive.directory(distDir, false);
      archive.finalize();
    });

  } catch (err) {
    console.error('❌ Build failed:', err);
    process.exit(1);
  }
}

// Run build
build().catch(console.error);
