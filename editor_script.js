// 전역 변수들 먼저 초기화
let monitoringLines = [];
const MAX_MONITORING_LINES = 30;
let accumulatedText = '';
let fullTextStorage = ''; // 전체 텍스트 보존용 추가
let viewerDisplayCache = []; // 뷰어 표시용 캐시 추가
let lastDisplayedText = '';
let lastRenderedLines = [];
let lastRenderTime = 0; // 렌더링 성능 추적용

let sendInputTimeout = null;
let lastSentText = '';
let lastSendTime = Date.now();

// 🆕 ACK 기반 렌더링 제어 변수
let lastAppliedVersion = 0;  // 마지막 적용된 버전
let pendingSendText = '';     // 전송 대기 중인 텍스트
let isWaitingForAck = false;  // ACK 대기 상태
let enableOptimisticRender = false; // 낙관적 렌더링 옵션 (기본 OFF)

// 엔터키 모드 - 전송 모드로 고정
const enterMode = 'send'; // 항상 전송 모드

// 뷰어 편집 모드 관리
let isViewerEditing = false;
let editorBeingEdited = null;

// 텍스트 개인화 설정
let textSettings = {
  fontSize: 15,
  lineHeight: 1.4,
  letterSpacing: 0,
  wordSpacing: 0
};

// 협업 채팅 메시지 저장
let chatMessages = [];
let unreadMessages = 0;

// 입력 최적화 카운터
let inputOptimizationCounter = 0;

// DOM 참조 초기화 함수
function initializeDOMReferences() {
  // 속기사2일 때 화면 좌우 반전 (내 입력창이 항상 왼쪽)
  const topRow = document.getElementById('topRow');
  if (myRole === '2' && topRow) {
    topRow.style.flexDirection = 'row-reverse';
  }
  
  if (myRole === '1') {
    myColDiv = document.getElementById('col1');
    otherColDiv = document.getElementById('col2');
    myEditor = document.getElementById('editor1');
    otherEditor = document.getElementById('editor2');
    myBadge = document.getElementById('badge1');
    otherBadge = document.getElementById('badge2');
    myStatus = document.getElementById('statusText1');
    otherStatus = document.getElementById('statusText2');
    myDot = document.getElementById('dot1');
    otherDot = document.getElementById('dot2');
    myColNum = 1;
    otherColNum = 2;
    
    // 타이틀 변경
    document.getElementById('title1').textContent = '내 입력 (속기사1)';
    document.getElementById('title2').textContent = '상대방 (속기사2)';
  } else {
    myColDiv = document.getElementById('col2');
    otherColDiv = document.getElementById('col1');
    myEditor = document.getElementById('editor2');
    otherEditor = document.getElementById('editor1');
    myBadge = document.getElementById('badge2');
    otherBadge = document.getElementById('badge1');
    myStatus = document.getElementById('statusText2');
    otherStatus = document.getElementById('statusText1');
    myDot = document.getElementById('dot2');
    otherDot = document.getElementById('dot1');
    myColNum = 2;
    otherColNum = 1;
    
    // 타이틀 변경 (화면 반전되므로 col2가 왼쪽에 표시됨)
    document.getElementById('title2').textContent = '내 입력 (속기사2)';
    document.getElementById('title1').textContent = '상대방 (속기사1)';
  }
  
  // 초기 권한 설정: activeStenographer에 따라 결정
  if (myEditor) {
    // 2인 모드 대기자는 입력 가능 (서버에 전송하여 파트너가 볼 수 있게)
    myEditor.removeAttribute('readonly');
    myEditor.disabled = false;
    myEditor.classList.remove('readonly');
    
    if (myRole === activeStenographer || isHtmlMode || isSoloMode()) {
      myEditor.placeholder = '여기에 입력...';
      console.log('[DOM 초기화] 권한자/HTML/1인 모드');
    } else {
      myEditor.placeholder = '대기 중... 입력은 가능합니다 (F7로 권한 요청)';
      console.log('[DOM 초기화] 대기자 - 입력은 가능');
    }
  }
  
  // 상대 입력창은 항상 읽기 전용 (표시만)
  if (otherEditor) {
    otherEditor.setAttribute('readonly', 'readonly');
    otherEditor.disabled = true;
    otherEditor.classList.add('readonly');
    otherEditor.placeholder = '상대 입력 대기 중...';
    console.log('[DOM 초기화] 상대 입력창 비활성화 (표시 전용)');
  }
  
  console.log('[DOM 초기화] 완료 - myRole:', myRole, 'myColNum:', myColNum, 'activeStenographer:', activeStenographer);
}

// 컴포넌트 초기화 함수
function initializeComponents() {
  initializeDOMReferences();
  
  if (myEditor) myEditor.style.fontSize = fontSizes[myColNum-1] + 'px';
  if (otherEditor) otherEditor.style.fontSize = fontSizes[otherColNum-1] + 'px';
  
  if (myEditor) {
    myEditor.oninput = handleInputChange;
    myEditor.onblur = () => {
      if (sendInputTimeout) {
        clearTimeout(sendInputTimeout);
        sendInputTimeout = null;
        
        const currentText = myEditor.value;
        // 모든 속기사가 blur 시 전송 (파트너가 봐야 하므로)
        if (currentText !== lastSentText && socket && socket.connected) {
          socket.emit('steno_input', { channel, role: `steno${myRole}`, text: currentText });
          lastSentText = currentText;
          lastSendTime = Date.now();
        }
      }
    };
    
    // 엔터키 처리 - 권한자만 전송 가능 (ACK 개선)
    myEditor.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // IME 조합 중이면 전송 방지
        if (e.isComposing === true) {
          console.log('[엔터키] IME 조합 중 - 전송 차단');
          return;
        }
        
        e.preventDefault();
        
        // HTML 모드 또는 권한자일 때만 뷰어로 전송
        if (isHtmlMode || myRole === activeStenographer || isSoloMode()) {
          // ACK 대기 중이면 전송 차단 (옵션)
          if (isWaitingForAck && !enableOptimisticRender) {
            console.log('[엔터키] ACK 대기 중 - 전송 지연');
            pendingSendText = myEditor.value;
            return;
          }
          sendToMonitor();
        } else {
          console.log('[엔터키] 대기자는 뷰어로 전송할 수 없습니다. 입력은 계속 가능합니다.');
          // 대기자는 엔터를 눌러도 아무 일도 일어나지 않음 (입력창 유지)
          showToast('대기자는 전송할 수 없습니다 (F7로 권한 요청)');
        }
      }
      // Shift+Enter는 줄바꿈 허용 (기본 동작)
    });
  }
  
  const viewerContent = document.getElementById('viewerContent');
  if (viewerContent) {
    viewerContent.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isViewerEditing) {
        e.preventDefault();
        e.stopPropagation();
        cancelViewerEdit();
      }
    });
  }
  
  const viewerIconBtn = document.getElementById('viewerIconBtn');
  if (viewerIconBtn) {
    viewerIconBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const channel = document.getElementById('channelInfo')?.textContent || 'default';
      const viewerUrl = `${window.location.origin}/viewer.html?channel=${channel}`;
      window.open(viewerUrl, '_blank');
    });
  }
  
  const chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
  }
  
  updateStatus();
  updateUtilityStatus();
}

// 토스트 메시지 표시 함수
function showToast(message, duration = 2000) {
  const existing = document.querySelector('.toast-message');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = 'toast-message';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 12px 20px;
    border-radius: 4px;
    z-index: 10000;
    animation: fadeIn 0.3s ease;
  `;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// 모드 업데이트 함수 (1인/2인 모드)
function updateMode() {
  const isSolo = stenoList.length === 1 || stenoList.length === 0;
  
  if (isSolo) {
    document.body.classList.add('solo-mode');
    document.body.classList.remove('collaboration-mode');
    console.log('1인 모드 활성화');
  } else {
    document.body.classList.add('collaboration-mode');
    document.body.classList.remove('solo-mode');
    console.log('2인 모드 활성화');
  }
}

// 폰트 크기 조절
let fontSizes = [15, 15];
let viewerFontSize = 15;

function adjustFontSize(editorId, delta) {
  fontSizes[editorId-1] = Math.max(11, Math.min(30, fontSizes[editorId-1] + delta));
  document.getElementById('editor'+editorId).style.fontSize = fontSizes[editorId-1] + 'px';
}

function adjustViewerFontSize(delta) {
  viewerFontSize = Math.max(11, Math.min(30, viewerFontSize + delta));
  const viewerContent = document.getElementById('viewerContent');
  if (viewerContent) {
    viewerContent.style.fontSize = viewerFontSize + 'px';
  }
}

// 탭 전환 함수
function switchTab(tabName, event) {
  if (tabName === 'chat') {
    unreadMessages = 0;
    updateChatBadge();
  }
  
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  
  if (event && event.target) {
    event.target.classList.add('active');
  }
  document.getElementById(tabName + '-tab').classList.add('active');
}

// 텍스트 개인화 설정 업데이트
function updateTextSettings() {
  const fontSize = document.getElementById('fontSizeRange').value;
  const lineHeight = document.getElementById('lineHeightRange').value / 10;
  const letterSpacing = document.getElementById('letterSpacingRange').value;
  const wordSpacing = document.getElementById('wordSpacingRange').value;
  
  textSettings = {
    fontSize: parseInt(fontSize),
    lineHeight: lineHeight,
    letterSpacing: parseInt(letterSpacing),
    wordSpacing: parseInt(wordSpacing)
  };
  
  document.getElementById('fontSizeValue').textContent = fontSize + 'px';
  document.getElementById('lineHeightValue').textContent = lineHeight.toFixed(1);
  document.getElementById('letterSpacingValue').textContent = letterSpacing + 'px';
  document.getElementById('wordSpacingValue').textContent = wordSpacing + 'px';
  
  if (myEditor) {
    myEditor.style.fontSize = fontSize + 'px';
    myEditor.style.lineHeight = lineHeight;
    myEditor.style.letterSpacing = letterSpacing + 'px';
    myEditor.style.wordSpacing = wordSpacing + 'px';
  }
  
  localStorage.setItem('textSettings', JSON.stringify(textSettings));
}

// 채팅 메시지 전송
function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  
  if (!message) return;
  
  const chatMsg = {
    sender: `속기사${myRole}`,
    message: message,
    timestamp: new Date().toISOString(),
    isMine: true
  };
  
  addChatMessage(chatMsg);
  input.value = '';
  
  if (!isHtmlMode && socket && socket.connected) {
    socket.emit('chat_message', { 
      channel, 
      sender: chatMsg.sender,
      message: message 
    });
  }
}

// 빠른 메시지 전송
function sendQuickMessage(message) {
  const chatMsg = {
    sender: `속기사${myRole}`,
    message: `[빠른 메시지] ${message}`,
    timestamp: new Date().toISOString(),
    isMine: true,
    isQuick: true
  };
  
  addChatMessage(chatMsg);
  
  if (!isHtmlMode && socket && socket.connected) {
    socket.emit('chat_message', { 
      channel, 
      sender: chatMsg.sender,
      message: chatMsg.message 
    });
  }
}

// 채팅 메시지 추가
function addChatMessage(msg) {
  chatMessages.push(msg);
  
  const container = document.getElementById('chatMessages');
  const placeholder = container.querySelector('.chat-placeholder');
  if (placeholder) placeholder.remove();
  
  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-message ${msg.isMine ? 'mine' : 'other'}`;
  if (msg.isQuick) msgDiv.classList.add('quick');
  
  const time = new Date(msg.timestamp).toLocaleTimeString('ko-KR', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  msgDiv.innerHTML = `
    <div class="chat-header">
      <span class="chat-sender">${msg.sender}</span>
      <span class="chat-time">${time}</span>
    </div>
    <div class="chat-content">${msg.message}</div>
  `;
  
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
  
  if (!msg.isMine) {
    const chatTab = document.querySelector('.tab-btn:nth-child(2)');
    if (!chatTab.classList.contains('active')) {
      unreadMessages++;
      updateChatBadge();
      
      const utilityBox = document.getElementById('utility');
      if (utilityBox) {
        utilityBox.classList.add('new-message');
        setTimeout(() => {
          utilityBox.classList.remove('new-message');
        }, 3000);
      }
    }
  }
}

// 채팅 배지 업데이트
function updateChatBadge() {
  const badge = document.getElementById('chatBadge');
  if (badge) {
    if (unreadMessages > 0) {
      badge.textContent = unreadMessages > 9 ? '9+' : unreadMessages;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }
}

// 권한 강제 가져오기
function forceGetRole() {
  if (isHtmlMode) return;
  
  if (!isCollaborationMode()) {
    alert('2인 모드에서만 사용 가능합니다.');
    return;
  }
  
  if (myRole === activeStenographer) {
    alert('이미 권한을 가지고 있습니다.');
    return;
  }
  
  if (confirm('상대방의 연결이 끊겼을 때만 사용하세요.\n권한을 강제로 가져오시겠습니까?')) {
    const newActive = myRole === '1' ? 'steno1' : 'steno2';
    
    if (socket && socket.connected) {
      socket.emit('force_role_switch', { 
        channel, 
        newActive,
        reason: 'forced'
      });
    }
    
    console.log('[권한 강제 획득] 요청 전송');
  }
}

// 연결 상태 확인
function checkConnection() {
  const myStatus = document.getElementById('myConnectionStatus');
  const otherStatus = document.getElementById('otherConnectionStatus');
  const pingStatus = document.getElementById('serverPing');
  
  if (!socket || !socket.connected) {
    myStatus.textContent = '연결 끊김';
    myStatus.className = 'stat-val bad';
    pingStatus.textContent = '-ms';
    return;
  }
  
  myStatus.textContent = '정상';
  myStatus.className = 'stat-val good';
  
  const startTime = Date.now();
  socket.emit('ping_test', { channel });
  
  socket.once('pong_test', () => {
    const ping = Date.now() - startTime;
    pingStatus.textContent = ping + 'ms';
    pingStatus.className = ping < 100 ? 'stat-val good' : 
                          ping < 300 ? 'stat-val warning' : 'stat-val bad';
  });
  
  if (isCollaborationMode()) {
    otherStatus.textContent = '연결됨';
    otherStatus.className = 'stat-val good';
  } else {
    otherStatus.textContent = '없음';
    otherStatus.className = 'stat-val';
  }
}

// 로컬 스토리지 초기화
function clearLocalStorage() {
  if (confirm('모든 로컬 데이터를 삭제하시겠습니까?\n(설정 등이 초기화됩니다)')) {
    localStorage.clear();
    alert('로컬 데이터가 초기화되었습니다.');
    location.reload();
  }
}

// 테마 관리 시스템
let currentTheme = 'dark';

function loadTheme() {
  const savedTheme = localStorage.getItem('stenoTheme') || 'dark';
  setTheme(savedTheme);
}

function setTheme(theme) {
  currentTheme = theme;
  
  document.body.classList.remove('light-theme', 'solarized', 'contrast');
  
  if (theme === 'light') {
    document.body.classList.add('light-theme');
  } else if (theme === 'solarized') {
    document.body.classList.add('solarized');
  } else if (theme === 'contrast') {
    document.body.classList.add('contrast');
  }
  
  // 테마 선택 버튼 활성화 상태 업데이트
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`.theme-option.${theme}`)?.classList.add('active');
  
  localStorage.setItem('stenoTheme', theme);
  
  console.log(`[테마 변경] ${theme} 테마 적용됨`);
}

function loadUserSettings() {
  loadTheme();
  
  const savedTextSettings = localStorage.getItem('textSettings');
  if (savedTextSettings) {
    textSettings = JSON.parse(savedTextSettings);
  }
}

// 뷰어 편집 관련 함수들
function toggleViewerEdit() {
  if (isViewerEditing) {
    completeViewerEdit();
  } else {
    startViewerEdit();
  }
}

window.toggleViewerEdit = function() {
  if (isViewerEditing) {
    completeViewerEdit();
  } else {
    startViewerEdit();
  }
};

function startViewerEdit() {
  console.log('[편집 시작] 대기자 편집 모드 진입');
  console.log('- 2인 모드?:', stenoList.length === 2);
  console.log('- 내가 대기자?:', myRole !== activeStenographer);

  if (stenoList.length === 2 && myRole !== activeStenographer) {
    isViewerEditing = true;
    const viewer = document.getElementById('viewer');
    const viewerContent = document.getElementById('viewerContent');
    const editBtn = document.getElementById('viewerEditBtn');
    viewer.classList.add('editing');
    viewerContent.contentEditable = 'true';
    viewerContent.focus();
    editBtn.textContent = '완료';
    editBtn.classList.add('editing');
    
    if (socket && socket.connected) {
      socket.emit('viewer_edit_start', { 
        channel, 
        editorRole: `속기사${myRole}` 
      });
    }
  } else {
    console.log('[편집 시작] 조건 미충족');
  }
}

function completeViewerEdit() {
  if (!isViewerEditing) return;

  const viewerContent = document.getElementById('viewerContent');
  const viewer = document.getElementById('viewer');
  const editBtn = document.getElementById('viewerEditBtn');
  if (!viewerContent) return;

  // 편집 완료 시 텍스트를 innerText로 수집 + 개행/공백 정규화
  const editedText = viewerContent.innerText
    .replace(/\r\n?/g, '\n')   // CRLF/CR -> LF
    .replace(/\u00A0/g, ' ');  // NBSP -> space

  // 누적 본문 반영
  accumulatedText = editedText;
  fullTextStorage = editedText;

  // 편집 모드 종료 UI/상태
  isViewerEditing = false;
  if (viewer) viewer.classList.remove('editing');
  viewerContent.contentEditable = 'false';
  if (editBtn) {
    editBtn.textContent = '편집';
    editBtn.classList.remove('editing');
  }

  // 변경사항 방송
  if (socket && socket.connected) {
    socket.emit('viewer_edit_complete', {
      channel,
      editedText,
      editorRole: `속기사${myRole}`
    });
  }

  // 재렌더 및 포커스 복구
  updateViewerContent();
  if (myEditor) myEditor.focus();
}

function cancelViewerEdit() {
  if (!isViewerEditing) return;
  
  if (socket && socket.connected) {
    socket.emit('viewer_edit_cancel', { channel });
  }
  
  updateViewerContent();
  exitEditMode();
}

function exitEditMode() {
  isViewerEditing = false;
  const viewer = document.getElementById('viewer');
  const viewerContent = document.getElementById('viewerContent');
  const editBtn = document.getElementById('viewerEditBtn');
  if (viewer) viewer.classList.remove('editing');
  if (viewerContent) {
    viewerContent.contentEditable = 'false';
  }
  if (editBtn) {
    editBtn.textContent = '편집';
    editBtn.classList.remove('editing');
  }
  console.log('[뷰어 편집] 편집 모드 종료');
}

// 텍스트 처리 유틸리티 함수들
function splitTextIntoLines(text, maxLines = MAX_MONITORING_LINES) {
  if (!text || typeof text !== 'string') return [];
  
  let lines = text.split('\n');
  
  const finalLines = [];
  let prevLineEmpty = false;
  
  lines.forEach(line => {
    const isEmpty = line.trim() === '';
    if (!isEmpty || !prevLineEmpty) {
      finalLines.push(line);
    }
    prevLineEmpty = isEmpty;
  });
  
  return finalLines.slice(-maxLines);
}

function updateMonitoringFromText(fullText) {
  monitoringLines = splitTextIntoLines(fullText, MAX_MONITORING_LINES);
}

// 공통 뷰어 렌더링 함수 (XSS 방지, 중복 제거)
function renderMonitoringHTML(targetEl, monitoringText) {
  if (!targetEl) return;
  
  targetEl.innerHTML = ''; // 기존 내용 초기화
  
  if (!monitoringText) {
    // placeholder 표시
    const placeholder = document.createElement('span');
    placeholder.className = 'viewer-placeholder';
    placeholder.textContent = '자막이 여기에 표시됩니다.';
    targetEl.appendChild(placeholder);
    return;
  }
  
  const frag = document.createDocumentFragment();
  const lines = monitoringText.split('\n');
  
  lines.forEach((line, idx) => {
    if (line === '') {
      // 빈 줄은 br만 추가
      frag.appendChild(document.createElement('br'));
    } else {
      // 내용이 있는 줄은 span으로 감싸기
      const span = document.createElement('span');
      span.textContent = line; // XSS 방지: textContent 사용
      frag.appendChild(span);
    }
    
    // 마지막 줄이 아니면 br 추가
    if (idx < lines.length - 1) {
      frag.appendChild(document.createElement('br'));
    }
  });
  
  targetEl.appendChild(frag);
}

// 뷰어 업데이트 함수들
function updateViewerFromEditor() {
  if (isViewerEditing) return;
  
  const viewerContent = document.getElementById('viewerContent');
  if (!viewerContent || !myEditor) return;
  
  // HTML 모드에서는 항상 권한자
  const inputText = myEditor.value;
  let currentText = accumulatedText || '';
  if (currentText.length > 0 && inputText) {
    const needsSpacer = !currentText.endsWith('\n') && 
                        !currentText.endsWith(' ') && 
                        !inputText.startsWith('\n');
    currentText += (needsSpacer ? ' ' : '') + inputText;
  } else {
    currentText = inputText;
  }
  
  fullTextStorage = currentText;
  updateMonitoringFromText(currentText);
  const monitoringText = monitoringLines.join('\n');
  
  requestAnimationFrame(() => {
    renderMonitoringHTML(viewerContent, monitoringText);
    viewerContent.scrollTop = viewerContent.scrollHeight;
    lastDisplayedText = monitoringText;
  });
}

function updateViewerContent() {
  if (isViewerEditing) return;
  
  const viewerContent = document.getElementById('viewerContent');
  if (viewerContent) {
    fullTextStorage = accumulatedText;
    updateMonitoringFromText(accumulatedText);
    const monitoringText = monitoringLines.join('\n');
    
    requestAnimationFrame(() => {
      renderMonitoringHTML(viewerContent, monitoringText);
      viewerContent.scrollTop = viewerContent.scrollHeight;
      lastDisplayedText = monitoringText;
    });
  }
}

// 전송 모드에서 텍스트 전송 (ACK 기반 개선)
function sendToMonitor() {
  if (!myEditor || myEditor.value.trim() === '') return;
  
  // 1인 모드이거나 권한자인 경우만 전송 가능
  if (isSoloMode() || myRole === activeStenographer || isHtmlMode) {
    const inputText = myEditor.value;
    
    // 낙관적 렌더링이 켜져있으면 즉시 렌더
    if (enableOptimisticRender) {
      if (accumulatedText && accumulatedText.length > 0) {
        // 엔터키로 전송했으므로 줄바꿈 추가
        accumulatedText += '\n' + inputText;
      } else {
        accumulatedText = inputText;
      }
      
      fullTextStorage = accumulatedText;
      updateViewerContent();
    }
    
    // ACK 대기 상태로 전환
    isWaitingForAck = true;
    pendingSendText = '';
    
    myEditor.value = '';
    
    if (!isHtmlMode && socket && socket.connected) {
      socket.emit('text_sent', { 
        channel, 
        accumulatedText: enableOptimisticRender ? accumulatedText : undefined,
        sender: myRole,
        inputText: inputText  // 원본 입력 텍스트 전송
      });
    } else if (isHtmlMode) {
      // HTML 모드는 ACK 없이 즉시 반영
      if (!enableOptimisticRender) {
        if (accumulatedText && accumulatedText.length > 0) {
          accumulatedText += '\n' + inputText;
        } else {
          accumulatedText = inputText;
        }
        fullTextStorage = accumulatedText;
        updateViewerContent();
      }
      isWaitingForAck = false;
    }
    
    console.log('[전송 모드] 텍스트 전송 완료 - 누적:', accumulatedText.length, '자');
  } else {
    console.log('[전송 모드] 대기자는 전송할 수 없습니다. F7로 권한을 요청하세요.');
  }
}

// 입력 처리 함수
function handleInputChange() {
  let val = myEditor.value.replace(/ {2,}/g, ' ');
  if (val !== myEditor.value) {
    myEditor.value = val;
  }
  
  inputOptimizationCounter++;
  if (inputOptimizationCounter % 50 === 0) {
    trimEditorText(myEditor);
  }
  
  if (isHtmlMode) {
    updateViewerFromEditor();  // HTML 모드에서는 직접 뷰어 업데이트
  } else {
    sendInput();  // 소켓 모드에서는 역할별 처리
  }
}

// 소켓 모드 전송
function sendInput() {
  if (!socket || isHtmlMode) return;
  
  const currentText = myEditor.value;
  
  // 1인 모드이거나 권한자인 경우
  if (isSoloMode() || myRole === activeStenographer) {
    // 뷰어 업데이트 (한 단어 지연)
    updateViewerWithCurrentInput();
    
    // 서버로 입력 전송 (throttling)
    if (sendInputTimeout) {
      clearTimeout(sendInputTimeout);
    }
    
    const shouldSendImmediately = 
      currentText.endsWith(' ') ||
      currentText.endsWith('\n') ||
      currentText === '' ||
      (Date.now() - lastSendTime) > 5000;
    
    if (shouldSendImmediately) {
      if (currentText !== lastSentText) {
        if (socket.connected) {
          socket.emit('steno_input', { 
            channel: channel, 
            role: `steno${myRole}`, 
            text: currentText 
          });
        }
        lastSentText = currentText;
        lastSendTime = Date.now();
        
        if (sendInputTimeout) {
          clearTimeout(sendInputTimeout);
          sendInputTimeout = null;
        }
      }
    } else {
      sendInputTimeout = setTimeout(() => {
        if (currentText !== lastSentText) {
          if (socket.connected) {
            socket.emit('steno_input', { 
              channel: channel, 
              role: `steno${myRole}`, 
              text: currentText 
            });
          }
          lastSentText = currentText;
          lastSendTime = Date.now();
        }
      }, 200);
    }
  } 
  // 2인 모드의 대기자인 경우
  else {
    // 파트너와 실시간 공유를 위해 더 빠르게 전송
    if (sendInputTimeout) {
      clearTimeout(sendInputTimeout);
    }
    
    // 대기자는 더 즉각적으로 전송 (파트너가 실시간으로 봐야 매칭 가능)
    const shouldSendImmediately = 
      currentText.endsWith(' ') ||
      currentText === '' ||
      (Date.now() - lastSendTime) > 1000;  // 1초마다 (권한자의 5초보다 짧음)
    
    if (shouldSendImmediately) {
      if (currentText !== lastSentText) {
        if (socket.connected) {
          socket.emit('steno_input', { 
            channel: channel, 
            role: `steno${myRole}`, 
            text: currentText 
          });
        }
        lastSentText = currentText;
        lastSendTime = Date.now();
      }
    } else {
      // 대기자는 100ms로 더 빠르게 (권한자의 200ms보다 짧음)
      sendInputTimeout = setTimeout(() => {
        if (currentText !== lastSentText) {
          if (socket.connected) {
            socket.emit('steno_input', { 
              channel: channel, 
              role: `steno${myRole}`, 
              text: currentText 
            });
          }
          lastSentText = currentText;
          lastSendTime = Date.now();
        }
      }, 100);
    }
  }
  
  // 2인 모드에서만 단어 매칭 체크
  if (isCollaborationMode()) {
    if (myRole !== activeStenographer) {
      checkWordMatchingAsWaiting();  // 대기자: 권한 획득 체크
    } else {
      checkWordMatchingAsActive();   // 권한자: 대기자 매칭 확인
    }
  }
}

// 뷰어 업데이트 with 입력 (권한자의 입력만 반영)
function updateViewerWithCurrentInput() {
  if (isViewerEditing) return;
  if (myRole !== activeStenographer) return; // 권한자만 뷰어 업데이트
  
  const viewerContent = document.getElementById('viewerContent');
  if (!viewerContent) return;
  
  let displayText = accumulatedText;
  
  // 현재 입력 중인 텍스트 추가 (단어 단위로)
  if (myEditor.value) {
    if (myEditor.value.endsWith(' ')) {
      // 공백으로 끝나면 전체 추가
      displayText = accumulatedText + 
        (accumulatedText && !accumulatedText.endsWith(' ') ? ' ' : '') + 
        myEditor.value.trim();
    } else {
      // 아직 입력 중인 마지막 단어는 제외
      const words = myEditor.value.trim().split(' ').filter(Boolean);
      if (words.length > 1) {
        const completeWords = words.slice(0, -1).join(' ');
        displayText = accumulatedText + 
          (accumulatedText && !accumulatedText.endsWith(' ') ? ' ' : '') + 
          completeWords;
      }
    }
  }
  
  fullTextStorage = displayText;
  updateMonitoringFromText(displayText);
  const monitoringText = monitoringLines.join('\n');
  
  requestAnimationFrame(() => {
    renderMonitoringHTML(viewerContent, monitoringText);
    viewerContent.scrollTop = viewerContent.scrollHeight;
    lastDisplayedText = monitoringText;
  });
}

function updateViewerWithOtherInput(otherText) {
  if (isViewerEditing) return;
  
  const viewerContent = document.getElementById('viewerContent');
  if (!viewerContent) return;
  
  let displayText = accumulatedText;
  
  // 권한자의 입력 추가
  if (otherText) {
    if (otherText.endsWith(' ')) {
      displayText = accumulatedText + 
        (accumulatedText && !accumulatedText.endsWith(' ') ? ' ' : '') + 
        otherText.trim();
    } else {
      const words = otherText.trim().split(' ').filter(Boolean);
      if (words.length > 1) {
        const completeWords = words.slice(0, -1).join(' ');
        displayText = accumulatedText + 
          (accumulatedText && !accumulatedText.endsWith(' ') ? ' ' : '') + 
          completeWords;
      }
    }
  }
  
  fullTextStorage = displayText;
  updateMonitoringFromText(displayText);
  const monitoringText = monitoringLines.join('\n');
  
  requestAnimationFrame(() => {
    renderMonitoringHTML(viewerContent, monitoringText);
    viewerContent.scrollTop = viewerContent.scrollHeight;
    lastDisplayedText = monitoringText;
  });
}

// 입력창 텍스트 최적화
const EDITOR_MAX_CHARS = 4000;
const EDITOR_TRIM_CHARS = 2500;

function trimEditorText(editor) {
  if (!editor || !editor.value) return;
  
  const text = editor.value;
  if (text.length > EDITOR_MAX_CHARS) {
    const trimmedText = text.slice(-EDITOR_TRIM_CHARS);
    
    const firstSpaceIndex = trimmedText.indexOf(' ');
    const finalText = firstSpaceIndex > 0 ? trimmedText.slice(firstSpaceIndex + 1) : trimmedText;
    
    editor.value = finalText;
    editor.setSelectionRange(finalText.length, finalText.length);
    
    console.log(`[입력창 최적화] ${text.length}자 → ${finalText.length}자로 축소`);
    return true;
  }
  return false;
}

// 모드 체크
function isSoloMode() {
  return stenoList.length === 1;
}

function isCollaborationMode() {
  return stenoList.length === 2;
}

// 에디터 접근 권한 적용 함수 (개선된 버전)
function applyEditorLocks() {
  if (!myEditor || !otherEditor) return;
  
  const iAmActive = (myRole === activeStenographer);
  
  console.log('[권한 설정] 적용 중:', {
    내역할: myRole,
    활성자: activeStenographer,
    내가활성: iAmActive,
    HTML모드: isHtmlMode,
    '1인모드': isSoloMode()
  });
  
  // 내 에디터 - 2인 대기자도 입력 가능 (파트너가 실시간으로 봐야 하므로)
  myEditor.removeAttribute('readonly');
  myEditor.disabled = false;
  myEditor.classList.remove('readonly');
  
  if (iAmActive || isHtmlMode || isSoloMode()) {
    // 권한자이거나, HTML 모드이거나, 1인 모드일 때
    myEditor.placeholder = '여기에 입력...';
    console.log('[권한 설정] 권한자/HTML/1인 모드');
  } else {
    // 2인 모드의 대기자일 때 - 입력은 가능
    myEditor.placeholder = '대기 중... 입력은 가능합니다 (F7로 권한 요청)';
    console.log('[권한 설정] 대기자 - 입력 가능');
  }
  
  // 상대 에디터는 항상 읽기 전용 (표시만)
  otherEditor.setAttribute('readonly', 'readonly');
  otherEditor.disabled = true;
  otherEditor.classList.add('readonly');
  otherEditor.placeholder = '상대 입력 대기 중...';
}

// 상태 업데이트
function updateStatus() {
  if (!myEditor || !otherEditor) return;
  
  // 엔터 모드 표시 제거 (항상 전송 모드이므로 불필요)
  const existingIndicator = document.querySelector('.enter-mode-indicator');
  if (existingIndicator) {
    existingIndicator.remove();
  }
  
  const viewerEditBtn = document.getElementById('viewerEditBtn');
  if (viewerEditBtn) {
    if (isHtmlMode || !isCollaborationMode() || myRole === activeStenographer) {
      viewerEditBtn.style.display = 'none';
    } else {
      viewerEditBtn.style.display = 'block';
      viewerEditBtn.disabled = false;
      viewerEditBtn.title = '뷰어 편집';
    }
  }
  
  if (isHtmlMode) {
    statusInfo.textContent = 'HTML 모드';
    myColDiv.classList.add('active');
    myBadge.textContent = '입력권한';
    myBadge.classList.add('live-badge');
    myStatus.textContent = '입력 가능';
    myDot.className = 'status-dot';
    
    if (otherColDiv) {
      otherColDiv.classList.remove('active');
      otherBadge.textContent = '비활성';
      otherBadge.classList.remove('live-badge');
      otherStatus.textContent = 'HTML 모드';
      otherDot.className = 'status-dot waiting';
    }
    
    return;
  }
  
  if (isCollaborationMode()) {
    statusInfo.textContent = '2인 매칭 완료';
    if (activeStenographer === myRole) {
      myColDiv.classList.add('active');
      myBadge.textContent = '입력권한';
      myBadge.classList.add('live-badge');
      myStatus.textContent = '입력 가능';
      myDot.className = 'status-dot';
      otherColDiv.classList.remove('active');
      otherBadge.textContent = '대기';
      otherBadge.classList.remove('live-badge');
      otherStatus.textContent = '대기 중';
      otherDot.className = 'status-dot waiting';
    } else {
      myColDiv.classList.remove('active');
      myBadge.textContent = '대기';
      myBadge.classList.remove('live-badge');
      myStatus.textContent = '대기 중';
      myDot.className = 'status-dot waiting';
      otherColDiv.classList.add('active');
      otherBadge.textContent = '입력권한';
      otherBadge.classList.add('live-badge');
      otherStatus.textContent = '입력 가능';
      otherDot.className = 'status-dot';
    }
  } else {
    statusInfo.textContent = isSoloMode() ? '1인 속기 모드' : '상대 대기 중';
    
    myColDiv.classList.add('active');
    myBadge.textContent = '입력권한';
    myBadge.classList.add('live-badge');
    myStatus.textContent = '입력 가능';
    myDot.className = 'status-dot';
  }
  
  checkConnection();
  applyEditorLocks(); // 권한 변경 시 readonly 상태 업데이트
}

// 유틸리티 상태 업데이트
function updateUtilityStatus() {
  updatePerformanceInfo();
}

function updatePerformanceInfo() {
  const perfChars1 = document.getElementById('perfChars' + myColNum);
  const perfStatus1 = document.getElementById('perfStatus' + myColNum);
  const perfMonitor1 = document.getElementById('perfMonitor' + myColNum);
  
  if (perfChars1 && perfStatus1 && perfMonitor1 && myEditor) {
    const charCount = myEditor.value.length;
    const monitorLinesCount = monitoringLines.length;
    
    perfChars1.textContent = `${charCount}자`;
    
    if (charCount > 3500) {
      perfStatus1.textContent = '곧최적화';
      perfStatus1.className = 'performance-warning';
    } else if (charCount > 3000) {
      perfStatus1.textContent = '주의';
      perfStatus1.className = 'performance-warning';
    } else {
      perfStatus1.textContent = '최적화됨';
      perfStatus1.className = '';
    }
    
    perfMonitor1.textContent = `${monitorLinesCount}/30줄`;
  }
  
  const perfChars2 = document.getElementById('perfChars' + otherColNum);
  const perfStatus2 = document.getElementById('perfStatus' + otherColNum);
  const perfMonitor2 = document.getElementById('perfMonitor' + otherColNum);
  
  if (perfChars2 && perfStatus2 && perfMonitor2 && otherEditor) {
    if (isCollaborationMode() && !isHtmlMode) {
      const otherCharCount = otherEditor.value.length;
      
      perfChars2.textContent = `${otherCharCount}자`;
      
      if (otherCharCount > 3500) {
        perfStatus2.textContent = '곧최적화';
        perfStatus2.className = 'performance-warning';
      } else if (otherCharCount > 3000) {
        perfStatus2.textContent = '주의';
        perfStatus2.className = 'performance-warning';
      } else {
        perfStatus2.textContent = '최적화됨';
        perfStatus2.className = '';
      }
      
      perfMonitor2.textContent = '';
    }
  }
}

// 🔥 강화된 단어 매칭 체크 - 교대 후 초기화 보장
let isProcessingSwitch = false;  // 교대 처리 중 플래그 추가

function checkWordMatchingAsWaiting() {
  if (isHtmlMode) return;
  if (myRole === activeStenographer) return;
  if (isProcessingSwitch) return;  // 교대 중이면 매칭 체크 중단
  
  // 시간 제한: 마지막 교대로부터 0.6초 이상 경과해야 함
  if (Date.now() - lastSwitchTime < MIN_SWITCH_INTERVAL) {
    return;
  }
  
  const myText = myEditor.value;
  const otherText = otherEditor.value;
  
  if (!myText || !otherText) return;
  
  // 공백 개수 세기
  const countSpaces = (text) => {
    let count = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === ' ') count++;
    }
    return count;
  };
  
  const mySpaceCount = countSpaces(myText);
  const otherSpaceCount = countSpaces(otherText);
  
  // 최소 matchWordCount개 공백 필요
  if (mySpaceCount < matchWordCount || otherSpaceCount < matchWordCount) return;
  
  // 공백 위치 배열 생성
  const getSpacePositions = (text) => {
    const positions = [];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === ' ') positions.push(i);
    }
    return positions;
  };
  
  const mySpaces = getSpacePositions(myText);
  
  // 대기자 텍스트에서 matchWordCount개 공백으로 구분된 구간 찾기
  for (let startSpaceIdx = 0; startSpaceIdx <= mySpaces.length - matchWordCount; startSpaceIdx++) {
    // 시작 위치 결정
    const startPos = startSpaceIdx === 0 ? 0 : mySpaces[startSpaceIdx - 1] + 1;
    // 끝 위치는 matchWordCount번째 공백 다음
    const endPos = mySpaces[startSpaceIdx + matchWordCount - 1] + 1;
    const candidateText = myText.substring(startPos, endPos);
    
    // 과거 텍스트와 매칭 방지 (중복 송출 방지)
    if (accumulatedText && accumulatedText.includes(candidateText.trim())) {
      console.log('[매칭 방지] 이미 송출된 텍스트:', candidateText.substring(0, 20));
      continue;
    }
    
    // 권한자 텍스트에서 매칭 확인
    const matchIndex = otherText.indexOf(candidateText);
    if (matchIndex !== -1) {
      // 매칭 성공: 권한자 텍스트에서 매칭 끝 위치까지를 누적
      const matchEndInOther = matchIndex + candidateText.length;
      const matchedFromActive = otherText.substring(0, matchEndInOther).trim();
      
      // 중복 확인 (누적 텍스트 끝과 비교)
      if (accumulatedText.trim().endsWith(matchedFromActive)) {
        console.log('[매칭 방지] 중복 송출 방지:', matchedFromActive.substring(0, 20));
        continue;
      }
      
      const newAccumulatedText = accumulatedText + 
        (accumulatedText && !accumulatedText.endsWith(' ') ? ' ' : '') + 
        matchedFromActive;
      
      const newActive = myRole === '1' ? 'steno1' : 'steno2';
      
      console.log('[매칭 감지] 대기자→권한자', {
        매칭텍스트: candidateText.substring(0, 30),
        공백시작인덱스: startSpaceIdx,
        누적확정: matchedFromActive.substring(0, 30)
      });
      
      isProcessingSwitch = true;  // 교대 처리 시작
      lastSwitchTime = Date.now();
      
      if (socket && socket.connected) {
        socket.emit('switch_role', { 
          channel: channel, 
          newActive: newActive, 
          matchedText: newAccumulatedText,
          matchStartIndex: startSpaceIdx,
          matchWordCount: matchWordCount
        });
      }
      
      // 교대 처리 플래그 해제
      setTimeout(() => {
        isProcessingSwitch = false;
      }, 2000);
      
      return;
    }
  }
}

// 권한자 입장에서 대기자 입력 체크
function checkWordMatchingAsActive() {
  if (isHtmlMode) return;
  if (myRole !== activeStenographer) return;
  if (isProcessingSwitch) return;  // 교대 중이면 매칭 체크 중단
  
  // 시간 제한
  if (Date.now() - lastSwitchTime < MIN_SWITCH_INTERVAL) {
    return;
  }
  
  const myText = myEditor.value;
  const otherText = otherEditor.value;
  
  if (!myText || !otherText) return;
  
  // 공백 개수 세기
  const countSpaces = (text) => {
    let count = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === ' ') count++;
    }
    return count;
  };
  
  const mySpaceCount = countSpaces(myText);
  const otherSpaceCount = countSpaces(otherText);
  
  if (mySpaceCount < matchWordCount || otherSpaceCount < matchWordCount) return;
  
  // 공백 위치 배열
  const getSpacePositions = (text) => {
    const positions = [];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === ' ') positions.push(i);
    }
    return positions;
  };
  
  const otherSpaces = getSpacePositions(otherText);
  
  // 대기자 텍스트에서 매칭 구간 찾기
  for (let startSpaceIdx = 0; startSpaceIdx <= otherSpaces.length - matchWordCount; startSpaceIdx++) {
    const startPos = startSpaceIdx === 0 ? 0 : otherSpaces[startSpaceIdx - 1] + 1;
    const endPos = otherSpaces[startSpaceIdx + matchWordCount - 1] + 1;
    const candidateText = otherText.substring(startPos, endPos);
    
    // 과거 텍스트와 매칭 방지 (중복 송출 방지)
    if (accumulatedText && accumulatedText.includes(candidateText.trim())) {
      console.log('[매칭 방지] 이미 송출된 텍스트:', candidateText.substring(0, 20));
      continue;
    }
    
    // 내 텍스트에서 매칭 확인
    const matchIndex = myText.indexOf(candidateText);
    if (matchIndex !== -1) {
      // 매칭 성공: 내 텍스트에서 매칭 끝 위치까지를 누적
      const matchEndInMy = matchIndex + candidateText.length;
      const matchedFromMe = myText.substring(0, matchEndInMy).trim();
      
      // 중복 확인 (누적 텍스트 끝과 비교)
      if (accumulatedText.trim().endsWith(matchedFromMe)) {
        console.log('[매칭 방지] 중복 송출 방지:', matchedFromMe.substring(0, 20));
        continue;
      }
      
      const newAccumulatedText = accumulatedText + 
        (accumulatedText && !accumulatedText.endsWith(' ') ? ' ' : '') + 
        matchedFromMe;
      
      const newActive = myRole === '1' ? 'steno2' : 'steno1';
      
      console.log('[매칭 감지] 권한자 확인→전환', {
        매칭텍스트: candidateText.substring(0, 30),
        공백시작인덱스: startSpaceIdx,
        누적확정: matchedFromMe.substring(0, 30)
      });
      
      isProcessingSwitch = true;  // 교대 처리 시작
      lastSwitchTime = Date.now();
      
      if (socket && socket.connected) {
        socket.emit('switch_role', { 
          channel, 
          newActive, 
          matchedText: newAccumulatedText,
          matchStartIndex: startSpaceIdx,
          matchWordCount: matchWordCount
        });
      }
      
      // 교대 처리 플래그 해제
      setTimeout(() => {
        isProcessingSwitch = false;
      }, 2000);
      
      return;
    }
  }
}

// 수동 권한 전환
let manualSwitchCooldown = false;
let isSwitchingRole = false;
let lastSwitchTime = 0;
const MIN_SWITCH_INTERVAL = 600; // 0.6초 (서버와 동일)

function offerRole() {
  if (isHtmlMode) return;
  
  try {
    if (myRole !== activeStenographer) {
      console.log('[권한 양보] 권한자만 양보할 수 있습니다. (현재: 대기자)');
      return;
    }
    manualSwitchRole('권한 양보 (F6)');
  } catch (error) {
    console.error('[권한 양보] 에러:', error);
  }
}

function requestRole() {
  if (isHtmlMode) return;
  
  try {
    if (myRole === activeStenographer) {
      console.log('[권한 요청] 대기자만 요청할 수 있습니다. (현재: 권한자)');
      return;
    }
    manualSwitchRole('권한 요청 (F7)');
  } catch (error) {
    console.error('[권한 요청] 에러:', error);
  }
}

function manualSwitchRole(reason) {
  if (isHtmlMode) return false;
  
  try {
    if (!isCollaborationMode()) {
      console.log('[수동 전환] 2인 모드에서만 가능합니다.');
      return false;
    }
    
    if (manualSwitchCooldown) {
      console.log('[수동 전환] 쿨타임 중입니다. (2초)');
      return false;
    }
    
    if (isSwitchingRole) {
      console.log('[수동 전환] 이미 권한 전환 처리 중입니다.');
      return false;
    }
    
    isSwitchingRole = true;
    manualSwitchCooldown = true;
    isProcessingSwitch = true;  // 교대 처리 플래그 추가
    lastSwitchTime = Date.now(); // 교대 시간 기록
    
    const newActive = myRole === '1' ? 'steno2' : 'steno1';
    
    // 수동 전환 시 누적 텍스트 처리
    let matchedText = accumulatedText;
    
    // 현재 권한자인 경우: 입력한 내용을 누적 텍스트에 추가
    if (myRole === activeStenographer && myEditor.value.trim()) {
      matchedText = accumulatedText + 
        (accumulatedText && !accumulatedText.endsWith(' ') ? ' ' : '') + 
        myEditor.value.trim();
    }
    
    console.log(`[수동 전환] ${reason}: ${myRole} → ${myRole === '1' ? '2' : '1'}`, {
      현재권한자: activeStenographer,
      새권한자: newActive,
      누적텍스트: matchedText
    });
    
    if (socket && socket.connected) {
      socket.emit('switch_role', { 
        channel, 
        newActive, 
        matchedText,
        reason: reason,
        manual: true
      });
    } else {
      console.error('[수동 전환] 소켓 연결이 끊어졌습니다.');
      isSwitchingRole = false;
      isProcessingSwitch = false;
      return false;
    }
    
    setTimeout(() => {
      manualSwitchCooldown = false;
      console.log('[수동 전환] 쿨타임 해제');
    }, 2000);
    
    setTimeout(() => {
      isSwitchingRole = false;
      isProcessingSwitch = false;
      console.log('[수동 전환] 처리 완료');
    }, 1000);
    
    return true;
    
  } catch (error) {
    console.error('[수동 전환] 에러 발생:', error);
    isSwitchingRole = false;
    manualSwitchCooldown = false;
    isProcessingSwitch = false;
    return false;
  }
}

// 교정 요청 함수
let correctionRequestTimeout = null;

function requestCorrection() {
  if (isHtmlMode) return;
  
  try {
    if (myRole !== activeStenographer) {
      console.log('[교정 요청] 권한자만 요청할 수 있습니다.');
      return;
    }
    
    if (correctionRequestTimeout) {
      clearTimeout(correctionRequestTimeout);
      correctionRequestTimeout = null;
    }
    
    const myStatusBar = document.getElementById('statusBar' + myColNum);
    if (myStatusBar) {
      const existingRequest = myStatusBar.querySelector('.correction-request');
      if (existingRequest) existingRequest.remove();
      
      const correctionIndicator = document.createElement('span');
      correctionIndicator.className = 'correction-request';
      correctionIndicator.textContent = '교정 요청';
      correctionIndicator.style.cssText = 'color: #ff8c00; font-weight: bold; margin-left: 16px; animation: blink 1s infinite;';
      myStatusBar.appendChild(correctionIndicator);
    }
    
    if (socket && socket.connected) {
      socket.emit('correction_request', { 
        channel, 
        active: true,
        requester: myRole,
        requesterRole: `steno${myRole}`
      });
    }
    
    console.log('[교정 요청] 활성화됨 (2초 후 자동 해제)');
    
    correctionRequestTimeout = setTimeout(() => {
      const correctionIndicator = document.querySelector('.correction-request');
      if (correctionIndicator) {
        correctionIndicator.remove();
      }
      
      if (socket && socket.connected) {
        socket.emit('correction_request', { 
          channel, 
          active: false,
          requester: myRole,
          requesterRole: `steno${myRole}`
        });
      }
      
      correctionRequestTimeout = null;
      console.log('[교정 요청] 자동 해제됨');
    }, 2000);
    
  } catch (error) {
    console.error('[교정 요청] 에러:', error);
  }
}

// 전역 키 이벤트 처리
document.addEventListener('keydown', (e) => {
  const keyName = e.key;
  
  if (keyName === 'F5') {
    e.preventDefault();
    return;
  }
  
  if (keyName === 'F4' && document.activeElement === myEditor) {
    e.preventDefault();
    deleteWordBackward();
    return;
  }
  
  if (keyName === 'F6') {
    e.preventDefault();
    offerRole();
  } else if (keyName === 'F7') {
    e.preventDefault();
    requestRole();
  } else if (keyName === 'F8') {
    e.preventDefault();
    if (!isHtmlMode && myRole === activeStenographer) {
      requestCorrection();
    }
  }
});

// F4 단어삭제 기능
function deleteWordBackward() {
  const editor = myEditor;
  const text = editor.value;
  const cursorPos = editor.selectionStart;
  
  if (cursorPos === 0) return;
  
  const beforeCursor = text.substring(0, cursorPos);
  const afterCursor = text.substring(cursorPos);
  
  const currentChar = beforeCursor[beforeCursor.length - 1];
  
  if (currentChar === ' ') {
    const newText = beforeCursor.slice(0, -1) + afterCursor;
    editor.value = newText;
    editor.setSelectionRange(cursorPos - 1, cursorPos - 1);
  } else {
    const lastSpaceIndex = beforeCursor.lastIndexOf(' ');
    const deleteStartPos = lastSpaceIndex + 1;
    
    const newText = text.substring(0, deleteStartPos) + afterCursor;
    editor.value = newText;
    editor.setSelectionRange(deleteStartPos, deleteStartPos);
  }
  
  // HTML 모드, 1인 모드, 또는 권한자인 경우 뷰어 업데이트
  if (isHtmlMode) {
    updateViewerFromEditor();
  } else if (isSoloMode() || myRole === activeStenographer) {
    updateViewerWithCurrentInput();
  }
  
  // 서버에 변경사항 전송
  if (!isHtmlMode && socket && socket.connected) {
    socket.emit('steno_input', { 
      channel: channel, 
      role: `steno${myRole}`, 
      text: editor.value 
    });
    lastSentText = editor.value;
  }
}

// 전체 텍스트 다운로드
function downloadFullText() {
  if (!fullTextStorage) {
    alert('다운로드할 텍스트가 없습니다.');
    return;
  }
  
  const blob = new Blob([fullTextStorage], { type: 'text/plain; charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `steno-full-text-${channel}-${new Date().toISOString().split('T')[0]}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  
  console.log(`[전체 텍스트 다운로드] ${fullTextStorage.length}자`);
}

// Socket.io 초기화
const params = new URLSearchParams(window.location.search);
const channel = params.get('channel') || 'default';
let myRole = null;  // 서버가 할당할 때까지 대기
let isInitialized = false;

const channelInfo = document.getElementById('channelInfo');
const roleInfo = document.getElementById('roleInfo');
const statusInfo = document.getElementById('statusInfo');

let isHtmlMode = true;
let socket = null;

try {
  if (typeof io !== 'undefined') {
    socket = io();
    isHtmlMode = false;
  }
} catch (error) {
  console.log('Socket.io 연결 실패, HTML 모드로 실행');
  isHtmlMode = true;
}

channelInfo.textContent = channel;
roleInfo.textContent = isHtmlMode ? '속기사1' : '역할 대기중...';
statusInfo.textContent = isHtmlMode ? 'HTML 모드' : '접속 중';

let stenoList = [];
let activeStenographer = null;
let isConnected = false;
let myColId = 'editor1';
let otherColId = 'editor2';
let myColNum = 1;
let otherColNum = 2;
let myEditor, otherEditor;
let myBadge, otherBadge, myColDiv, otherColDiv, myStatus, otherStatus, myDot, otherDot;
let matchWordCount = 3;

let lastMyInput = '';
let lastOtherInput = '';

const matchWordSelect = document.getElementById('matchWordSelect');
if (matchWordSelect) {
  matchWordSelect.value = '3';
  matchWordSelect.onchange = function() {
    const newCount = parseInt(this.value);
    if (newCount >= 3) {
      matchWordCount = newCount;
    } else {
      this.value = '3';
      matchWordCount = 3;
    }
  };
}

// Socket.io 이벤트들 (HTML 모드가 아닐 때만)
if (!isHtmlMode && socket) {
  socket.emit('join_channel', { 
    channel, 
    role: 'steno',  // 항상 'steno'로 보냄
    requestSync: true,
    currentInput: ''  // 초기에는 빈 값
  });

  // 역할 할당 수신
  socket.on('role_assigned', ({ role }) => {
    console.log('[역할 할당] 서버로부터 역할 받음:', role);
    
    const newRole = role === 'steno1' ? '1' : '2';
    
    // 역할 변경 감지
    if (myRole && myRole !== newRole) {
      console.warn('[역할 변경] 기존:', myRole, '→ 새로운:', newRole);
      isInitialized = false;
    }
    
    myRole = newRole;
    roleInfo.textContent = `속기사${myRole}`;
    
    // 첫 번째 초기화
    if (!isInitialized) {
      // activeStenographer 초기값 보장
      if (!activeStenographer) {
        activeStenographer = '1';  // 기본값 설정
      }
      initializeDOMReferences();
      initializeComponents();
      isInitialized = true;
      updateStatus();
      console.log('[초기화 완료] 역할:', myRole, '활성:', activeStenographer);
    }
    
    // 입장 시 내 현재 입력 상태를 파트너에게 즉시 공유
    if (myEditor && myEditor.value) {
      setTimeout(() => {
        socket.emit('steno_input', { 
          channel, 
          role: `steno${myRole}`, 
          text: myEditor.value,
          isSync: true  // 동기화 플래그
        });
        console.log('[입장 동기화] 내 입력 상태 공유');
      }, 500);
    }
  });

  // 활성 역할 업데이트 (서버에서 보내는 이벤트)
  socket.on('active_role', ({ active }) => {
    // 교대 처리 중이면 무시 (switch_role 처리 완료 후 반영)
    if (isProcessingSwitch) {
      console.log('[활성 역할] 교대 처리 중 - 지연 처리');
      return;
    }
    
    const newActive = active === 'steno1' ? '1' : '2';
    console.log('[활성 역할] 서버 업데이트:', active, '→', newActive);
    activeStenographer = newActive;
    updateStatus(); // applyEditorLocks() 포함
  });

  socket.on('steno_list', ({ stenos }) => {
    console.log('[속기사 목록] 업데이트:', stenos);
    
    const wasCollaboration = isCollaborationMode();
    const wasSolo = isSoloMode();
    const previousCount = stenoList.length;
    
    stenoList = stenos;
    
    const nowCollaboration = isCollaborationMode();
    const nowSolo = isSoloMode();
    const currentCount = stenoList.length;
    
    console.log('[모드 상태]', {
      이전: wasCollaboration ? '2인' : '1인',
      현재: nowCollaboration ? '2인' : '1인',
      내역할: myRole,
      활성자: activeStenographer,
      목록: stenos
    });
    
    updateMode();
    
    // 역할이 할당된 경우에만 상태 업데이트
    if (myRole) {
      updateStatus();
      updateUtilityStatus();
    }
    
    // 1인 모드로 전환 시 내가 자동으로 권한자가 됨
    if (nowSolo && !wasSolo && myRole) {
      activeStenographer = myRole;
      console.log('[1인 모드] 자동 권한자 설정:', myRole);
    }
    
    // 새로운 파트너 입장 감지 (1→2명)
    if (currentCount === 2 && previousCount < 2) {
      console.log('[파트너 입장] 새 파트너 감지, 내 입력 상태 공유');
      
      // 내 현재 입력 상태를 새 파트너에게 즉시 공유
      if (myEditor && myEditor.value) {
        setTimeout(() => {
          socket.emit('steno_input', { 
            channel, 
            role: `steno${myRole}`, 
            text: myEditor.value,
            isSync: true  // 동기화 플래그
          });
          console.log('[파트너 동기화] 내 입력 전송:', myEditor.value.length, '자');
        }, 300);  // 약간의 지연으로 안정성 확보
      }
    }
    
    // 상대방이 나갔을 때 입력창 초기화
    if (stenoList.length < 2 && otherEditor) {
      otherEditor.value = '';
      console.log('[상대방 퇴장] 입력창 초기화');
      
      // 1인 모드에서는 뷰어 계속 업데이트
      if (nowSolo) {
        updateViewerContent();
      }
    }
  });

  // 🆕 ACK 기반 text_broadcast 처리
  socket.on('text_broadcast', ({ version, text }) => {
    console.log('[text_broadcast 수신]', {
      버전: version,
      텍스트길이: text?.length || 0,
      현재버전: lastAppliedVersion
    });
    
    // 버전 필터링
    if (version <= lastAppliedVersion) {
      console.log('[text_broadcast] 오래된 버전 무시:', version);
      return;
    }
    
    // 버전 업데이트
    lastAppliedVersion = version;
    
    // 누적 텍스트 갱신
    accumulatedText = text || '';
    fullTextStorage = accumulatedText;
    
    // 뷰어 렌더링
    updateMonitoringFromText(accumulatedText);
    updateViewerContent();
    
    // ACK 대기 해제
    isWaitingForAck = false;
    
    // 대기 중이던 텍스트가 있으면 전송
    if (pendingSendText && myEditor) {
      console.log('[ACK 수신] 대기 중이던 텍스트 전송');
      myEditor.value = pendingSendText;
      pendingSendText = '';
      sendToMonitor();
    }
  });

  socket.on('sync_accumulated', ({ accumulatedText: serverAccum }) => {
    accumulatedText = serverAccum || '';
    fullTextStorage = accumulatedText;
    updateMonitoringFromText(accumulatedText);
    updateViewerContent();
    console.log('[누적 텍스트 동기화]', accumulatedText.length, '자');
  });

  // 활성 속기사의 입력 수신 (뷰어에 표시 + 파트너 화면 업데이트)
  socket.on('steno_input', ({ role, text, isSync }) => {
    const senderRole = role.replace('steno', '');
    
    console.log('[steno_input 수신]', {
      발신자역할: senderRole,
      내역할: myRole,
      텍스트길이: text.length,
      활성자: activeStenographer,
      동기화: isSync
    });
    
    // 자기 자신의 입력은 무시
    if (senderRole === myRole) {
      console.log('[입력 무시] 자기 자신의 입력');
      return;
    }
    
    if (isViewerEditing && myRole !== activeStenographer) {
      console.log('[입력 보호] 뷰어 편집 중 - 상대방 입력 무시');
      return;
    }
    
    // 파트너의 입력창 항상 실시간 업데이트 (권한 무관)
    if (isCollaborationMode() && otherEditor) {
      otherEditor.value = text;
      trimEditorText(otherEditor);
      otherEditor.scrollTop = otherEditor.scrollHeight;
      console.log('[파트너 화면] 실시간 업데이트:', text.length, '자');
    }
    
    // 활성 속기사의 입력이면 뷰어도 업데이트 (한 단어 지연)
    if (senderRole === activeStenographer) {
      updateViewerWithOtherInput(text);
    }
    
    // 2인 모드에서 단어 매칭 체크
    if (isCollaborationMode() && !isProcessingSwitch) {  // 교대 중이 아닐 때만
      if (myRole === activeStenographer && senderRole !== activeStenographer) {
        // 권한자: 대기자 입력으로 매칭 체크
        checkWordMatchingAsActive();
      } else if (myRole !== activeStenographer && senderRole === activeStenographer) {
        // 대기자: 권한자 입력으로 매칭 체크
        checkWordMatchingAsWaiting();
      }
    }
  });

  // 파트너 입력 수신 (대기 중인 속기사의 입력)
  socket.on('partner_input', ({ role, text }) => {
    const senderRole = role.replace('steno', '');
    
    console.log('[partner_input 수신]', {
      발신자역할: senderRole,
      내역할: myRole,
      텍스트길이: text.length
    });
    
    // 자기 자신의 입력은 무시
    if (senderRole === myRole) return;
    
    // 상대방 입력창 실시간 업데이트
    if (otherEditor) {
      otherEditor.value = text;
      trimEditorText(otherEditor);
      otherEditor.scrollTop = otherEditor.scrollHeight;
      console.log('[파트너 화면] 대기자 입력 실시간 업데이트');
    }
    
    // 대기자 입력으로 매칭 체크
    if (isCollaborationMode() && !isProcessingSwitch) {  // 교대 중이 아닐 때만
      if (myRole === activeStenographer) {
        // 권한자가 대기자 입력 받음
        checkWordMatchingAsActive();
      } else {
        // 대기자끼리는 매칭 체크 안 함
      }
    }
  });

  // 🔥 핵심 수정: switch_role 핸들러 - 이전 권한자 완전 초기화 보장
  socket.on('switch_role', ({ 
    newActive, 
    matchedText, 
    accumulatedText: serverAccumulated,
    previousActive,  // 서버가 보낸 이전 권한자
    manual, 
    matchStartIndex, 
    matchWordCount: serverMatchCount,
    ts  // 타임스탬프 추가
  }) => {
    try {
      console.log('[권한 전환 수신] ==================', {
        새권한자: newActive,
        이전권한자: previousActive,
        누적길이: matchedText?.length || 0,
        수동여부: manual,
        매칭정보: { startIdx: matchStartIndex, wordCount: serverMatchCount },
        시간: ts
      });
      
      // 1. 편집 모드 중이면 취소
      if (isViewerEditing) {
        console.log('[권한 전환] 뷰어 편집 모드 취소');
        cancelViewerEdit();
      }
      
      // 2. 누적 텍스트 확정 (서버에서 온 값 신뢰)
      if (matchedText) {
        accumulatedText = matchedText;
        fullTextStorage = matchedText;
        updateMonitoringFromText(accumulatedText);
        console.log('[권한 전환] 누적 텍스트 갱신:', accumulatedText.length, '자');
      }
      
      // 3. 이전 권한자 판정 (서버가 보낸 previousActive 사용)
      const prevActiveNum = previousActive === 'steno1' ? '1' : '2';
      const newActiveNum = newActive === 'steno1' ? '1' : '2';
      
      // 4. 역할 전환 전 상태 캡처
      const wasIPreviousActive = (myRole === prevActiveNum);
      const willIBeNewActive = (myRole === newActiveNum);
      
      console.log('[권한 전환] 역할 상태:', {
        내역할: myRole,
        이전권한자였음: wasIPreviousActive,
        새권한자될예정: willIBeNewActive
      });
      
      // 5. activeStenographer 업데이트
      activeStenographer = newActiveNum;
      
      // 6. 입력창 처리 (핵심 로직)
      // 6-1. 이전 권한자 → 새 대기자: 완전 하드 리셋
      if (wasIPreviousActive && !willIBeNewActive) {
        console.log('[권한 전환] 이전 권한자 → 대기자 전환: 완전 초기화');
        
        if (myEditor) {
          // 입력창 완전 비우기
          myEditor.value = '';
          
          // 모든 버퍼 초기화
          lastSentText = '';
          lastMyInput = '';
          lastSendTime = Date.now();
          
          // 전송 타이머 취소
          if (sendInputTimeout) {
            clearTimeout(sendInputTimeout);
            sendInputTimeout = null;
          }
          
          // 입력 최적화 카운터 리셋
          inputOptimizationCounter = 0;
          
          // 스크롤, 커서 위치 초기화
          myEditor.scrollTop = 0;
          myEditor.setSelectionRange(0, 0);
          
          // 추가 보장: 100ms 후 재확인
          setTimeout(() => {
            if (myEditor && myEditor.value !== '') {
              console.warn('[권한 전환] 재초기화 필요');
              myEditor.value = '';
              lastSentText = '';
            }
          }, 100);
        }
        
        console.log('[권한 전환] 이전 권한자 초기화 완료');
      }
      
      // 6-2. 이전 대기자 → 새 권한자: 매칭된 부분 제거
      if (!wasIPreviousActive && willIBeNewActive) {
        console.log('[권한 전환] 대기자 → 권한자 전환: 매칭 부분 제거');
        
        if (!manual && myEditor) {
          // 자동 매칭: 매칭된 구간 제거
          if (typeof matchStartIndex === 'number' && typeof serverMatchCount === 'number' && serverMatchCount >= 3) {
            const txt = myEditor.value;
            const spaces = [];
            
            // 공백 위치 찾기
            for (let i = 0; i < txt.length; i++) {
              if (txt[i] === ' ') spaces.push(i);
            }
            
            // 매칭 구간의 끝 위치 계산
            if (spaces.length >= matchStartIndex + serverMatchCount) {
              const endPos = spaces[matchStartIndex + serverMatchCount - 1] + 1;
              const tail = txt.substring(endPos).trim();  // 매칭 이후 잔여 텍스트
              
              console.log('[권한 전환] 자동 매칭 - 잔여 텍스트 처리:', {
                원본: txt.substring(0, 50),
                잔여: tail.substring(0, 50),
                매칭구간: txt.substring(0, endPos)
              });
              
              myEditor.value = tail;
              myEditor.setSelectionRange(tail.length, tail.length);
              lastSentText = tail;  // 새 권한자의 마지막 전송 텍스트 갱신
              lastSendTime = Date.now();
            } else {
              // 매칭 정보 부족 시 입력창 유지
              console.log('[권한 전환] 매칭 정보 부족 - 입력창 유지');
              lastSentText = myEditor.value;
            }
          } else {
            // 매칭 정보 없음 (수동 전환 등)
            console.log('[권한 전환] 매칭 정보 없음 - 입력창 유지');
            lastSentText = myEditor.value;
          }
        } else if (manual && myEditor) {
          // 수동 전환: 대기자 입력창 그대로 유지
          console.log('[권한 전환] 수동 전환 - 새 권한자 입력창 유지');
          lastSentText = myEditor.value;
        }
        
        // 새 권한자 포커스
        if (myEditor) {
          myEditor.focus();
        }
      }
      
      // 7. 상대방 입력창 표시 (항상 비우기)
      if (otherEditor) {
        otherEditor.value = '';
        console.log('[권한 전환] 상대방 표시창 초기화');
      }
      
      // 8. 권한 및 UI 갱신
      applyEditorLocks();
      updateStatus();
      updateViewerContent();

      // 포커스 자동 복구
      if (myEditor) requestAnimationFrame(() => { 
        if (document.activeElement !== myEditor) myEditor.focus();
      });
      
      // 9. 교대 처리 플래그 해제
      isProcessingSwitch = false;
      lastSwitchTime = Date.now();
      
      // 10. 수동 전환 플래그 해제
      if (manual) {
        isSwitchingRole = false;
        setTimeout(() => {
          manualSwitchCooldown = false;
        }, 200);
        console.log('[수동 전환] 처리 완료');
      }
      
      console.log('[권한 전환] 전체 처리 완료 ==================');
      
    } catch (error) {
      console.error('[switch_role 처리 에러]:', error);
      isSwitchingRole = false;
      manualSwitchCooldown = false;
      isProcessingSwitch = false;
    }
  });
  
  // 채팅 메시지 수신
  socket.on('chat_message', ({ sender, message, timestamp }) => {
    const mySenderName = `속기사${myRole}`;
    // 자기 자신이 보낸 메시지가 아닐 때만 추가
    if (sender !== mySenderName) {
      const chatMsg = {
        sender: sender,
        message: message,
        timestamp: timestamp || new Date().toISOString(),
        isMine: false,
        isQuick: message?.startsWith('[빠른 메시지]')
      };
      
      addChatMessage(chatMsg);
      console.log('[채팅 수신]', sender, ':', message);
    }
  });
  
  // 핑 응답
  socket.on('pong_test', () => {
    // checkConnection 함수에서 처리됨
  });
  
  // 강제 권한 전환
  socket.on('force_role_switch', ({ newActive, previousActive }) => {
    const prevActiveNum = previousActive === 'steno1' ? '1' : '2';
    const newActiveNum = newActive === 'steno1' ? '1' : '2';
    
    activeStenographer = newActiveNum;
    updateStatus();
    
    // 이전 권한자였으면 완전 초기화
    if (myRole === prevActiveNum) {
      console.log('[강제 권한 상실] 권한이 이동했습니다.');
      if (myEditor) {
        myEditor.value = '';
        lastSentText = '';
        lastMyInput = '';
        lastSendTime = Date.now();
        
        // 전송 타이머 취소
        if (sendInputTimeout) {
          clearTimeout(sendInputTimeout);
          sendInputTimeout = null;
        }
        
        inputOptimizationCounter = 0;
        myEditor.scrollTop = 0;
        myEditor.setSelectionRange(0, 0);
      }
    } else if (myRole === newActiveNum) {
      console.log('[강제 권한 획득] 권한을 가져왔습니다.');
      if (myEditor) myEditor.focus();
    }
  });

  // 교정 요청 수신 처리
  socket.on('correction_request', ({ active, requester, requesterRole }) => {
    if (requester !== myRole) {
      const otherStatusBar = document.getElementById('statusBar' + otherColNum);
      if (otherStatusBar) {
        const existingRequest = otherStatusBar.querySelector('.correction-request-notify');
        
        if (active && !existingRequest) {
          const notifyIndicator = document.createElement('span');
          notifyIndicator.className = 'correction-request-notify';
          notifyIndicator.textContent = '교정 요청 받음';
          notifyIndicator.style.cssText = 'color: #ff8c00; font-weight: bold; margin-left: 16px; animation: blink 1s infinite;';
          otherStatusBar.appendChild(notifyIndicator);
          
          if (myRole !== activeStenographer) {
            const myStatusBar = document.getElementById('statusBar' + myColNum);
            if (myStatusBar) {
              const existingAlert = myStatusBar.querySelector('.correction-alert');
              if (!existingAlert) {
                const myNotify = document.createElement('span');
                myNotify.className = 'correction-alert';
                myNotify.textContent = '⚠️ 교정 요청';
                myNotify.style.cssText = 'color: #ff4500; font-weight: bold; margin-left: 16px;';
                myStatusBar.appendChild(myNotify);
              }
            }
          }
        } else if (!active) {
          if (existingRequest) existingRequest.remove();
          const myAlert = document.querySelector('.correction-alert');
          if (myAlert) myAlert.remove();
        }
      }
    }
  });
  
  // 텍스트 전송 수신 처리 (레거시 호환)
  socket.on('text_sent', ({ accumulatedText: newAccumulated, sender }) => {
    if (sender !== myRole) {
      accumulatedText = newAccumulated;
      fullTextStorage = newAccumulated;
      updateViewerContent();
      console.log(`[text_sent 수신] ${sender}가 텍스트 전송`);
    }
  });
  
  // 뷰어 편집 관련
  socket.on('viewer_edit_state', ({ isEditing, editorRole }) => {
    if (isEditing) {
      editorBeingEdited = editorRole;
      const editBtn = document.getElementById('viewerEditBtn');
      if (editBtn && editorRole !== `속기사${myRole}`) {
        editBtn.disabled = true;
        editBtn.title = `${editorRole}가 편집 중입니다`;
      }
      
      if (editorRole === `속기사${myRole}`) {
        enterEditMode();
      }
    } else {
      editorBeingEdited = null;
      const editBtn = document.getElementById('viewerEditBtn');
      if (editBtn) {
        editBtn.disabled = false;
        editBtn.title = '뷰어 편집';
      }
      
      if (isViewerEditing) {
        exitEditMode();
      }
    }
  });
  
  socket.on('viewer_edit_denied', ({ reason }) => {
    alert(`편집 불가: ${reason}`);
    exitEditMode();
  });
  
  socket.on('viewer_content_updated', ({ accumulatedText: newAccumulated, editorRole }) => {
    accumulatedText = newAccumulated;
    fullTextStorage = newAccumulated;
    updateViewerContent();
    console.log(`[뷰어 편집] ${editorRole}가 뷰어 내용을 수정했습니다.`);
  });
  
  // 동기화 체크 수신
  socket.on('sync_check', ({ activeStenographer: serverActive, accumulatedLength }) => {
    // 서버와 클라이언트 상태 비교
    if (accumulatedText.length !== accumulatedLength) {
      console.log('[동기화 체크] 누적 텍스트 길이 불일치, 재동기화 요청');
      socket.emit('request_sync', { channel });
    }
  });
  
  // 백업 상태 저장 응답
  socket.on('backup_saved', ({ success }) => {
    if (success) {
      console.log('[백업] 서버에 상태 저장 완료');
    }
  });
  
  // Keep-alive 응답
  socket.on('keep_alive_ack', () => {
    // 연결 상태 확인됨
  });
  
  socket.on('connect', () => {
    isConnected = true;
    statusInfo.textContent = '접속 중';
    console.log('[소켓 연결] 성공, Socket ID:', socket.id);
    updateUtilityStatus();
    
    // 연결 복구 시 현재 입력 상태 즉시 공유
    if (myRole && myEditor && myEditor.value && isCollaborationMode()) {
      setTimeout(() => {
        socket.emit('steno_input', { 
          channel, 
          role: `steno${myRole}`, 
          text: myEditor.value,
          isSync: true
        });
        console.log('[연결 복구] 입력 상태 공유:', myEditor.value.length, '자');
      }, 1000);
    }
  });

  socket.on('disconnect', () => {
    isConnected = false;
    statusInfo.textContent = '연결 끊김';
    console.log('[소켓 연결] 끊김');
    
    if (isViewerEditing) {
      console.log('[연결 끊김] 뷰어 편집 모드 자동 해제');
      cancelViewerEdit();
    }
    
    if (myStatus && otherStatus) {
      myStatus.textContent = '연결 끊김';
      otherStatus.textContent = '연결 끊김';
      myDot.className = 'status-dot disconnected';
      otherDot.className = 'status-dot disconnected';
    }
    updateUtilityStatus();
  });

  socket.on('reconnect', () => {
    console.log('[재연결] 시작');
    
    // 기존 데이터 백업
    const backupData = {
      myText: myEditor?.value || '',
      otherText: otherEditor?.value || '',
      accumulated: accumulatedText,
      full: fullTextStorage
    };
    
    // 채널 재가입
    myRole = null;
    isInitialized = false;
    roleInfo.textContent = '역할 대기중...';
    
    socket.emit('join_channel', { 
      channel, 
      role: 'steno',
      requestSync: true,
      lastData: {
        accumulated: accumulatedText,
        myInput: myEditor?.value || ''
      }
    });
    
    // 재연결 후 내 입력 상태 복구 및 공유
    setTimeout(() => {
      if (myEditor && backupData.myText) {
        myEditor.value = backupData.myText;
        
        // 재연결 후 파트너에게 내 입력 상태 즉시 공유
        if (socket.connected) {
          socket.emit('steno_input', { 
            channel, 
            role: `steno${myRole}`, 
            text: backupData.myText,
            isSync: true
          });
          console.log('[재연결 동기화] 내 입력 상태 복구 및 공유');
        }
      }
      
      if (!accumulatedText && backupData.accumulated) {
        console.log('[복구] 로컬 백업 데이터 사용');
        accumulatedText = backupData.accumulated;
        fullTextStorage = backupData.full;
        updateViewerContent();
      }
    }, 3000);
  });
}

function enterEditMode() {
  isViewerEditing = true;
  const viewer = document.getElementById('viewer');
  const viewerContent = document.getElementById('viewerContent');
  const editBtn = document.getElementById('viewerEditBtn');
  if (viewer) viewer.classList.add('editing');
  if (viewerContent) {
    viewerContent.contentEditable = 'true';
    viewerContent.focus();
    viewerContent.scrollTop = 0;
  }
  if (editBtn) {
    editBtn.textContent = '완료';
    editBtn.classList.add('editing');
  }
  console.log('[뷰어 편집] 편집 모드 시작');
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
  loadUserSettings();
  
  // HTML 모드일 때만 즉시 초기화
  if (isHtmlMode) {
    myRole = '1';
    roleInfo.textContent = `속기사${myRole}`;
    stenoList = ['steno1'];
    activeStenographer = '1';
    
    initializeDOMReferences();
    initializeComponents();
    updateMode();
    updateStatus();
  }
  // Socket 모드에서는 role_assigned 이벤트 대기
  
  // 텍스트 설정 UI 초기화
  setTimeout(() => {
    if (textSettings) {
      const fontSizeRange = document.getElementById('fontSizeRange');
      const lineHeightRange = document.getElementById('lineHeightRange');
      const letterSpacingRange = document.getElementById('letterSpacingRange');
      const wordSpacingRange = document.getElementById('wordSpacingRange');
      
      if (fontSizeRange) fontSizeRange.value = textSettings.fontSize;
      if (lineHeightRange) lineHeightRange.value = textSettings.lineHeight * 10;
      if (letterSpacingRange) letterSpacingRange.value = textSettings.letterSpacing;
      if (wordSpacingRange) wordSpacingRange.value = textSettings.wordSpacing;
      updateTextSettings();
    }
  }, 500);
  
  // 비정상 종료 감지
  window.addEventListener('beforeunload', (e) => {
    if (accumulatedText && accumulatedText.length > 100) {
      // 긴급 저장
      localStorage.setItem(`steno_emergency_${channel}`, JSON.stringify({
        accumulated: accumulatedText,
        full: fullTextStorage,
        timestamp: Date.now()
      }));
      
      e.preventDefault();
      e.returnValue = '작업 중인 텍스트가 있습니다. 정말 나가시겠습니까?';
    }
  });
  
  // 상태 모니터링 (1분마다)
  setInterval(() => {
    const stats = {
      연결: socket?.connected ? '정상' : '끊김',
      누적: accumulatedText.length + '자',
      메모리: performance.memory ? 
        Math.round(performance.memory.usedJSHeapSize / 1048576) + 'MB' : 'N/A',
      세션: Math.floor((Date.now() - sessionStart) / 60000) + '분'
    };
    console.log('[상태]', stats);
  }, 60000);
});

// 자동 저장 기능
let lastSaveData = null;
let lastBackupTime = 0;
let sessionStart = Date.now();

function enableAutoSave() {
  // 30초마다 저장
  setInterval(() => {
    try {
      const saveData = {
        channel: channel,
        role: myRole,
        timestamp: new Date().toISOString(),
        
        // 핵심 데이터
        editor1Text: document.getElementById('editor1')?.value || '',
        editor2Text: document.getElementById('editor2')?.value || '',
        accumulatedText: accumulatedText || '',
        fullTextStorage: fullTextStorage || '',
        activeStenographer: activeStenographer,
        
        // 설정
        activeTab: document.querySelector('.tab-btn.active')?.textContent || '설정',
        fontSize1: fontSizes[0],
        fontSize2: fontSizes[1],
        viewerFontSize: viewerFontSize,
        textSettings: textSettings,
        chatMessages: chatMessages,
        
        // 체크섬
        checksum: (accumulatedText + fullTextStorage).length
      };
      
      const currentDataStr = JSON.stringify(saveData);
      if (lastSaveData !== currentDataStr) {
        localStorage.setItem(`steno_autosave_${channel}`, currentDataStr);
        lastSaveData = currentDataStr;
        console.log(`[자동저장] ${new Date().toLocaleTimeString()}`);
      }
      
      // 5분마다 서버 백업
      if (socket?.connected && Date.now() - lastBackupTime >= 300000) {
        socket.emit('backup_state', {
          channel,
          accumulated: accumulatedText,
          checksum: saveData.checksum
        });
        lastBackupTime = Date.now();
        console.log('[서버 백업] 완료');
      }
      
    } catch (error) {
      console.error('[자동저장 실패]', error);
    }
  }, 30000);
}

function checkAutoSave() {
  try {
    const saved = localStorage.getItem(`steno_autosave_${channel}`);
    if (!saved) return;
    
    const data = JSON.parse(saved);
    const savedTime = new Date(data.timestamp);
    const now = new Date();
    const diffMinutes = (now - savedTime) / 1000 / 60;
    
    if (diffMinutes < 30) {
      console.log(`[자동저장] ${Math.floor(diffMinutes)}분 전 데이터 복구`);
      
      if (data.editor1Text) {
        const editor1 = document.getElementById('editor1');
        if (editor1) editor1.value = data.editor1Text;
      }
      
      if (data.editor2Text) {
        const editor2 = document.getElementById('editor2');
        if (editor2) editor2.value = data.editor2Text;
      }
      
      if (data.accumulatedText) {
        accumulatedText = data.accumulatedText;
      }
      
      if (data.fullTextStorage) {
        fullTextStorage = data.fullTextStorage;
      }
      
      if (data.fontSize1) fontSizes[0] = data.fontSize1;
      if (data.fontSize2) fontSizes[1] = data.fontSize2;
      if (data.viewerFontSize) viewerFontSize = data.viewerFontSize;
      
      if (data.textSettings) {
        textSettings = data.textSettings;
      }
      
      if (data.chatMessages) {
        chatMessages = data.chatMessages;
        chatMessages.forEach(msg => addChatMessage(msg));
      }
      
      if (isHtmlMode) {
        updateViewerFromEditor();
      } else {
        updateViewerContent();
      }
      
      console.log('[자동저장] 복구 완료!');
      
      // 서버 동기화
      if (!isHtmlMode && socket && socket.connected && myEditor && myRole) {
        if (myEditor.value) {
          socket.emit('steno_input', { 
            channel: channel, 
            role: `steno${myRole}`, 
            text: myEditor.value 
          });
          console.log('[자동저장] 서버에 복구 텍스트 동기화');
        }
      }
    }
    
    // 긴급 저장 확인
    const emergency = localStorage.getItem(`steno_emergency_${channel}`);
    if (emergency) {
      const eData = JSON.parse(emergency);
      if (Date.now() - eData.timestamp < 3600000) { // 1시간 이내
        if (!accumulatedText || accumulatedText.length < eData.accumulated.length) {
          accumulatedText = eData.accumulated;
          fullTextStorage = eData.full;
          updateViewerContent();
          console.log('[복구] 긴급 저장 데이터 복구');
        }
      }
      localStorage.removeItem(`steno_emergency_${channel}`);
    }
    
  } catch (error) {
    console.error('[자동저장 복구 실패]', error);
  }
}

// 연결 유지 함수
let keepAliveInterval;
function startKeepAlive() {
  if (keepAliveInterval) clearInterval(keepAliveInterval);
  
  keepAliveInterval = setInterval(() => {
    if (socket?.connected) {
      socket.emit('keep_alive', {
        channel,
        role: myRole,
        dataCheck: accumulatedText.length
      });
    }
  }, 20000); // 20초마다
}

// 자동 저장 시작
enableAutoSave();

// 연결 유지 시작
startKeepAlive();

// 페이지 로드 완료 후 복구 확인
setTimeout(checkAutoSave, 1000);

// 주기적인 연결 상태 체크
setInterval(() => {
  if (!isHtmlMode) {
    checkConnection();
  }
}, 30000); // 30초마다

// window 객체에 함수들 바인딩
window.adjustFontSize = adjustFontSize;
window.adjustViewerFontSize = adjustViewerFontSize;
window.switchTab = function(tabName) {
  switchTab(tabName, window.event);
};
window.updateTextSettings = updateTextSettings;
window.sendChatMessage = sendChatMessage;
window.sendQuickMessage = sendQuickMessage;
window.downloadFullText = downloadFullText;
window.offerRole = offerRole;
window.requestRole = requestRole;
window.forceGetRole = forceGetRole;
window.checkConnection = checkConnection;
window.clearLocalStorage = clearLocalStorage;
window.setTheme = setTheme;
window.toggleViewerEdit = toggleViewerEdit;

// 우클릭 막기
document.addEventListener('contextmenu', event => event.preventDefault());

// F12 및 개발자 도구 단축키 차단
document.addEventListener('keydown', function(e) {
  if (
    e.key === 'F12' ||
    (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'C')) ||
    (e.ctrlKey && e.key === 'U')
  ) {
    e.preventDefault();
  }
});

// 토스트 메시지용 CSS 애니메이션 추가
if (!document.getElementById('toast-styles')) {
  const style = document.createElement('style');
  style.id = 'toast-styles';
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeOut {
      from { opacity: 1; transform: translateY(0); }
      to { opacity: 0; transform: translateY(20px); }
    }
  `;
  document.head.appendChild(style);
}
