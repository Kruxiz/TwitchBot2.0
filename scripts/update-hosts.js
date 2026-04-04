// scripts/update-hosts.js
// Helper script to add spottybotty.local to hosts file
//
// IMPORTANT: Run this as Administrator!
// Right-click on Command Prompt/PowerShell and select "Run as Administrator",
// then run: node scripts/update-hosts.js

const fs = require('fs');
const path = require('path');

const HOSTS_FILE = 'C:\\Windows\\System32\\drivers\\etc\\hosts';
const HOSTNAME = 'spottybotty.local';
const IP = '127.0.0.1';

/**
 * Checks if running with administrator privileges on Windows
 */
function isRunningAsAdmin() {
  try {
    // Try to open a protected system file
    fs.accessSync(HOSTS_FILE, fs.constants.W_OK);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Checks if hostname is already in hosts file
 */
function isHostConfigured() {
  try {
    const content = fs.readFileSync(HOSTS_FILE, 'utf8');
    return content.includes(HOSTNAME);
  } catch (err) {
    return false;
  }
}

/**
 * Adds the hostname entry to hosts file
 */
function addHostEntry() {
  const entry = `\n${IP} ${HOSTNAME}\n`;

  try {
    fs.appendFileSync(HOSTS_FILE, entry, { encoding: 'utf8' });
    console.log(`✅ Added ${IP} ${HOSTNAME} to hosts file`);
    console.log('');
    console.log('You may need to flush your DNS cache:');
    console.log('  ipconfig /flushdns');
    console.log('');
    console.log('Then try accessing http://spottybotty.local:8888');
    return true;
  } catch (err) {
    console.error('❌ Failed to update hosts file:', err.message);
    console.log('');
    console.log('Please make sure you:');
    console.log('1. Are running this script as Administrator');
    console.log('2. Have permission to edit:', HOSTS_FILE);
    return false;
  }
}

/**
 * Removes the hostname entry from hosts file
 */
function removeHostEntry() {
  try {
    const content = fs.readFileSync(HOSTS_FILE, 'utf8');
    const lines = content.split('\n');
    const filteredLines = lines.filter(line => !line.includes(HOSTNAME));

    if (lines.length === filteredLines.length) {
      console.log(`ℹ️  ${HOSTNAME} not found in hosts file`);
      return true;
    }

    fs.writeFileSync(HOSTS_FILE, filteredLines.join('\n'), { encoding: 'utf8' });
    console.log(`✅ Removed ${HOSTNAME} from hosts file`);
    console.log('');
    console.log('Run "ipconfig /flushdns" to clear DNS cache');
    return true;
  } catch (err) {
    console.error('❌ Failed to remove from hosts file:', err.message);
    console.log('');
    console.log('Please make sure you are running as Administrator');
    return false;
  }
}

// Main execution
console.log('Spotty Botty Hosts File Manager');
console.log('==================================\n');

// Check if running as admin
if (!isRunningAsAdmin()) {
  console.error('❌ This script must be run as Administrator!');
  console.log('');
  console.log('How to run as Administrator:');
  console.log('1. Right-click on Command Prompt or PowerShell');
  console.log('2. Select "Run as administrator"');
  console.log('3. Navigate to this directory');
  console.log('4. Run: node scripts\\update-hosts.js');
  console.log('');
  process.exit(1);
}

// Check if hostname is already configured
const isConfigured = isHostConfigured();

if (process.argv.includes('--remove')) {
  console.log(`Removing ${HOSTNAME} from hosts file...\n`);
  removeHostEntry();
} else if (process.argv.includes('--check')) {
  if (isConfigured) {
    console.log(`✅ ${HOSTNAME} is already configured in hosts file`);
  } else {
    console.log(`ℹ️  ${HOSTNAME} is NOT configured in hosts file`);
    console.log('');
    console.log('To add it, run: node scripts\\update-hosts.js');
  }
} else {
  console.log(`Adding ${IP} ${HOSTNAME} to hosts file...\n`);

  if (isConfigured) {
    console.log(`ℹ️  ${HOSTNAME} is already in the hosts file.`);
    console.log('No changes were made.');
  } else {
    addHostEntry();
  }
}

console.log('\n==================================');
console.log('Operation complete');
