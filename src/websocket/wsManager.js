const WebSocket = require('ws');

let wss;

// Job State Management
const jobState = {
    isRunning: false,
    type: null, // 'backup' or 'restore'
    details: null,
    logs: [],
    startTime: null,
    command: null
};

const MAX_LOG_HISTORY = 100;

function init(server) {
    wss = new WebSocket.Server({ server });

    wss.on('connection', (ws) => {
        console.log('WebSocket client connected');

        // Send current state to new client immediately
        if (jobState.isRunning || jobState.logs.length > 0) {
            ws.send(JSON.stringify({
                type: 'sync_state',
                state: jobState
            }));
        }

        ws.on('close', () => {
            console.log('WebSocket client disconnected');
        });
    });

    console.log('WebSocket server initialized');
    return wss;
}

// Broadcast progress to all WebSocket clients
function broadcastProgress(data) {
    if (!wss) {
        console.warn('WebSocket server not initialized, cannot broadcast');
        return;
    }

    // Update global state
    if (data.type.endsWith('_started')) {
        jobState.isRunning = true;
        jobState.type = data.type.includes('backup') ? 'backup' : 'restore';
        jobState.startTime = new Date();
        jobState.logs = [];
        jobState.details = data;
    } else if (data.type.endsWith('_completed') || data.type.endsWith('_failed')) {
        jobState.isRunning = false;
        // We keep the logs and type for a bit so the user sees the result
    } else if (data.type === 'progress' || data.type === 'backup_progress' || data.type === 'restore_progress') {
        if (data.message) {
            jobState.logs.push(data.message);
            if (jobState.logs.length > MAX_LOG_HISTORY) {
                jobState.logs.shift(); // Keep buffer size managed
            }
        }
    } else if (data.type === 'backup_command') {
        jobState.command = data.command;
    }

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

function getJobState() {
    return jobState;
}

module.exports = {
    init,
    broadcastProgress,
    getJobState
};
