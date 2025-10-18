const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 채널 연결 (로그인 창에서 사용)
  connectChannel: (data) => ipcRenderer.invoke('connect-channel', data),
  
  // 창 컨트롤
  closeWindow: () => ipcRenderer.invoke('close-window'),
  minimize: () => ipcRenderer.send('minimize'),
  maximize: () => ipcRenderer.send('maximize'),
  close: () => ipcRenderer.send('close'),
  
  // 🆕 자동 레이아웃: 창 크기 + 위치 자동 조절 (한 번만 실행)
  resizeWindow: (width, height, position) => ipcRenderer.invoke('resize-window-auto', width, height, position),
  
  // 항상 위 토글
  toggleAlwaysOnTop: () => ipcRenderer.send('toggle-always-on-top'),
  
  // 전체화면 해제
  exitFullscreen: () => ipcRenderer.send('exit-fullscreen'),
  
  // 앱 종료
  exitApp: () => ipcRenderer.send('exit-app'),
  
  // 옵션 창 열기
  openOptions: (settings) => ipcRenderer.send('open-options', settings),
  
  // 설정 적용
  applySettings: (settings) => ipcRenderer.send('apply-settings', settings),
  
  // 투명 모드 토글
  toggleTransparent: (isTransparent) => ipcRenderer.send('toggle-transparent-main', isTransparent),
  
  // 컨텍스트 메뉴 표시
  showContextMenu: (options) => ipcRenderer.send('show-context-menu', options),
  
  // Quick Menu 관련
  openQuickMenu: () => ipcRenderer.send('open-quick-menu'),
  closeQuickMenu: () => ipcRenderer.send('close-quick-menu'),
  requestCurrentSettings: () => ipcRenderer.send('request-current-settings'),
  sendSettingsToMenu: (settings) => ipcRenderer.send('send-settings-to-menu', settings),
  applyQuickMenuSettings: (settings) => ipcRenderer.send('apply-quick-menu-settings', settings),
  quickAction: (action) => ipcRenderer.send('quick-action', action),
  confirmExit: () => ipcRenderer.invoke('confirm-exit'),
  onLoadSettings: (callback) => {
    ipcRenderer.on('load-settings', (event, settings) => callback(settings));
  },
  
  // Windows 렌더링 강제 갱신
  forceRepaint: () => ipcRenderer.send('force-repaint'),
  
  // 이벤트 리스너 등록
  on: (channel, callback) => {
    const validChannels = [
      'deep-link-join',
      'channel-code',
      'update-settings',
      'send-current-settings-to-menu',
      'quick-action',
      'toggle-transparent',
      'toggle-scrollbar',
      'always-on-top-changed',
      'load-settings'
    ];
    
    if (validChannels.includes(channel)) {
      const subscription = (event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);
      
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    } else {
      console.warn(`[Preload] Invalid channel: ${channel}`);
      return () => {};
    }
  },
  
  // 이벤트 한 번만 수신
  once: (channel, callback) => {
    const validChannels = [
      'deep-link-join',
      'channel-code',
      'load-settings'
    ];
    
    if (validChannels.includes(channel)) {
      ipcRenderer.once(channel, (event, ...args) => callback(...args));
    } else {
      console.warn(`[Preload] Invalid channel for once: ${channel}`);
    }
  },
  
  // 이벤트 리스너 제거
  removeAllListeners: (channel) => {
    const validChannels = [
      'deep-link-join',
      'channel-code',
      'update-settings',
      'send-current-settings-to-menu',
      'quick-action',
      'toggle-transparent',
      'toggle-scrollbar',
      'always-on-top-changed',
      'load-settings'
    ];
    
    if (validChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
    }
  }
});

if (process.env.NODE_ENV === 'development') {
  contextBridge.exposeInMainWorld('debug', {
    log: (...args) => console.log('[Renderer]', ...args),
    error: (...args) => console.error('[Renderer]', ...args),
    warn: (...args) => console.warn('[Renderer]', ...args)
  });
}

// process.platform을 렌더러에서 사용할 수 있도록 노출
contextBridge.exposeInMainWorld('process', {
  platform: process.platform
});
