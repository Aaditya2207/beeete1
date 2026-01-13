type LogLevel = 'INFO' | 'WARN' | 'ERROR';

/**
 * Console-based Logger Module.
 */
const logger = {
    /**
     * Internal writer
     */
    _write: (level: LogLevel, type: string, data: any) => {
        // Output to console directly
        if (level === 'ERROR') {
            console.error(`[${level}] ${type}:`, data);
        } else if (level === 'WARN') {
            console.warn(`[${level}] ${type}:`, data);
        } else {
            console.log(`[${level}] ${type}:`, data);
        }
    },

    info: (type: string, data: any) => logger._write('INFO', type, data),
    warn: (type: string, data: any) => logger._write('WARN', type, data),
    error: (type: string, data: any) => logger._write('ERROR', type, data)
};

export default logger;
