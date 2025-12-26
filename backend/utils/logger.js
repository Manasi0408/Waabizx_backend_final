const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Log file path
const logFile = path.join(logsDir, 'app.log');
const errorLogFile = path.join(logsDir, 'error.log');

// Helper function to format timestamp
const getTimestamp = () => {
  return new Date().toISOString();
};

// Helper function to write to file
const writeToFile = (filePath, message) => {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Write to file
    fs.appendFileSync(filePath, message + '\n', 'utf8');
  } catch (error) {
    // Always show error in console if file write fails
    console.error('Failed to write to log file:', error.message);
    console.error('File path:', filePath);
  }
};

// Logger object
const logger = {
  // General log
  log: (message, data = null) => {
    const timestamp = getTimestamp();
    const logMessage = `[${timestamp}] ${message}`;
    
    // Console output
    console.log(logMessage);
    if (data) {
      console.log('Data:', data);
    }
    
    // File output
    writeToFile(logFile, logMessage);
    if (data) {
      writeToFile(logFile, `Data: ${JSON.stringify(data, null, 2)}`);
    }
  },

  // Error log
  error: (message, error = null) => {
    const timestamp = getTimestamp();
    const errorMessage = `[${timestamp}] ERROR: ${message}`;
    
    // Console output
    console.error(errorMessage);
    if (error) {
      console.error('Error details:', error);
    }
    
    // File output
    writeToFile(errorLogFile, errorMessage);
    if (error) {
      writeToFile(errorLogFile, `Error details: ${error.stack || JSON.stringify(error, null, 2)}`);
    }
  },

  // Request body log (for debugging)
  requestBody: (req) => {
    try {
      const timestamp = getTimestamp();
      const message = `[${timestamp}] REQUEST BODY - ${req.method} ${req.path || req.url}`;
      const bodyData = JSON.stringify(req.body || {}, null, 2);
      
      // Console output (always show)
      console.log(message);
      console.log('BODY:', req.body || 'No body');
      
      // File output
      writeToFile(logFile, message);
      writeToFile(logFile, `BODY: ${bodyData}`);
    } catch (error) {
      console.error('Logger requestBody error:', error.message);
      console.log('BODY (fallback):', req.body);
    }
  }
};

module.exports = logger;

