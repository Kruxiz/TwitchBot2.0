const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * UpdateService
 * Handles checking for and applying code updates
 */
class UpdateService {
  constructor(config) {
    this.config = config || {};
    this.version = this.loadVersionFromPackage();
  }

  /**
   * Load version from package.json
   */
  loadVersionFromPackage() {
    try {
      const packagePath = path.join(process.cwd(), 'package.json');
      if (fs.existsSync(packagePath)) {
        const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        return packageData.version || '1.0.0';
      }
    } catch (error) {
      console.error('Failed to load version from package.json:', error.message);
    }
    return '1.0.0';
  }

  /**
   * Check for updates (returns update info)
   */
  async checkForUpdates() {
    try {
      // Use GitHub API to check for latest release
      // TODO: Replace with your actual GitHub repo URL or update endpoint
      const GITHUB_API_URL = 'https://api.github.com/repos/Kruxiz/TwitchBot2.0/releases/latest';

      console.log('Checking for updates...');
      const response = await axios.get(GITHUB_API_URL, {
        timeout: 10000,
        headers: {
          'User-Agent': 'SpottyBotty-Updater'
        }
      });

      const latestVersion = response.data.tag_name || response.data.name;
      const currentVersion = this.version;

      return {
        hasUpdate: latestVersion !== currentVersion,
        latestVersion: latestVersion,
        currentVersion: currentVersion,
        downloadUrl: response.data.zipball_url,
        releaseNotes: response.data.body || 'No release notes available'
      };
    } catch (error) {
      console.error('Update check failed:', error.message);
      return {
        hasUpdate: false,
        latestVersion: null,
        currentVersion: this.version,
        error: error.message + ' (Is GitHub accessible?)'
      };
    }
  }

  /**
   * Create a backup of current version
   */
  createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const backupDir = path.join(process.cwd(), 'backups', `backup-${timestamp}`);

    if (!fs.existsSync(path.dirname(backupDir))) {
      fs.mkdirSync(path.dirname(backupDir), { recursive: true });
    }

    // Copy core application files
    const dirsToBackup = ['core', 'services', 'routes', 'controllers', 'commands'];
    const filesToBackup = ['config.js', 'index.js', 'package.json'];

    for (const dir of dirsToBackup) {
      this.copyDir(dir, path.join(backupDir, dir));
    }

    for (const file of filesToBackup) {
      if (fs.existsSync(file)) {
        this.copyFile(file, path.join(backupDir, file));
      }
    }

    console.log(`Backup created: ${backupDir}`);
    return backupDir;
  }

  copyDir(src, dest) {
    if (!fs.existsSync(src)) return;

    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const items = fs.readdirSync(src);
    for (const item of items) {
      const srcPath = path.join(src, item);
      const destPath = path.join(dest, item);

      if (fs.lstatSync(srcPath).isDirectory()) {
        this.copyDir(srcPath, destPath);
      } else {
        this.copyFile(srcPath, destPath);
      }
    }
  }

  copyFile(src, dest) {
    if (!fs.existsSync(path.dirname(dest))) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

module.exports = UpdateService;
