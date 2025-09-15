const { app, BrowserWindow, ipcMain, net, Menu } = require('electron');
const path = require('path');

// 앱 이름 강제 설정
app.setName('SubtitleViewer');
app.setAppUserModelId('com.subtitle.viewer');
if (process.platform === 'win32') {
  process.title = 'SubtitleViewer';
}

let mainWindow;
let viewerWindow;
let optionWindow = null;

function createWindow() {
  // 로그인 창 생성
  mainWindow = new BrowserWindow({
    width: 720,
    height: 400,
    frame: false,
    transparent: false,
    resizable: false,
    center: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('login-dialog.html');
}

// 뷰어 창 생성 함수
function createViewerWindow(channel) {
  // 프레임 없는 창으로 생성
  viewerWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    transparent: true,
    backgroundColor: '#01000000',
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: false,
    resizable: true,
    minWidth: 200,
    minHeight: 100,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
     webSecurity: true,  
        allowRunningInsecureContent: false 
    }
  });

  // 채널 코드 저장
  viewerWindow.channelCode = channel;

  // electron-viewer.html 로드
  viewerWindow.loadFile('electron-viewer.html');
  
  // 로드 완료 후 표시
  viewerWindow.once('ready-to-show', () => {
    viewerWindow.setTitle('');
    
    // Windows 11 투명 창 버그 대응
    if (process.platform === 'win32') {
      // 창을 먼저 불투명하게 만들고
      viewerWindow.setBackgroundColor('#FF000000');
      viewerWindow.show();
      
      // 100ms 후에 투명하게 변경
      setTimeout(() => {
        viewerWindow.setBackgroundColor('#00000000');
        // 중요: 마우스 이벤트 명시적 활성화
        viewerWindow.setIgnoreMouseEvents(false);
      }, 100);
    } else {
      viewerWindow.setBackgroundColor('#00000000');
      viewerWindow.show();
    }
    
    // Windows 11 버그 대응 - 지연 후 한번 더
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
  
  // 로드 완료 후 채널 코드 전송
  viewerWindow.webContents.on('did-finish-load', () => {
    viewerWindow.webContents.send('channel-code', channel);
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

// 투명 모드 토글 처리 (renderer에서 요청)
ipcMain.on('toggle-transparent-main', (event, isTransparent) => {
  if (!viewerWindow) return;
  
  if (isTransparent) {
    // 먼저 불투명하게
    viewerWindow.setBackgroundColor('#FF000000');
    
    // 50ms 후 투명하게 + 마우스 이벤트 강제 활성화
    setTimeout(() => {
      viewerWindow.setBackgroundColor('#01000000');
      viewerWindow.setIgnoreMouseEvents(false);
      
      // 창 포커스 재설정
      viewerWindow.focus();
      viewerWindow.blur();
      viewerWindow.focus();
    }, 50);
  } else {
    viewerWindow.setBackgroundColor('#FF000000');
    viewerWindow.setIgnoreMouseEvents(false);
  }
  
  // 미세 리사이즈로 Windows 11 버그 대응
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

// IPC 통신 처리 - ngrok URL로 수정됨
ipcMain.handle('connect-channel', async (event, { channel, passkey }) => {
  try {
    const serverUrl = 'https://8bc0d7a4da66.ngrok-free.app/';
    const apiUrl = `${serverUrl}/api/channel/${channel}/verify`;
    
    console.log('채널 확인:', apiUrl);
    
    const request = net.request(apiUrl);
    request.setHeader('ngrok-skip-browser-warning', 'true');
    request.setHeader('User-Agent', 'SubtitleViewer/1.0');
    
    return new Promise((resolve) => {
      let responseData = '';
      
      request.on('response', (response) => {
        response.on('data', (chunk) => {
          responseData += chunk.toString();
        });
        
        response.on('end', () => {
          try {
            // JSON 파싱
            const data = JSON.parse(responseData);
            console.log('응답 데이터:', data);
            
            // exists: true 확인
            if (response.statusCode === 200 && data.exists === true) {
              createViewerWindow(channel);
              mainWindow.close();
              resolve({ success: true });
            } else {
              resolve({ success: false, error: '채널을 찾을 수 없습니다' });
            }
          } catch (parseError) {
            console.error('JSON 파싱 오류:', parseError);
            resolve({ success: false, error: 'API 응답 처리 오류' });
          }
        });
      });
      
      request.on('error', (error) => {
        console.error('서버 연결 오류:', error);
        resolve({ success: false, error: '서버 연결 실패' });
      });
      
      request.end();
    });
  } catch (error) {
    return { success: false, error: '연결 오류' };
  }
});

// 항상 위 토글 (단축키)
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

// 옵션 창 열기
ipcMain.on('open-options', (event, currentSettings) => {
  if (optionWindow) {
    optionWindow.focus();
    return;
  }
  
  optionWindow = new BrowserWindow({
    width: 500,
    height: 800,
    title: '자막 뷰어 설정',
    parent: viewerWindow,
    frame: false,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  optionWindow.loadFile('electron-options.html');
  
  // 현재 설정 전달
  optionWindow.webContents.once('did-finish-load', () => {
    optionWindow.webContents.send('load-settings', currentSettings);
  });
  
  optionWindow.on('closed', () => {
    optionWindow = null;
  });
});

// 설정 변경 받기
ipcMain.on('apply-settings', (event, settings) => {
  viewerWindow.webContents.send('update-settings', settings);
});

// 옵션 창 최소화
ipcMain.on('minimize-option-window', () => {
  if (optionWindow) {
    optionWindow.minimize();
  }
});

// 창 컨트롤 (로그인 창용)
ipcMain.handle('close-window', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});