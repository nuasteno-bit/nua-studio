// config.js - Smart environment detection for NUA STUDIO
(function() {
    // Detect current environment
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isRender = hostname.includes('.onrender.com');
    const isElectron = typeof process !== 'undefined' && 
                      process.versions && 
                      process.versions.electron;
    
    // Configure socket URL based on environment
    let SOCKET_URL;
    
    if (isElectron) {
        // Electron app - check for custom server first
        const customServer = localStorage.getItem('customSocketServer');
        
        if (customServer) {
            SOCKET_URL = customServer;
            console.log('[Config] Using custom server:', customServer);
        } else {
            // Default to production server
            SOCKET_URL = 'https://nua-studio.onrender.com';  // UPDATE THIS after deployment
            console.log('[Config] Using production server');
        }
        
    } else if (isRender) {
        // Running on Render.com - use same origin
        SOCKET_URL = window.location.origin;
        console.log('[Config] Render.com deployment detected');
        
    } else if (isLocalhost) {
        // Local development - connect to local server
        SOCKET_URL = window.location.origin;
        console.log('[Config] Local development mode');
        
    } else {
        // Other environments - use current origin
        SOCKET_URL = window.location.origin;
        console.log('[Config] Using current origin:', SOCKET_URL);
    }
    
    // Global configuration object
    window.CONFIG = {
        SOCKET_URL: SOCKET_URL,
        
        // Development mode flag
        isDevelopment: isLocalhost && !isElectron,
        
        // Environment info
        environment: {
            isLocalhost: isLocalhost,
            isElectron: isElectron,
            isRender: isRender,
            hostname: hostname,
            protocol: window.location.protocol,
            origin: window.location.origin
        },
        
        // Socket.IO options
        socketOptions: {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
        }
    };
    
    // Debug output
    console.log('=== NUA STUDIO CONFIG ===');
    console.log('Socket URL:', SOCKET_URL);
    console.log('Environment:', window.CONFIG.environment);
    console.log('========================');
})();