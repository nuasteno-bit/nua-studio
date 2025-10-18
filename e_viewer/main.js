const { app, BrowserWindow, ipcMain, net, Menu, dialog, screen } = require('electron');
const path = require('path');

app.setName('NUA Subtitle Viewer');
app.setAppUserModelId('com.nua.subtitle.viewer');
if (process.platform === 'win32') {
  process.title = 'NUA Subtitle Viewer';
}

const gotTheLock = app.requestSingleInstanceLock();

let mainWindow = null;
let viewerWindow = null;
let optionWindow = null;
let quickMenuWindow = null;
let pendingDeepLink = null;

function handleDeepLink(url) {
  console.log('[DeepLink] Received:', url);
  
  if (!url || !url.startsWith('nuaviewer://')) {
    console.log('[DeepLink] Invalid URL format');
    return;
  }
  
  try {
    const urlObj = new URL(url);
    const action = urlObj.hostname;
    const params = new URLSearchParams(urlObj.search);
    const channel = params.get('channel');
    const token = params.get('token');
    
    console.log('[DeepLink] Parsed - Action:', action, 'Channel:', channel);
    
    if (channel && /^[A-Z0-9]{6}$/.test(channel)) {
      if (viewerWindow && !viewerWindow.isDestroyed()) {
        viewerWindow.show();
        viewerWindow.focus();
        viewerWindow.webContents.send('deep-link-join', { channel, token });
      } else if (!app.isReady()) {
        pendingDeepLink = { channel, token };
      } else {
        createViewerWindow(channel, token);
      }
    } else {
      console.log('[DeepLink] Invalid channel code format');
    }
  } catch (error) {
    console.error('[DeepLink] Parse error:', error);
  }
}

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('nuaviewer', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('nuaviewer');
}

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    console.log('[SecondInstance] Command line:', commandLine);
    
    const deepLinkUrl = commandLine.find(arg => arg.startsWith('nuaviewer://'));
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl);
    }
    
    if (viewerWindow && !viewerWindow.isDestroyed()) {
      if (viewerWindow.isMinimized()) viewerWindow.restore();
      viewerWindow.focus();
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });
}

function createLoginWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 560,
    frame: false,
    transparent: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    resizable: false,
    center: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('login-dialog.html');
  
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (!viewerWindow || viewerWindow.isDestroyed()) {
      app.quit();
    }
  });
}

function createViewerWindow(channel, token = null) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
    mainWindow = null;
  }
  
  viewerWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 400,
    minHeight: 80,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    skipTaskbar: false,
    alwaysOnTop: false,
    resizable: true,
    center: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: true
    }
  });

  console.log('[Main] Window created with clickable mode enabled');

  viewerWindow.channelCode = channel;
  viewerWindow.channelToken = token;

  viewerWindow.loadFile('electron-viewer.html');
  
  viewerWindow.once('ready-to-show', () => {
    viewerWindow.setTitle('NUA Subtitle Viewer');
    viewerWindow.show();
    
    // Windows ë ˆì´ì•„ì›ƒ ë²„ê·¸ ìˆ˜ì •: íƒœìŠ¤í¬ë°” ê¹œë¹¡ìž„ ë°©ì§€
    setTimeout(() => {
      viewerWindow.setTitle('');
      const [width, height] = viewerWindow.getSize();
      viewerWindow.setSize(width, height + 1);
      setTimeout(() => {
        viewerWindow.setSize(width, height);
      }, 50);
    }, 100);
  });
  
  viewerWindow.webContents.on('did-finish-load', () => {
    if (channel) {
      viewerWindow.webContents.send('deep-link-join', { channel, token });
    }
  });
  
  viewerWindow.on('closed', () => {
    if (quickMenuWindow && !quickMenuWindow.isDestroyed()) {
      quickMenuWindow.close();
    }
    viewerWindow = null;
    app.quit();
  });
  
  return viewerWindow;
}

function createQuickMenuWindow() {
  if (quickMenuWindow && !quickMenuWindow.isDestroyed()) {
    quickMenuWindow.show();
    quickMenuWindow.focus();
    return;
  }
  
  quickMenuWindow = new BrowserWindow({
    width: 480,
    height: 600,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  
  quickMenuWindow.loadFile('electron-quick-menu.html');
  
  quickMenuWindow.once('ready-to-show', () => {
    quickMenuWindow.show();
  });
  
  // í¬ì»¤ìŠ¤ ìžƒìœ¼ë©´ ìžë™ìœ¼ë¡œ ë‹«ê¸°
  quickMenuWindow.on('blur', () => {
    if (quickMenuWindow && !quickMenuWindow.isDestroyed()) {
      quickMenuWindow.close();
    }
  });
  
  quickMenuWindow.on('closed', () => {
    quickMenuWindow = null;
  });
}

ipcMain.on('open-quick-menu', () => {
  createQuickMenuWindow();
});

ipcMain.on('close-quick-menu', () => {
  console.log('[Main] Closing Quick Menu');
  if (quickMenuWindow && !quickMenuWindow.isDestroyed()) {
    quickMenuWindow.close();
  }
});

ipcMain.on('apply-quick-menu-settings', (event, settings) => {
  if (viewerWindow && !viewerWindow.isDestroyed()) {
    viewerWindow.webContents.send('update-settings', settings);
  }
});

ipcMain.on('quick-action', (event, action) => {
  if (viewerWindow && !viewerWindow.isDestroyed()) {
    viewerWindow.webContents.send('quick-action', action);
  }
});

ipcMain.on('request-current-settings', () => {
  if (viewerWindow && !viewerWindow.isDestroyed()) {
    viewerWindow.webContents.send('send-current-settings-to-menu');
  }
});

ipcMain.on('send-settings-to-menu', (event, settings) => {
  if (quickMenuWindow && !quickMenuWindow.isDestroyed()) {
    quickMenuWindow.webContents.send('load-settings', settings);
  }
});

ipcMain.handle('confirm-exit', async (event) => {
  console.log('[Main] Exit confirmation requested');
  
  if (quickMenuWindow && !quickMenuWindow.isDestroyed()) {
    quickMenuWindow.close();
  }
  
  const result = await dialog.showMessageBox(viewerWindow, {
    type: 'question',
    buttons: ['ì·¨ì†Œ', 'ì¢…ë£Œ'],
    defaultId: 0,
    cancelId: 0,
    title: 'ì•± ì¢…ë£Œ',
    message: 'ì•±ì„ ì¢…ë£Œí•˜ì‹œê² ìŠµë‹ˆê¹Œ?',
    noLink: true
  });
  
  console.log('[Main] User selected:', result.response === 1 ? 'ì¢…ë£Œ' : 'ì·¨ì†Œ');
  return result.response === 1;
});

// íˆ¬ëª… ëª¨ë“œ í† ê¸€ ì‹œì—ë„ í´ë¦­ ê°€ëŠ¥ ìœ ì§€
ipcMain.on('toggle-transparent-main', (event, isTransparent) => {
  if (!viewerWindow) return;
  
  // íˆ¬ëª… ëª¨ë“œì—ì„œë„ í´ë¦­ í™œì„±í™”
  viewerWindow.setIgnoreMouseEvents(false);
  console.log('[Main] Force clickable mode, transparent:', isTransparent);
  
  // Windows ë ˆì´ì•„ì›ƒ ê°•ì œ ê°±ì‹ 
  const [width, height] = viewerWindow.getSize();
  viewerWindow.setSize(width + 1, height + 1);
  setTimeout(() => {
    viewerWindow.setSize(width, height);
    // ë¦¬ì‚¬ì´ì¦ˆ í›„ì—ë„ ë‹¤ì‹œ ì„¤ì •
    viewerWindow.setIgnoreMouseEvents(false);
    console.log('[Main] Re-applied clickable after resize');
  }, 50);
});

ipcMain.on('show-context-menu', (event, { isTransparent, isScrollbarHidden, x, y }) => {
  const menu = Menu.buildFromTemplate([
    {
      label: viewerWindow.isFullScreen() ? 'ì „ì²´í™”ë©´ í•´ì œ' : 'ì „ì²´í™”ë©´',
      click: () => {
        viewerWindow.setFullScreen(!viewerWindow.isFullScreen());
      }
    },
    {
      label: 'íˆ¬ëª… ë°°ê²½',
      type: 'checkbox',
      checked: isTransparent,
      click: () => {
        event.sender.send('toggle-transparent');
      }
    },
    {
      label: 'ìŠ¤í¬ë¡¤ë°” ìˆ¨ê¸°ê¸°',
      type: 'checkbox',
      checked: isScrollbarHidden,
      click: () => {
        event.sender.send('toggle-scrollbar');
      }
    },
    { type: 'separator' },
    {
      label: 'í•­ìƒ ìœ„ì—',
      type: 'checkbox',
      checked: viewerWindow.isAlwaysOnTop(),
      click: () => {
        const newState = !viewerWindow.isAlwaysOnTop();
        viewerWindow.setAlwaysOnTop(newState);
        event.sender.send('always-on-top-changed', newState);
      }
    },
    { type: 'separator' },
    {
      label: 'ì°½ ìœ„ì¹˜ ì´ˆê¸°í™”',
      click: () => {
        viewerWindow.center();
        viewerWindow.setSize(800, 600);
      }
    },
    { type: 'separator' },
    {
      label: 'ë‹«ê¸°',
      click: () => {
        viewerWindow.close();
      }
    }
  ]);
  
  menu.popup({
    window: viewerWindow,
    x: x,
    y: y
  });
});

ipcMain.handle('connect-channel', async (event, { channel, passkey }) => {
  try {
    const serverUrl = 'https://live.nuastudio.co.kr';
    const apiUrl = `${serverUrl}/api/channel/${channel}/verify`;
    
    console.log('[Channel] Verifying:', channel);
    
    const request = net.request(apiUrl);
    request.setHeader('ngrok-skip-browser-warning', 'true');
    request.setHeader('User-Agent', 'NUA-Subtitle-Viewer/1.0');
    
    return new Promise((resolve) => {
      let responseData = '';
      
      request.on('response', (response) => {
        response.on('data', (chunk) => {
          responseData += chunk.toString();
        });
        
        response.on('end', () => {
          try {
            const data = JSON.parse(responseData);
            console.log('[Channel] Verification response:', data);
            
            if (response.statusCode === 200 && data.exists === true) {
              createViewerWindow(channel, passkey);
              resolve({ success: true });
            } else {
              resolve({ success: false, error: 'ì±„ë„ì„ ì°¾ì„ ìˆ˜ ì—†ìŠµë‹ˆë‹¤' });
            }
          } catch (parseError) {
            console.error('[Channel] Parse error:', parseError);
            resolve({ success: false, error: 'API ì‘ë‹µ ì²˜ë¦¬ ì˜¤ë¥˜' });
          }
        });
      });
      
      request.on('error', (error) => {
        console.error('[Channel] Connection error:', error);
        resolve({ success: false, error: 'ì„œë²„ ì—°ê²° ì‹¤íŒ¨' });
      });
      
      request.end();
    });
  } catch (error) {
    console.error('[Channel] Error:', error);
    return { success: false, error: 'ì—°ê²° ì˜¤ë¥˜' };
  }
});

ipcMain.on('toggle-always-on-top', (event) => {
  if (!viewerWindow) return;
  
  const newState = !viewerWindow.isAlwaysOnTop();
  viewerWindow.setAlwaysOnTop(newState);
  event.sender.send('always-on-top-changed', newState);
});

ipcMain.on('exit-fullscreen', () => {
  if (viewerWindow && viewerWindow.isFullScreen()) {
    viewerWindow.setFullScreen(false);
  }
});

ipcMain.on('exit-app', () => {
  app.quit();
});

ipcMain.on('open-options', (event, currentSettings) => {
  if (optionWindow) {
    optionWindow.focus();
    return;
  }
  
  optionWindow = new BrowserWindow({
    width: 520,
    height: 600,
    title: 'ìžë§‰ ë·°ì–´ ì„¤ì •',
    parent: viewerWindow,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  optionWindow.loadFile('electron-options.html');
  
  optionWindow.webContents.once('did-finish-load', () => {
    optionWindow.webContents.send('load-settings', currentSettings);
  });
  
  optionWindow.on('closed', () => {
    optionWindow = null;
  });
});

ipcMain.on('apply-settings', (event, settings) => {
  if (viewerWindow && !viewerWindow.isDestroyed()) {
    viewerWindow.webContents.send('update-settings', settings);
  }
});

ipcMain.handle('close-window', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

// Windows ë ˆì´ì•„ì›ƒ ê°•ì œ ê°±ì‹  í•¸ë“¤ëŸ¬
ipcMain.on('force-repaint', () => {
  if (!viewerWindow || viewerWindow.isDestroyed()) return;
  
  const [width, height] = viewerWindow.getSize();
  viewerWindow.setSize(width + 1, height + 1);
  setTimeout(() => {
    viewerWindow.setSize(width, height);
  }, 50);
});

// ðŸ†• ìžë™ ë§žì¶¤: ì°½ í¬ê¸° + ìœ„ì¹˜ ìžë™ ì¡°ì ˆ (ë©€í‹° ëª¨ë‹ˆí„° ì§€ì›, í•œ ë²ˆë§Œ ì‹¤í–‰)
ipcMain.handle('resize-window-auto', (event, width, height, position) => {
  if (!viewerWindow || viewerWindow.isDestroyed()) return false;
  
  try {
    // í˜„ìž¬ ì°½ì´ ìžˆëŠ” ëª¨ë‹ˆí„° ì°¾ê¸°
    const windowBounds = viewerWindow.getBounds();
    const displays = screen.getAllDisplays();
    const currentDisplay = screen.getDisplayNearestPoint({ 
      x: windowBounds.x + windowBounds.width / 2, 
      y: windowBounds.y + windowBounds.height / 2 
    });
    
    // workArea = ìž‘ì—… í‘œì‹œì¤„ì„ ì œì™¸í•œ ì‹¤ì œ ì‚¬ìš© ê°€ëŠ¥ ì˜ì—­
    const workArea = currentDisplay.workArea;
    
    console.log('[Main] Current display:', {
      id: currentDisplay.id,
      workArea: workArea
    });
    
    // í•´ë‹¹ ëª¨ë‹ˆí„°ì˜ ì „ì²´ ë„ˆë¹„ ì‚¬ìš©
    const newWidth = workArea.width;
    const newHeight = Math.max(80, Math.round(height));
    
    // ìœ„ì¹˜ ê³„ì‚°: í•´ë‹¹ ëª¨ë‹ˆí„°ì˜ ìƒë‹¨ or í•˜ë‹¨
    let x = workArea.x;
    let y = position === 'top' ? workArea.y : (workArea.y + workArea.height - newHeight);
    
    console.log('[Main] Auto-position:', {
      display: currentDisplay.id,
      workArea: { x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height },
      window: { x, y, width: newWidth, height: newHeight },
      position
    });
    
    // ìž‘ì—… í‘œì‹œì¤„ ìœ„ì— í‘œì‹œ (í•­ìƒ ìœ„ê°€ êº¼ì ¸ìžˆìœ¼ë©´ ì¼œê¸°)
    if (!viewerWindow.isAlwaysOnTop()) {
      viewerWindow.setAlwaysOnTop(true, 'normal');
    }
    
    // ìœ„ì¹˜ + í¬ê¸° ì„¤ì • (í•œ ë²ˆë§Œ, ì´í›„ ì‚¬ìš©ìž ìžìœ )
    viewerWindow.setBounds({
      x: x,
      y: y,
      width: newWidth,
      height: newHeight
    });
    
    // Windows ë ˆì´ì•„ì›ƒ ë²„ê·¸ ë°©ì§€
    setTimeout(() => {
      viewerWindow.setBounds({
        x: x,
        y: y,
        width: newWidth,
        height: newHeight
      });
    }, 100);
    
    return true;
  } catch (error) {
    console.error('[Main] Auto-position error:', error);
    return false;
  }
});

// ì•ˆì „ìž¥ì¹˜ - ì£¼ê¸°ì ìœ¼ë¡œ í´ë¦­ ê°€ëŠ¥ ìƒíƒœ ìœ ì§€
// 5ì´ˆë§ˆë‹¤ ì²´í¬í•´ì„œ í´ë¦­ì´ í†µê³¼ë˜ëŠ” ë²„ê·¸ ë°©ì§€
setInterval(() => {
  if (viewerWindow && !viewerWindow.isDestroyed()) {
    viewerWindow.setIgnoreMouseEvents(false);
  }
}, 5000);

app.whenReady().then(() => {
  console.log('[App] Ready. Pending deep link:', pendingDeepLink);
  
  if (process.platform === 'win32' && process.argv.length > 1) {
    const deepLinkUrl = process.argv.find(arg => arg.startsWith('nuaviewer://'));
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl);
      return;
    }
  }
  
  if (pendingDeepLink) {
    createViewerWindow(pendingDeepLink.channel, pendingDeepLink.token);
  } else {
    createLoginWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    if (pendingDeepLink) {
      createViewerWindow(pendingDeepLink.channel, pendingDeepLink.token);
    } else {
      createLoginWindow();
    }
  }
});
