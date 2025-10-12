const { app, BrowserWindow, ipcMain, net, Menu, dialog } = require('electron');
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
      allowRunningInsecureContent: false
    }
  });

  viewerWindow.channelCode = channel;
  viewerWindow.channelToken = token;

  viewerWindow.loadFile('electron-viewer.html');
  
  viewerWindow.once('ready-to-show', () => {
    viewerWindow.setTitle('NUA Subtitle Viewer');
    viewerWindow.show();
    
    // Windows 렌더링 버그 수정: 크기 변경으로 강제 리페인트
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
    buttons: ['취소', '종료'],
    defaultId: 0,
    cancelId: 0,
    title: '앱 종료',
    message: '앱을 종료하시겠습니까?',
    noLink: true
  });
  
  console.log('[Main] User selected:', result.response === 1 ? '종료' : '취소');
  return result.response === 1;
});

ipcMain.on('toggle-transparent-main', (event, isTransparent) => {
  if (!viewerWindow) return;
  
  // Windows 렌더링 강제 갱신
  const [width, height] = viewerWindow.getSize();
  viewerWindow.setSize(width + 1, height + 1);
  setTimeout(() => {
    viewerWindow.setSize(width, height);
  }, 50);
});

ipcMain.on('show-context-menu', (event, { isTransparent, isScrollbarHidden, x, y }) => {
  const menu = Menu.buildFromTemplate([
    {
      label: viewerWindow.isFullScreen() ? '전체화면 해제' : '전체화면',
      click: () => {
        viewerWindow.setFullScreen(!viewerWindow.isFullScreen());
      }
    },
    {
      label: '투명 배경',
      type: 'checkbox',
      checked: isTransparent,
      click: () => {
        event.sender.send('toggle-transparent');
      }
    },
    {
      label: '스크롤바 숨기기',
      type: 'checkbox',
      checked: isScrollbarHidden,
      click: () => {
        event.sender.send('toggle-scrollbar');
      }
    },
    { type: 'separator' },
    {
      label: '항상 위에',
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
      label: '창 위치 초기화',
      click: () => {
        viewerWindow.center();
        viewerWindow.setSize(800, 600);
      }
    },
    { type: 'separator' },
    {
      label: '닫기',
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
              resolve({ success: false, error: '채널을 찾을 수 없습니다' });
            }
          } catch (parseError) {
            console.error('[Channel] Parse error:', parseError);
            resolve({ success: false, error: 'API 응답 처리 오류' });
          }
        });
      });
      
      request.on('error', (error) => {
        console.error('[Channel] Connection error:', error);
        resolve({ success: false, error: '서버 연결 실패' });
      });
      
      request.end();
    });
  } catch (error) {
    console.error('[Channel] Error:', error);
    return { success: false, error: '연결 오류' };
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
    title: '자막 뷰어 설정',
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

// Windows 렌더링 강제 갱신 핸들러 추가
ipcMain.on('force-repaint', () => {
  if (!viewerWindow || viewerWindow.isDestroyed()) return;
  
  const [width, height] = viewerWindow.getSize();
  viewerWindow.setSize(width + 1, height + 1);
  setTimeout(() => {
    viewerWindow.setSize(width, height);
  }, 50);
});

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
