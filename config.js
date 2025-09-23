// config.js - Smart environment detection for NUA STUDIO
(function() {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isRender = hostname.includes('.onrender.com');
    const isElectron = typeof process !== 'undefined' &&
                       process.versions && process.versions.electron;
    const isGithubPages = hostname.endsWith('.github.io');
    const isNuastudioDomain =
        hostname === 'nuastudio.kr' ||
        hostname === 'www.nuastudio.kr' ||
        hostname === 'nuastudio.co.kr' ||
        hostname === 'www.nuastudio.co.kr';

    const RENDER_API = 'https://nua-studio.onrender.com';

    let SOCKET_URL;

    if (isElectron) {
        const customServer = localStorage.getItem('customSocketServer');
        SOCKET_URL = customServer || RENDER_API;
        console.log('[Config] Electron ->', SOCKET_URL);
    } else if (isRender) {
        SOCKET_URL = window.location.origin;
        console.log('[Config] Front on Render ->', SOCKET_URL);
    } else if (isLocalhost) {
        SOCKET_URL = RENDER_API;
        console.log('[Config] Localhost ->', SOCKET_URL);
    } else if (isGithubPages || isNuastudioDomain) {
        SOCKET_URL = RENDER_API;
        console.log('[Config] Static hosting ->', SOCKET_URL);
    } else {
        SOCKET_URL = RENDER_API;
        console.log('[Config] Fallback ->', SOCKET_URL);
    }

    window.CONFIG = {
        SOCKET_URL,
        isDevelopment: isLocalhost && !isElectron,
        environment: {
            isLocalhost,
            isElectron,
            isRender,
            isGithubPages,
            isNuastudioDomain,
            hostname: hostname,
            protocol: window.location.protocol,
            origin: window.location.origin
        },
        socketOptions: {
            transports: ['websocket','polling'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
        }
    };

    console.log('=== NUA STUDIO CONFIG ===');
    console.log('Socket URL:', SOCKET_URL);
    console.log('Environment:', window.CONFIG.environment);
    console.log('========================');
})();
