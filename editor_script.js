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

// 엔터키 모드 관리
let enterMode = 'newline'; // 'newline' 또는 'send'

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
  }
  console.log('[DOM 참조] 초기화 완료 - myRole:', myRole, 'myColNum:', myColNum);
}

// 컴포넌트 초기화 함수
function initializeComponents() {
  initializeDOMReferences();
  
  if (myEditor) myEditor.style.fontSize = fontSizes[myColNum-1] + 'px';
  if (otherEditor) otherEditor.style.fontSize = fontSizes[otherColNum-1] + 'px';
  
  if (myEditor) {
    myEditor.oninput = handleInputChange;
    myEditor.onblur = () => {
      if (sendInputTimeout && myRole === activeStenographer) {
        clearTimeout(sendInputTimeout);
        sendInputTimeout = null;
        
        const currentText = myEditor.value;
        if (currentText !== lastSentText) {
          socket.emit('steno_input', { channel, role: `steno${myRole}`, text: currentText });
          lastSentText = currentText;
          lastSendTime = Date.now();
        }
      }
    };
    
    myEditor.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (e.shiftKey) {
          e.preventDefault();
          toggleEnterMode();
        } else if (enterMode === 'send') {
          e.preventDefault();
          
          if (isHtmlMode || myRole === activeStenographer) {
            sendToMonitor();
          }
        }
      }
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
function switchTab(tabName) {
  if (tabName === 'chat') {
    unreadMessages = 0;
    updateChatBadge();
  }
  
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  
  event.target.classList.add('active');
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
    myStatus.className = 'status-indicator bad';
    pingStatus.textContent = '-ms';
    return;
  }
  
  myStatus.textContent = '정상';
  myStatus.className = 'status-indicator good';
  
  const startTime = Date.now();
  socket.emit('ping_test', { channel });
  
  socket.once('pong_test', () => {
    const ping = Date.now() - startTime;
    pingStatus.textContent = ping + 'ms';
    pingStatus.className = ping < 100 ? 'status-indicator good' : 
                          ping < 300 ? 'status-indicator warning' : 'status-indicator bad';
  });
  
  if (isCollaborationMode()) {
    otherStatus.textContent = '연결됨';
    otherStatus.className = 'status-indicator good';
  } else {
    otherStatus.textContent = '없음';
    otherStatus.className = 'status-indicator';
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
  
  const editedLines = [];
  viewerContent.childNodes.forEach(node => {
    if (node.nodeName === 'DIV') {
      editedLines.push(node.textContent);
    } else if (node.nodeName === 'BR') {
      editedLines.push('');
    } else if (node.nodeType === Node.TEXT_NODE) {
      editedLines.push(node.textContent);
    } else if (node.nodeName === 'SPAN') {
      editedLines.push(node.textContent || '');
    }
  });
  const editedText = editedLines.join('\n');
  accumulatedText = editedText;
  fullTextStorage = editedText;
  isViewerEditing = false;
  viewer.classList.remove('editing');
  viewerContent.contentEditable = 'false';
  editBtn.textContent = '편집';
  editBtn.classList.remove('editing');
  
  if (socket && socket.connected) {
    socket.emit('viewer_edit_complete', { 
      channel, 
      editedText,
      editorRole: `속기사${myRole}`
    });
  }
  
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

// 뷰어 업데이트 함수들
function updateViewerFromEditor() {
  if (isViewerEditing) return;
  
  const viewerContent = document.getElementById('viewerContent');
  if (!viewerContent || !myEditor) return;
  
  const currentText = accumulatedText + myEditor.value;
  
  fullTextStorage = currentText;
  updateMonitoringFromText(currentText);
  const monitoringText = monitoringLines.join('\n');
  
  requestAnimationFrame(() => {
    viewerContent.innerHTML = monitoringText.split('\n').map(line => 
      `<span>${line}</span>`
    ).join('<br>') || '<span class="viewer-placeholder">자막이 여기에 표시됩니다.</span>';
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
      viewerContent.innerHTML = monitoringText.split('\n').map(line => 
        `<span>${line}</span>`
      ).join('<br>') || '<span class="viewer-placeholder">자막이 여기에 표시됩니다.</span>';
      viewerContent.scrollTop = viewerContent.scrollHeight;
      lastDisplayedText = monitoringText;
    });
  }
}

// 엔터키 모드 전환 함수
function toggleEnterMode() {
  enterMode = enterMode === 'newline' ? 'send' : 'newline';
  
  const modeIndicator = document.querySelector('.enter-mode-indicator');
  if (modeIndicator) {
    modeIndicator.textContent = enterMode === 'send' ? '[전송 모드]' : '[줄바꿈 모드]';
  } else {
    const myStatusBar = document.getElementById('statusBar' + myColNum);
    if (myStatusBar) {
      const indicator = document.createElement('span');
      indicator.className = 'enter-mode-indicator';
      indicator.textContent = enterMode === 'send' ? '[전송 모드]' : '[줄바꿈 모드]';
      indicator.style.cssText = 'color: #5a78ff; font-weight: bold; margin-left: 16px;';
      myStatusBar.appendChild(indicator);
    }
  }
  
  console.log(`[엔터 모드] ${enterMode === 'send' ? '전송' : '줄바꿈'} 모드로 전환`);
}

// 전송 모드에서 텍스트 전송
function sendToMonitor() {
  if (!myEditor || myEditor.value.trim() === '') return;
  
  accumulatedText += myEditor.value + '\n';
  fullTextStorage = accumulatedText;
  myEditor.value = '';
  
  if (isHtmlMode) {
    updateViewerFromEditor();
  } else {
    updateViewerContent();
    if (socket && socket.connected) {
      socket.emit('text_sent', { 
        channel, 
        accumulatedText,
        sender: myRole 
      });
    }
  }
  
  console.log('[전송 모드] 텍스트 전송 완료');
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
    updateViewerFromEditor();
  } else {
    sendInput();
  }
}

// 소켓 모드 전송
function sendInput() {
  if (!socket || isHtmlMode) return;
  
  if (shouldUpdateViewer()) {
    updateViewerWithCurrentInput();
  }
  
  if (myRole === activeStenographer) {
    if (sendInputTimeout) {
      clearTimeout(sendInputTimeout);
    }
    
    const currentText = myEditor.value;
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
  } else {
    if (socket.connected) {
      socket.emit('steno_input', { 
        channel: channel, 
        role: `steno${myRole}`, 
        text: myEditor.value 
      });
    }
  }
  
  if (isCollaborationMode() && myRole !== activeStenographer) {
    checkWordMatchingAsWaiting();
  }
  
  if (isCollaborationMode() && myRole === activeStenographer) {
    checkWordMatchingAsActive();
  }
}

// 뷰어 업데이트 with 입력
function updateViewerWithCurrentInput() {
  if (isViewerEditing) return;
  
  const viewerContent = document.getElementById('viewerContent');
  if (!viewerContent) return;
  
  let displayText = accumulatedText;
  if (myEditor.value.endsWith(' ')) {
    displayText = accumulatedText + myEditor.value;
  } else {
    const words = myEditor.value.split(' ');
    if (words.length > 1) {
      displayText = accumulatedText + words.slice(0, -1).join(' ') + ' ';
    }
  }
  
  fullTextStorage = displayText;
  updateMonitoringFromText(displayText);
  const monitoringText = monitoringLines.join('\n');
  
  requestAnimationFrame(() => {
    viewerContent.innerHTML = monitoringText.split('\n').map(line => 
      `<span>${line}</span>`
    ).join('<br>') || '<span class="viewer-placeholder">자막이 여기에 표시됩니다.</span>';
    viewerContent.scrollTop = viewerContent.scrollHeight;
    lastDisplayedText = monitoringText;
  });
}

function updateViewerWithOtherInput(otherText) {
  if (isViewerEditing) return;
  
  const viewerContent = document.getElementById('viewerContent');
  if (!viewerContent) return;
  
  let displayText = accumulatedText;
  if (otherText.endsWith(' ')) {
    displayText = accumulatedText + otherText;
  } else {
    const words = otherText.split(' ');
    if (words.length > 1) {
      displayText = accumulatedText + words.slice(0, -1).join(' ') + ' ';
    }
  }
  
  fullTextStorage = displayText;
  updateMonitoringFromText(displayText);
  const monitoringText = monitoringLines.join('\n');
  
  requestAnimationFrame(() => {
    viewerContent.innerHTML = monitoringText.split('\n').map(line => 
      `<span>${line}</span>`
    ).join('<br>') || '<span class="viewer-placeholder">자막이 여기에 표시됩니다.</span>';
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

function shouldUpdateViewer() {
  if (isSoloMode()) return true;
  return myRole === activeStenographer;
}

// 상태 업데이트
function updateStatus() {
  if (!myEditor || !otherEditor) return;
  
  const myStatusBar = document.getElementById('statusBar' + myColNum);
  if (myStatusBar && !document.querySelector('.enter-mode-indicator')) {
    const indicator = document.createElement('span');
    indicator.className = 'enter-mode-indicator';
    indicator.textContent = '[줄바꿈 모드]';
    indicator.style.cssText = 'color: #5a78ff; font-weight: bold; margin-left: 16px;';
    myStatusBar.appendChild(indicator);
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

// 단어 매칭 체크
function checkWordMatchingAsWaiting() {
  if (isHtmlMode) return;
  if (myRole === activeStenographer) return;
  
  const myWordsArr = myEditor.value.split(' ').filter(Boolean);
  
  if (!otherEditor.value) return;
  
  const currentViewerText = accumulatedText + otherEditor.value;
  
  for (let startIdx = 0; startIdx <= myWordsArr.length - matchWordCount; startIdx++) {
    const candidateWords = myWordsArr.slice(startIdx, startIdx + matchWordCount).join(' ');
    
    if (candidateWords && matchWordCount >= 3) {
      const trimmedViewer = currentViewerText.trim().toLowerCase();
      const trimmedCandidate = candidateWords.trim().toLowerCase();
      
      const activeEditorText = otherEditor.value.trim().toLowerCase();
      if (activeEditorText.includes(trimmedCandidate)) {
        const matchedPartFromActive = getMatchedTextUpToBySequence(otherEditor.value, candidateWords);
        
        if (matchedPartFromActive) {
          const fullMatchedText = accumulatedText + matchedPartFromActive;
          const newActive = myRole === '1' ? 'steno1' : 'steno2';
          
          if ((newActive === 'steno1' && activeStenographer === '1') || 
              (newActive === 'steno2' && activeStenographer === '2')) {
            return;
          }
          
          socket.emit('switch_role', { 
            channel: channel, 
            newActive: newActive, 
            matchedText: fullMatchedText,
            matchStartIndex: startIdx,
            matchWordCount: matchWordCount || 3
          });
          
          return;
        }
      }
    }
  }
}

function checkWordMatchingAsActive() {
  if (isHtmlMode) return;
  if (myRole !== activeStenographer) return;
  if (!otherEditor.value) return;
  
  const currentViewerText = accumulatedText + myEditor.value;
  const viewerWords = currentViewerText.trim().split(' ').filter(Boolean);
  
  if (viewerWords.length < matchWordCount) return;
  
  const viewerEndWords = viewerWords.slice(-matchWordCount).join(' ').toLowerCase();
  const otherWords = otherEditor.value.trim().split(' ').filter(Boolean);
  
  for (let startIdx = 0; startIdx <= otherWords.length - matchWordCount; startIdx++) {
    const candidateWords = otherWords.slice(startIdx, startIdx + matchWordCount).join(' ').toLowerCase();
    
    if (candidateWords === viewerEndWords) {
      const newActive = myRole === '1' ? 'steno2' : 'steno1';
      
      socket.emit('switch_role', { 
        channel, 
        newActive, 
        matchedText: currentViewerText,
        matchStartIndex: startIdx,
        matchWordCount: matchWordCount || 3
      });
      
      return;
    }
  }
}

function getMatchedTextUpToBySequence(fullText, matchSeq) {
  if (!fullText || !matchSeq || typeof fullText !== 'string' || typeof matchSeq !== 'string') {
    return '';
  }
  
  try {
    const normalizeForMatch = s => s.trim().replace(/\s+/g, ' ').toLowerCase();
    const normalizedFull = normalizeForMatch(fullText);
    const normalizedMatch = normalizeForMatch(matchSeq);
    
    if (!normalizedFull || !normalizedMatch) {
      return '';
    }
    
    const fullWords = normalizedFull.split(' ').filter(Boolean);
    const matchWords = normalizedMatch.split(' ').filter(Boolean);
    
    if (matchWords.length === 0) {
      return '';
    }
    
    let lastIdx = -1;
    for (let i = 0; i <= fullWords.length - matchWords.length; i++) {
      let isMatch = true;
      for (let j = 0; j < matchWords.length; j++) {
        if (fullWords[i + j].toLowerCase() !== matchWords[j].toLowerCase()) {
          isMatch = false; 
          break; 
        }
      }
      if (isMatch) {
        lastIdx = i + matchWords.length;
      }
    }
    
    if (lastIdx === -1) {
      return '';
    }
    
    let wordCount = 0, idx = 0;
    for (let i = 0; i < fullText.length; i++) {
      if (fullText[i] === ' ') {
        wordCount++;
        if (wordCount === lastIdx) {
          idx = i + 1;
          break;
        }
      }
    }
    
    if (wordCount < lastIdx) {
      idx = fullText.length;
    }
    
    return fullText.slice(0, idx);
    
  } catch (error) {
    console.error('[매칭 함수] 에러:', error);
    return '';
  }
}

// 수동 권한 전환
let manualSwitchCooldown = false;
let isSwitchingRole = false;

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
    
    const newActive = myRole === '1' ? 'steno2' : 'steno1';
    const matchedText = myEditor ? myEditor.value : '';
    
    console.log(`[수동 전환] ${reason}: ${myRole} → ${myRole === '1' ? '2' : '1'}`);
    
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
      return false;
    }
    
    setTimeout(() => {
      manualSwitchCooldown = false;
      console.log('[수동 전환] 쿨타임 해제');
    }, 2000);
    
    setTimeout(() => {
      isSwitchingRole = false;
      console.log('[수동 전환] 처리 완료');
    }, 1000);
    
    return true;
    
  } catch (error) {
    console.error('[수동 전환] 에러 발생:', error);
    isSwitchingRole = false;
    manualSwitchCooldown = false;
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
  
  if (isHtmlMode || myRole === activeStenographer) {
    updateViewerFromEditor();
  }
  
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

// Socket.io 이벤트들 (HTML 모드가 아닐 때만)
if (!isHtmlMode && socket) {
  socket.emit('join_channel', { 
    channel, 
    role: 'steno',  // 항상 'steno'로 보냄
    requestSync: true
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
      activeStenographer = '1';  // 기본값
      initializeDOMReferences();
      initializeComponents();
      isInitialized = true;
      updateStatus();
      console.log('[초기화 완료] 역할:', myRole, '활성:', activeStenographer);
    }
  });

  // 활성 역할 업데이트 (서버에서 보내는 이벤트)
  socket.on('active_role', ({ active }) => {
    const newActive = active === 'steno1' ? '1' : '2';
    console.log('[활성 역할] 서버 업데이트:', active, '→', newActive);
    activeStenographer = newActive;
    updateStatus();
  });

  socket.on('steno_list', ({ stenos }) => {
    console.log('[속기사 목록] 업데이트:', stenos);
    
    const wasCollaboration = isCollaborationMode();
    const wasSolo = isSoloMode();
    
    stenoList = stenos;
    
    const nowCollaboration = isCollaborationMode();
    const nowSolo = isSoloMode();
    
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
    
    // 상대방이 나갔을 때 입력창 초기화
    if (stenoList.length < 2 && otherEditor) {
      otherEditor.value = '';
      console.log('[상대방 퇴장] 입력창 초기화');
      updateViewerContent();
    }
  });

  socket.on('sync_accumulated', ({ accumulatedText: serverAccum }) => {
    accumulatedText = serverAccum || '';
    fullTextStorage = accumulatedText;
    updateMonitoringFromText(accumulatedText);
    updateViewerContent();
    console.log('[누적 텍스트 동기화]', accumulatedText.length, '자');
  });

  // 활성 속기사의 입력 수신 (뷰어에 표시)
  socket.on('steno_input', ({ role, text }) => {
    const senderRole = role.replace('steno', '');
    
    console.log('[steno_input 수신]', {
      발신자역할: senderRole,
      내역할: myRole,
      텍스트길이: text.length,
      활성자: activeStenographer
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
    
    // 2인 모드에서 상대방 입력창 업데이트
    if (isCollaborationMode() && otherEditor) {
      otherEditor.value = text;
      trimEditorText(otherEditor);
      otherEditor.scrollTop = otherEditor.scrollHeight;
    }
    
    // 활성 속기사의 입력이면 뷰어 업데이트
    if (senderRole === activeStenographer) {
      updateViewerWithOtherInput(text);
    }
    
    // 단어 매칭 체크
    if (isCollaborationMode() && myRole === activeStenographer) {
      checkWordMatchingAsActive();
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
    
    // 상대방 입력창 업데이트
    if (otherEditor) {
      otherEditor.value = text;
      trimEditorText(otherEditor);
      otherEditor.scrollTop = otherEditor.scrollHeight;
    }
    
    // 대기자로서 단어 매칭 체크
    if (isCollaborationMode() && myRole !== activeStenographer) {
      checkWordMatchingAsWaiting();
    }
  });

  socket.on('switch_role', ({ newActive, matchedText, accumulatedText: serverAccum, previousActive, manual, matchStartIndex, matchWordCount: matchCount }) => {
    try {
      const wasIActive = (activeStenographer === myRole);
      activeStenographer = newActive === 'steno1' ? '1' : '2';
      const amINowActive = (activeStenographer === myRole);
      
      console.log('[권한 전환]', {
        이전활성자: previousActive,
        새활성자: newActive,
        내역할: myRole,
        내가활성자였음: wasIActive,
        내가활성자됨: amINowActive
      });
      
      if (isViewerEditing && (wasIActive !== amINowActive)) {
        console.log('[권한 전환] 뷰어 편집 모드 자동 해제');
        cancelViewerEdit();
      }
      
      if (manual) {
        console.log('[수동 전환 완료]', wasIActive ? '권한 상실' : '권한 획득');
      }
      
      if (typeof serverAccum === 'string') {
        accumulatedText = serverAccum;
        fullTextStorage = serverAccum;
        updateMonitoringFromText(accumulatedText);
        updateViewerContent();
      }
      
      updateStatus();
      
      if (amINowActive && !wasIActive) {
        if (sendInputTimeout) {
          clearTimeout(sendInputTimeout);
          sendInputTimeout = null;
        }
        
        if (myEditor) {
          if (manual) {
            myEditor.value = '';
          } else {
            const currentText = myEditor.value;
            const words = currentText.split(' ').filter(Boolean);
            
            if (typeof matchStartIndex === 'number' && matchCount) {
              if (matchStartIndex === 0 && matchCount >= words.length) {
                myEditor.value = '';
              } else {
                words.splice(matchStartIndex, matchCount);
                myEditor.value = words.length > 0 ? words.join(' ') + ' ' : '';
              }
              
              myEditor.blur();
              setTimeout(() => {
                myEditor.focus();
              }, 10);
            } else {
              myEditor.value = '';
            }
          }
          
          if (socket.connected) {
            socket.emit('steno_input', { 
              channel: channel, 
              role: `steno${myRole}`, 
              text: myEditor.value 
            });
            lastSentText = myEditor.value;
          }
        }
        
        setTimeout(() => {
          if (socket.connected && myEditor) {
            socket.emit('steno_input', { 
              channel: channel, 
              role: `steno${myRole}`, 
              text: myEditor.value 
            });
            console.log('[권한 전환] 입력창 상태 재전송:', myEditor.value);
          }
        }, 100);
        
        setTimeout(() => {
          if (myEditor) myEditor.focus();
        }, 100);
        
      } else if (!amINowActive && wasIActive) {
        if (myEditor) {
          console.log('[권한 상실] 입력창 비우기');
          myEditor.value = '';
          lastSentText = '';
          if (socket.connected) {
            socket.emit('steno_input', { 
              channel: channel, 
              role: `steno${myRole}`, 
              text: '' 
            });
          }
        }
      }
      
      if (otherEditor) {
        otherEditor.value = '';
      }
      
      if (manual) {
        isSwitchingRole = false;
      }
      
    } catch (error) {
      console.error('[switch_role 처리 에러]:', error);
      isSwitchingRole = false;
    }
  });
  
  // 채팅 메시지 수신
  socket.on('chat_message', ({ sender, message }) => {
    if (sender !== `속기사${myRole}`) {
      const chatMsg = {
        sender: sender,
        message: message,
        timestamp: new Date().toISOString(),
        isMine: false,
        isQuick: message.startsWith('[빠른 메시지]')
      };
      
      addChatMessage(chatMsg);
    }
  });
  
  // 핑 응답
  socket.on('pong_test', () => {
    // checkConnection 함수에서 처리됨
  });
  
  // 강제 권한 전환
  socket.on('force_role_switch', ({ newActive }) => {
    activeStenographer = newActive === 'steno1' ? '1' : '2';
    updateStatus();
    
    if (activeStenographer === myRole) {
      console.log('[강제 권한 획득] 권한을 가져왔습니다.');
      if (myEditor) myEditor.focus();
    } else {
      console.log('[강제 권한 상실] 권한이 이동했습니다.');
      if (myEditor) {
        myEditor.value = '';
        lastSentText = '';
      }
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
  
  // 텍스트 전송 수신 처리
  socket.on('text_sent', ({ accumulatedText: newAccumulated, sender }) => {
    if (sender !== myRole) {
      accumulatedText = newAccumulated;
      fullTextStorage = newAccumulated;
      updateViewerContent();
      console.log(`[텍스트 전송 수신] ${sender}가 텍스트 전송`);
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
  
  socket.on('connect', () => {
    isConnected = true;
    statusInfo.textContent = '접속 중';
    console.log('[소켓 연결] 성공, Socket ID:', socket.id);
    updateUtilityStatus();
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
    console.log('[재연결] 채널 재가입 시도');
    myRole = null;
    isInitialized = false;
    roleInfo.textContent = '역할 대기중...';
    
    socket.emit('join_channel', { 
      channel, 
      role: 'steno',
      requestSync: true
    });
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
  
  // 텍스트 설정 UI는 역할과 무관하게 초기화
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
});

// 자동 저장 기능
let lastSaveData = null;

function enableAutoSave() {
  setInterval(() => {
    try {
      const saveData = {
        channel: channel,
        role: myRole,
        timestamp: new Date().toISOString(),
        
        editor1Text: document.getElementById('editor1')?.value || '',
        editor2Text: document.getElementById('editor2')?.value || '',
        accumulatedText: accumulatedText || '',
        fullTextStorage: fullTextStorage || '',
        
        activeTab: document.querySelector('.tab-btn.active')?.textContent || '설정',
        fontSize1: fontSizes[0],
        fontSize2: fontSizes[1],
        viewerFontSize: viewerFontSize,
        
        textSettings: textSettings,
        chatMessages: chatMessages
      };
      
      const currentDataStr = JSON.stringify(saveData);
      if (lastSaveData !== currentDataStr) {
        localStorage.setItem(`steno_autosave_${channel}`, currentDataStr);
        lastSaveData = currentDataStr;
        console.log(`[자동저장] ${new Date().toLocaleTimeString()}`);
      }
      
    } catch (error) {
      console.error('[자동저장 실패]', error);
    }
  }, 5000);
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
      console.log(`[자동저장] ${Math.floor(diffMinutes)}분 전 데이터 자동 복구 중...`);
      
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
      
      if (!isHtmlMode && socket && socket.connected && myEditor && myRole) {
        if (myEditor.value) {
          socket.emit('steno_input', { 
            channel: channel, 
            role: `steno${myRole}`, 
            text: myEditor.value 
          });
          console.log('[자동저장] 서버에 복구 텍스트 동기화 완료');
        }
      }
    }
    
  } catch (error) {
    console.error('[자동저장 복구 실패]', error);
  }
}

// 자동 저장 시작
enableAutoSave();

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
window.switchTab = switchTab;
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
