function log(message, currentConfig) {
    if (currentConfig.logs) {
        console.log(message);
    }
}

module.exports = { log }; // Export the log function for use in other modules
// This function is used to log messages to the console. It checks if logging is enabled in the current configuration and prints the message if it is.