const { app, BrowserWindow, ipcMain, net, Menu } = require('electron');
const path = require('path');

// 앱 이름 강제 설정
app.setName('NUA Subtitle Viewer');
app.setAppUserModelId('com.nua.subtitle.viewer');
if (process.platform === 'win32') {
  process.title = 'NUA Subtitle Viewer';
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

let mainWindow = null;
let viewerWindow = null;
let optionWindow = null;
let pendingDeepLink = null;

// 딥링크 처리 함수
function handleDeepLink(url) {
  console.log('[DeepLink] Received:', url);
  
  if (!url || !url.startsWith('nuaviewer://')) {
    console.log('[DeepLink] Invalid URL format');
    return;
  }
  
  try {
    const urlObj = new URL(url);
    const action = urlObj.hostname; // join, open 등
    const params = new URLSearchParams(urlObj.search);
    const channel = params.get('channel');
    const token = params.get('token'); // 옵셔널
    
    console.log('[DeepLink] Parsed - Action:', action, 'Channel:', channel);
    
    // 채널 코드 검증 (6자리 대문자/숫자)
    if (channel && /^[A-Z0-9]{6}$/.test(channel)) {
      if (viewerWindow && !viewerWindow.isDestroyed()) {
        // 이미 viewer가 열려있으면 채널 전환
        viewerWindow.show();
        viewerWindow.focus();
        viewerWindow.webContents.send('deep-link-join', { channel, token });
      } else if (!app.isReady()) {
        // 앱 시작 중이면 pending으로 저장
        pendingDeepLink = { channel, token };
      } else {
        // viewer 창 새로 생성
        createViewerWindow(channel, token);
      }
    } else {
      console.log('[DeepLink] Invalid channel code format');
    }
  } catch (error) {
    console.error('[DeepLink] Parse error:', error);
  }
}

// 프로토콜 등록
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('nuaviewer', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('nuaviewer');
}

// Single instance 처리
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    console.log('[SecondInstance] Command line:', commandLine);
    
    // Windows에서 딥링크 추출
    const deepLinkUrl = commandLine.find(arg => arg.startsWith('nuaviewer://'));
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl);
    }
    
    // 기존 창 포커스
    if (viewerWindow && !viewerWindow.isDestroyed()) {
      if (viewerWindow.isMinimized()) viewerWindow.restore();
      viewerWindow.focus();
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  
  // macOS 딥링크 처리
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });
}

// 로그인 창 생성 - 투명 배경에 카드만 표시
function createLoginWindow() {
  mainWindow = new BrowserWindow({
    width: 480,        // 좌우도 더 여유있게
    height: 560,       // 상하 더 충분히
    frame: false,
    transparent: true, // 투명 배경 활성화
    hasShadow: false,  // OS 그림자 제거
    backgroundColor: '#00000000', // 완전 투명
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
    // 로그인 창이 닫히고 viewer가 없으면 앱 종료
    if (!viewerWindow || viewerWindow.isDestroyed()) {
      app.quit();
    }
  });
}

function createViewerWindow(channel, token = null) {
  // 로그인 창이 있으면 닫기
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
    mainWindow = null;
  }
  
  // 프레임 없는 창으로 생성
  viewerWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 400,
    minHeight: 300,
    frame: false,
    transparent: true,
    backgroundColor: '#01000000',
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

  // 채널 코드 저장
  viewerWindow.channelCode = channel;
  viewerWindow.channelToken = token;

  // electron-viewer.html 로드
  viewerWindow.loadFile('electron-viewer.html');
  
  // 로드 완료 후 표시
  viewerWindow.once('ready-to-show', () => {
    viewerWindow.setTitle('NUA Subtitle Viewer');
    
    // Windows 11 투명 창 버그 대응
    if (process.platform === 'win32') {
      viewerWindow.setBackgroundColor('#FF000000');
      viewerWindow.show();
      
      setTimeout(() => {
        viewerWindow.setBackgroundColor('#00000000');
        viewerWindow.setIgnoreMouseEvents(false);
      }, 100);
    } else {
      viewerWindow.setBackgroundColor('#00000000');
      viewerWindow.show();
    }
    
    // 안정성을 위한 추가 처리
    setTimeout(() => {
      viewerWindow.setTitle('');
      viewerWindow.setIgnoreMouseEvents(false);
      const [width, height] = viewerWindow.getSize();
      viewerWindow.setSize(width + 1, height);
      setTimeout(() => {
        viewerWindow.setSize(width, height);
      }, 50);
    }, 100);
  });
  
  // 로드 완료 후 채널 정보 전송
  viewerWindow.webContents.on('did-finish-load', () => {
    // 딥링크로 실행된 경우 자동 접속
    if (channel) {
      viewerWindow.webContents.send('deep-link-join', { channel, token });
    }
  });
  
  // 포커스 잃을 때마다 처리
  viewerWindow.on('blur', () => {
    setTimeout(() => {
      viewerWindow.setTitle('');
      viewerWindow.setBackgroundColor('#01000000');
      viewerWindow.setIgnoreMouseEvents(false);
    }, 10);
  });
  
  // 창 닫힘 시
  viewerWindow.on('closed', () => {
    viewerWindow = null;
    app.quit();
  });
  
  return viewerWindow;
}

// 투명 모드 토글 처리
ipcMain.on('toggle-transparent-main', (event, isTransparent) => {
  if (!viewerWindow) return;
  
  if (isTransparent) {
    viewerWindow.setBackgroundColor('#FF000000');
    
    setTimeout(() => {
      viewerWindow.setBackgroundColor('#01000000');
      viewerWindow.setIgnoreMouseEvents(false);
      viewerWindow.focus();
      viewerWindow.blur();
      viewerWindow.focus();
    }, 50);
  } else {
    viewerWindow.setBackgroundColor('#FF000000');
    viewerWindow.setIgnoreMouseEvents(false);
  }
  
  const [width, height] = viewerWindow.getSize();
  viewerWindow.setSize(width + 1, height + 1);
  setTimeout(() => {
    viewerWindow.setSize(width, height);
  }, 50);
});

// 컨텍스트 메뉴 표시
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

// 로그인 창에서 채널 연결 요청 처리
ipcMain.handle('connect-channel', async (event, { channel, passkey }) => {
  try {
    const serverUrl = 'https://nuastudio.co.kr';
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
              // 채널 존재 확인됨 - viewer 창 생성
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

// 항상 위 토글
ipcMain.on('toggle-always-on-top', (event) => {
  if (!viewerWindow) return;
  
  const newState = !viewerWindow.isAlwaysOnTop();
  viewerWindow.setAlwaysOnTop(newState);
  event.sender.send('always-on-top-changed', newState);
});

// ESC 키로 전체화면 해제
ipcMain.on('exit-fullscreen', () => {
  if (viewerWindow && viewerWindow.isFullScreen()) {
    viewerWindow.setFullScreen(false);
  }
});

// 앱 종료 처리
ipcMain.on('exit-app', () => {
  app.quit();
});

// 옵션 창 열기
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

// 설정 변경 받기
ipcMain.on('apply-settings', (event, settings) => {
  if (viewerWindow && !viewerWindow.isDestroyed()) {
    viewerWindow.webContents.send('update-settings', settings);
  }
});

// 창 컨트롤 (로그인 창용)
ipcMain.handle('close-window', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

// 앱 준비 완료
app.whenReady().then(() => {
  console.log('[App] Ready. Pending deep link:', pendingDeepLink);
  
  // 초기 실행 시 argv 체크 (Windows)
  if (process.platform === 'win32' && process.argv.length > 1) {
    const deepLinkUrl = process.argv.find(arg => arg.startsWith('nuaviewer://'));
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl);
      return;
    }
  }
  
  // pendingDeepLink가 있으면 viewer 창으로 바로 실행
  if (pendingDeepLink) {
    createViewerWindow(pendingDeepLink.channel, pendingDeepLink.token);
  } else {
    // 딥링크가 없으면 로그인 창 표시
    createLoginWindow();
  }
});

// macOS에서 모든 창이 닫혔을 때
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// macOS에서 독 아이콘 클릭 시
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    if (pendingDeepLink) {
      createViewerWindow(pendingDeepLink.channel, pendingDeepLink.token);
    } else {
      createLoginWindow();
    }
  }
});
