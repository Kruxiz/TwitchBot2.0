function log(message, currentConfig, level = 'log') {
    if (currentConfig?.logs) {
        if (console[level]) {
            console[level](message);
        } else {
            console.log(message);
        }
    }
}

module.exports = { log }; // Export the log function for use in other modules
// This function is used to log messages to the console. It checks if logging is enabled in the current configuration and prints the message if it is.