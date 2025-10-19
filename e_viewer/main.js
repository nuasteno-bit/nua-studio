const { app, BrowserWindow, ipcMain, net, Menu, dialog, screen, globalShortcut } = require('electron');
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
    
    // Windows 렌더링 버그 수정: 타이틀바 깜빡임 방지
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
  
  // 포커스 잃으면 자동으로 닫기
  quickMenuWindow.on('blur', () => {
    if (quickMenuWindow && !quickMenuWindow.isDestroyed()) {
      quickMenuWindow.close();
    }
  });
  
  quickMenuWindow.on('closed', () => {
    quickMenuWindow = null;
  });
}

// 🆕 전역 단축키 등록 함수
function registerGlobalShortcuts() {
  // Alt+`: 테두리
  globalShortcut.register('Alt+`', () => {
    if (viewerWindow && !viewerWindow.isDestroyed()) {
      viewerWindow.webContents.send('quick-action', 'border');
      console.log('[GlobalShortcut] Alt+` pressed - Toggle border');
    }
  });
  
  // Alt+1: 자막 숨김/표시
  globalShortcut.register('Alt+1', () => {
    if (viewerWindow && !viewerWindow.isDestroyed()) {
      viewerWindow.webContents.send('quick-action', 'subtitle-toggle');
      console.log('[GlobalShortcut] Alt+1 pressed - Toggle subtitle');
    }
  });
  
  // Alt+2: 투명 모드
  globalShortcut.register('Alt+2', () => {
    if (viewerWindow && !viewerWindow.isDestroyed()) {
      viewerWindow.webContents.send('quick-action', 'transparent');
      console.log('[GlobalShortcut] Alt+2 pressed - Toggle transparent');
    }
  });
  
  // Alt+3: 글자 크게
  globalShortcut.register('Alt+3', () => {
    if (viewerWindow && !viewerWindow.isDestroyed()) {
      viewerWindow.webContents.send('quick-action', 'font-up');
      console.log('[GlobalShortcut] Alt+3 pressed - Font size up');
    }
  });
  
  // Alt+4: 글자 작게
  globalShortcut.register('Alt+4', () => {
    if (viewerWindow && !viewerWindow.isDestroyed()) {
      viewerWindow.webContents.send('quick-action', 'font-down');
      console.log('[GlobalShortcut] Alt+4 pressed - Font size down');
    }
  });
  
  console.log('[GlobalShortcut] 전역 단축키 등록 완료');
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

// 투명 모드 토글 시 클릭 가능 상태 유지
ipcMain.on('toggle-transparent-main', (event, isTransparent) => {
  if (!viewerWindow) return;
  
  // 투명 모드에서도 클릭 활성화
  viewerWindow.setIgnoreMouseEvents(false);
  console.log('[Main] Force clickable mode, transparent:', isTransparent);
  
  // Windows 렌더링 강제 갱신
  const [width, height] = viewerWindow.getSize();
  viewerWindow.setSize(width + 1, height + 1);
  setTimeout(() => {
    viewerWindow.setSize(width, height);
    // 리사이즈 후에도 다시 설정
    viewerWindow.setIgnoreMouseEvents(false);
    console.log('[Main] Re-applied clickable after resize');
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
      label: '항상 위',
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

// Windows 렌더링 강제 갱신 핸들러
ipcMain.on('force-repaint', () => {
  if (!viewerWindow || viewerWindow.isDestroyed()) return;
  
  const [width, height] = viewerWindow.getSize();
  viewerWindow.setSize(width + 1, height + 1);
  setTimeout(() => {
    viewerWindow.setSize(width, height);
  }, 50);
});

// 🆕 자동 맞춤: 창 크기 + 위치 자동 조절 (멀티 모니터 지원, 한 번만 실행)
ipcMain.handle('resize-window-auto', (event, width, height, position) => {
  if (!viewerWindow || viewerWindow.isDestroyed()) return false;
  
  try {
    // 현재 창이 있는 모니터 찾기
    const windowBounds = viewerWindow.getBounds();
    const displays = screen.getAllDisplays();
    const currentDisplay = screen.getDisplayNearestPoint({ 
      x: windowBounds.x + windowBounds.width / 2, 
      y: windowBounds.y + windowBounds.height / 2 
    });
    
    // workArea = 작업 표시줄을 제외한 실제 사용 가능 영역
    const workArea = currentDisplay.workArea;
    
    console.log('[Main] Current display:', {
      id: currentDisplay.id,
      workArea: workArea
    });
    
    // 해당 모니터의 전체 너비 사용
    const newWidth = workArea.width;
    const newHeight = Math.max(80, Math.round(height));
    
    // 위치 계산: 해당 모니터의 상단 or 하단
    let x = workArea.x;
    let y = position === 'top' ? workArea.y : (workArea.y + workArea.height - newHeight);
    
    console.log('[Main] Auto-position:', {
      display: currentDisplay.id,
      workArea: { x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height },
      window: { x, y, width: newWidth, height: newHeight },
      position
    });
    
    // 작업 표시줄 위에 표시 (항상 위가 꺼져있으면 켜기)
    if (!viewerWindow.isAlwaysOnTop()) {
      viewerWindow.setAlwaysOnTop(true, 'normal');
    }
    
    // 위치 + 크기 설정 (한 번만, 이벤트 사슬 차단)
    viewerWindow.setBounds({
      x: x,
      y: y,
      width: newWidth,
      height: newHeight
    });
    
    // Windows 렌더링 버그 방지
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

// 안정장치 - 주기적으로 클릭 가능 상태 유지
// 5초마다 체크해서 클릭이 불가능한 버그 방지
setInterval(() => {
  if (viewerWindow && !viewerWindow.isDestroyed()) {
    viewerWindow.setIgnoreMouseEvents(false);
  }
}, 5000);

app.whenReady().then(() => {
  console.log('[App] Ready. Pending deep link:', pendingDeepLink);
  
  // 🆕 전역 단축키 등록
  registerGlobalShortcuts();
  
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

// 🆕 앱 종료 시 전역 단축키 해제
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  console.log('[GlobalShortcut] 전역 단축키 해제');
});
