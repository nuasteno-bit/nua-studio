const { contextBridge, ipcRenderer } = require('electron');

// Renderer 프로세스에 노출할 API
contextBridge.exposeInMainWorld('electronAPI', {
  // 채널 연결 (로그인 창에서 사용)
  connectChannel: (data) => ipcRenderer.invoke('connect-channel', data),
  
  // 창 컨트롤
  closeWindow: () => ipcRenderer.invoke('close-window'),
  minimize: () => ipcRenderer.send('minimize'),
  maximize: () => ipcRenderer.send('maximize'),
  close: () => ipcRenderer.send('close'),
  
  // 항상 위 토글
  toggleAlwaysOnTop: () => ipcRenderer.send('toggle-always-on-top'),
  
  // 전체화면 해제
  exitFullscreen: () => ipcRenderer.send('exit-fullscreen'),
  
  // 옵션 창 열기
  openOptions: (settings) => ipcRenderer.send('open-options', settings),
  
  // 설정 적용
  applySettings: (settings) => ipcRenderer.send('apply-settings', settings),
  
  // 투명 모드 토글
  toggleTransparent: (isTransparent) => ipcRenderer.send('toggle-transparent-main', isTransparent),
  
  // 컨텍스트 메뉴 표시
  showContextMenu: (options) => ipcRenderer.send('show-context-menu', options),
  
  // 이벤트 리스너 등록
  on: (channel, callback) => {
    // 허용된 채널 목록
    const validChannels = [
      'deep-link-join',           // 딥링크로 채널 참가
      'channel-code',              // 채널 코드 전달 (legacy)
      'update-settings',           // 설정 업데이트
      'toggle-transparent',        // 투명 모드 토글
      'toggle-scrollbar',          // 스크롤바 토글
      'always-on-top-changed',     // 항상 위 상태 변경
      'load-settings'              // 설정 로드 (옵션 창)
    ];
    
    if (validChannels.includes(channel)) {
      // IPC 이벤트를 한 번만 등록하도록 처리
      const subscription = (event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);
      
      // 구독 해제 함수 반환
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

// 개발 모드에서만 콘솔 로깅 활성화
if (process.env.NODE_ENV === 'development') {
  contextBridge.exposeInMainWorld('debug', {
    log: (...args) => console.log('[Renderer]', ...args),
    error: (...args) => console.error('[Renderer]', ...args),
    warn: (...args) => console.warn('[Renderer]', ...args)
  });
}
