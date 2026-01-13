import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure logs directory exists
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, 'server.log');

/**
 * Appends a structured log entry to the log file.
 * @param {string} level - 'INFO', 'ERROR', 'WARN'
 * @param {string} type - 'REQUEST', 'RESPONSE', 'AI_RAW', 'SYSTEM'
 * @param {object} data - The data to log
 */
function log(level, type, data) {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        type,
        data
    };

    const logLine = JSON.stringify(entry) + '\n';

    fs.appendFile(logFile, logLine, (err) => {
        if (err) {
            console.error("Failed to write to log file:", err);
        }
    });
    
    // Also log to console for dev visibility
    if (level === 'ERROR') {
        console.error(`[${level}] ${type}:`, JSON.stringify(data, null, 2));
    } else {
        console.log(`[${level}] ${type}`);
    }
}

export default {
    info: (type, data) => log('INFO', type, data),
    error: (type, data) => log('ERROR', type, data),
    warn: (type, data) => log('WARN', type, data)
};
