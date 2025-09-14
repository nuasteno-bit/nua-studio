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

// 드래그 앤 드롭 시스템
let draggedElement = null;
let draggedId = null;
let placeholderElement = null;
let currentLayout = 'default';

// 레이아웃 구성 정보
const layoutConfigs = {
  'default': {
    rows: 2,
    cells: [[0, 1], [2, 3]]
  },
  'vertical': {
    rows: 3,
    cells: [[0, 1], [2], [3]]
  },
  'horizontal': {
    rows: 2,
    cells: [[0, 2], [1, 3]]
  }
};

// 컴포넌트 정보
const components = {
  0: { id: 'steno1', type: 'column', fixed: true },
  1: { id: 'steno2', type: 'column', fixed: false },
  2: { id: 'viewer', type: 'viewer', fixed: false },
  3: { id: 'utility', type: 'utility', fixed: false }
};

// 현재 레이아웃 상태
let currentPositions = {
  'steno1': 0,
  'steno2': 1,
  'viewer': 2,
  'utility': 3
};

// 레이아웃 렌더링 함수
function renderLayout() {
  const container = document.getElementById('layoutContainer');
  if (!container) {
    console.error('layoutContainer not found');
    return;
  }
  
  // 1. 현재 텍스트만 백업 (화자 데이터 백업 제거)
  const textBackup = {
    editor1: document.getElementById('editor1')?.value || '',
    editor2: document.getElementById('editor2')?.value || '',
    viewer: document.getElementById('viewerContent')?.innerHTML || '',
    accumulated: accumulatedText,
    fullText: fullTextStorage // 전체 텍스트도 백업
  };
  
  // 2. 기존 레이아웃 렌더링 코드
  container.innerHTML = '';
  
  const config = layoutConfigs[currentLayout];
  
  config.cells.forEach((row, rowIndex) => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'layout-row';
    
    row.forEach(cellIndex => {
      const cellDiv = document.createElement('div');
      cellDiv.className = 'layout-cell';
      cellDiv.dataset.position = cellIndex;
      
      const componentId = Object.keys(currentPositions).find(
        key => currentPositions[key] === cellIndex
      );
      
      if (componentId) {
        const component = createComponent(componentId);
        cellDiv.appendChild(component);
      }
      
      if (cellIndex !== 0) {
        cellDiv.addEventListener('dragover', handleDragOver);
        cellDiv.addEventListener('drop', handleDrop);
        cellDiv.addEventListener('dragleave', handleDragLeave);
      }
      
      rowDiv.appendChild(cellDiv);
    });
    
    container.appendChild(rowDiv);
  });
  
  // 3. 컴포넌트 초기화
  initializeComponents();
  
  // 4. 텍스트만 복원 (화자 복원 제거)
  setTimeout(() => {
    // 에디터 텍스트 복원
    const editor1 = document.getElementById('editor1');
    const editor2 = document.getElementById('editor2');
    const viewerContent = document.getElementById('viewerContent');
    
    if (editor1 && textBackup.editor1) {
      editor1.value = textBackup.editor1;
    }
    
    if (editor2 && textBackup.editor2) {
      editor2.value = textBackup.editor2;
    }
    
    if (viewerContent && textBackup.viewer) {
      viewerContent.innerHTML = textBackup.viewer;
    }
    
    // 전역 변수도 복원
    accumulatedText = textBackup.accumulated;
    fullTextStorage = textBackup.fullText;
    
    console.log('[레이아웃] 텍스트 복원 완료:', {
      editor1: textBackup.editor1.length + '자',
      editor2: textBackup.editor2.length + '자',
      viewer: textBackup.viewer.length + '자',
      fullText: fullTextStorage.length + '자'
    });
    
    // 화면 업데이트 함수 호출
    if (isHtmlMode) {
      updateViewerFromEditor();
    } else {
      updateViewerContent();
    }
  }, 200);
}

// 컴포넌트 생성 함수
function createComponent(componentId) {
  if (componentId === 'steno1' || componentId === 'steno2') {
    const isSteno1Component = componentId === 'steno1';
    const isMyStenoComponent = (myRole === '1' && isSteno1Component) || (myRole === '2' && !isSteno1Component);
    
       let displayColNum = isMyStenoComponent ? 1 : 2;
    
    const col = document.createElement('div');
    col.className = 'column';
    col.id = `col${displayColNum}`;
    col.innerHTML = `
      <div class="title-bar ${!isMyStenoComponent && currentPositions[componentId] !== 0 ? 'draggable-header' : ''}" 
           id="titleBar${displayColNum}" 
           ${!isMyStenoComponent && currentPositions[componentId] !== 0 ? 'draggable="true"' : ''}>
        <span id="title${displayColNum}">Stenographer ${componentId === 'steno1' ? '1' : '2'}</span>
        <span class="role-badge" id="badge${displayColNum}">대기</span>
      </div>
      <div class="font-controls" id="font-controls-${displayColNum}">
        <div class="performance-info" id="performanceInfo${displayColNum}">
          <span id="perfChars${displayColNum}">0자</span>
          <span id="perfStatus${displayColNum}">최적화됨</span>
          <span id="perfMonitor${displayColNum}">0/30줄</span>
        </div>
        <div class="font-controls-right">
          <button class="font-btn" onclick="adjustFontSize(${displayColNum}, 1)">A+</button>
          <button class="font-btn" onclick="adjustFontSize(${displayColNum}, -1)">A−</button>
        </div>
      </div>
      <textarea class="editor-box" id="editor${displayColNum}" 
                placeholder="${isMyStenoComponent ? '여기에 입력...' : '상대 입력 대기 중...'}" 
                autocomplete="off" ${!isMyStenoComponent ? 'readonly' : ''}></textarea>
      <div class="status-bar" id="statusBar${displayColNum}">
        <span class="status-dot waiting" id="dot${displayColNum}"></span> 
        <span id="statusText${displayColNum}">대기 중</span>
      </div>
    `;
    return col;
  } else if (componentId === 'viewer') {
    const viewer = document.createElement('div');
    viewer.className = 'viewer';
    viewer.id = 'viewer';
    viewer.innerHTML = `
      <div class="title-bar draggable-header" draggable="true" style="display: flex; justify-content: space-between; align-items: center; cursor: default;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span>Monitoring Viewer</span>
          <span id="viewerIconBtn" title="Open Viewer in new window">
            <svg width="16" height="16" fill="#a2c1ff" viewBox="0 0 24 24">
              <path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 
                1.11.89 2 2 2h16c1.11 0 2-.89 
                2-2V6c0-1.11-.89-2-2-2zM4 
                18V6h16v12H4zm4-2h2v-2H6v2h2zm0-4h8v-2H8v2zm4 
                4h6v-2h-6v2z"/>
            </svg>
          </span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <button class="viewer-edit-btn" id="viewerEditBtn" onclick="toggleViewerEdit()" title="뷰어 편집" style="display: none;">편집</button>
          <button class="font-btn" onclick="adjustViewerFontSize(1)" title="뷰어 폰트 크게">A+</button>
          <button class="font-btn" onclick="adjustViewerFontSize(-1)" title="뷰어 폰트 작게">A−</button>
          <span class="utility-toggle" onclick="toggleCollapse('viewer')" style="margin-left: 8px;">▼</span>
        </div>
      </div>
      <div class="panel-body" id="viewer-body">
        <div class="panel-content" id="viewerContent" style="font-size: 15px;">
          <span class="viewer-placeholder">자막이 여기에 표시됩니다.</span>
        </div>
      </div>
    `;
    return viewer;
  } else if (componentId === 'utility') {
    const utility = document.createElement('div');
    utility.className = 'utility';
    utility.id = 'utility';
    utility.innerHTML = `
      <div class="title-bar draggable-header" draggable="true">
        <span class="utility-title">Utility Box</span>
        <span class="utility-toggle" onclick="toggleCollapse('utility')">▼</span>
      </div>
      <div class="panel-body" id="utility-body">
        <div class="tab-nav">
          <button class="tab-btn active" onclick="switchTab('phrases')">상용구</button>
          <button class="tab-btn" onclick="switchTab('speakers')">화자</button>
          <button class="tab-btn" onclick="switchTab('animation')">애니메이션</button>
          <button class="tab-btn" onclick="switchTab('memo')">소통메모</button>
        </div>
        
        <!-- 상용구 탭 -->
        <div class="tab-content active" id="phrases-tab">
          <div class="phrase-section">
            <h4>⌨️ 단축키 설정</h4>
            <div class="key-setting">
              <span style="font-size: 11px; color: #ccc; width: 50px;">발동키:</span>
              <div class="key-display" id="triggerKey">F3</div>
              <button class="key-btn" onclick="captureKey('trigger')">변경</button>
            </div>
            <div class="key-setting">
              <span style="font-size: 11px; color: #ccc; width: 50px;">등록키:</span>
              <div class="key-display" id="registerKey">F10</div>
              <button class="key-btn" onclick="captureKey('register')">변경</button>
            </div>
          </div>
          
          <div class="phrase-section">
            <h4>📝 상용구 등록</h4>
            <input type="text" class="phrase-input" id="phraseInput" 
                   placeholder="예: ㄱ:감사합니다 (키:내용)" 
                   style="font-size: 11px;">
          </div>
          
          <div class="phrase-section">
            <h4>📋 등록된 상용구</h4>
            <div class="phrase-table-container">
              <table class="phrase-table">
                <thead>
                  <tr>
                    <th style="width: 30px;">키</th>
                    <th>내용</th>
                    <th style="width: 35px;">삭제</th>
                  </tr>
                </thead>
                <tbody id="phraseTableBody">
                  <!-- 동적 생성 -->
                </tbody>
              </table>
            </div>
          </div>
          
          <div class="backup-controls">
            <button class="backup-btn" onclick="exportPhrasesText()">내보내기</button>
            <button class="backup-btn" onclick="importPhrasesText()">불러오기</button>
          </div>
        </div>
        
        <!-- 화자 탭 -->
        <div class="tab-content" id="speakers-tab">
          <div class="speaker-controls">
            <button class="speaker-add-btn" onclick="addSpeaker()">화자 추가 +</button>
            <span class="speaker-help">드래그: 이동 | 더블클릭: 수정 | 클릭: 선택 | Delete: 삭제</span>
          </div>
                    <div class="speaker-workspace" id="speakerWorkspace">
            <!-- 화자 박스들이 여기에 동적으로 생성됨 -->
          </div>
        </div>
        
        <!-- 애니메이션 탭 -->
        <div class="tab-content" id="animation-tab">
          <div>애니메이션 효과 설정</div>
          <div id="animationControls">애니메이션 제어 영역</div>
          <div style="margin-top:10px; font-size:13px;">
            <b>애니메이션 트리거 매칭표</b><br/>
            <table style="width:100%;font-size:12px;margin-top:6px;border-collapse:collapse;">
              <thead><tr><th style="border-bottom:1px solid #444;">효과</th><th style="border-bottom:1px solid #444;">트리거</th><th style="border-bottom:1px solid #444;">이모지/아이콘</th></tr></thead>
              <tbody>
                <tr><td>진동 효과</td><td>(진동)</td><td>📳</td></tr>
                <tr><td>페이드 인</td><td>(페이드)</td><td>✨</td></tr>
                <tr><td>확대 효과</td><td>(확대)</td><td>🔍</td></tr>
                <tr><td>그라데이션</td><td>(무지개)</td><td>🌈</td></tr>
                <tr><td>네온 효과</td><td>(네온)</td><td>💡</td></tr>
                <tr><td>타자기 효과</td><td>(타자기)</td><td>⌨️</td></tr>
                <tr><td>회전 효과</td><td>(회전)</td><td>🔄</td></tr>
                <tr><td>슬라이드(왼쪽)</td><td>(왼슬라이드)</td><td>←</td></tr>
                <tr><td>슬라이드(오른쪽)</td><td>(오른슬라이드)</td><td>→</td></tr>
                <tr><td>배경 파티</td><td>(파티)</td><td>🎉</td></tr>
                <tr><td>그림자 파동</td><td>(파동)</td><td>〰️</td></tr>
                <tr><td>파티클</td><td>(파티클)</td><td>⭐</td></tr>
                <tr><td>블러 인</td><td>(블러)</td><td>👁️</td></tr>
                <tr><td>글리치</td><td>(글리치)</td><td>📺</td></tr>
                <tr><td>SVG 하트</td><td>(하트)</td><td>💖/SVG</td></tr>
                <tr><td>SVG 별</td><td>(별)</td><td>⭐/SVG</td></tr>
                <tr><td>SVG 파도</td><td>(파도)</td><td>🌊/SVG</td></tr>
                <tr><td>SVG 펄스</td><td>(펄스)</td><td>📡/SVG</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        
        <!-- 소통메모 탭 -->
        <div class="tab-content" id="memo-tab">
          <div>소통 메모장</div>
          <div id="memoContent">메모 작성 영역</div>
        </div>
      </div>
    `;
    return utility;
  }
}

// 드래그 이벤트 핸들러
function handleDragStart(e) {
  const header = e.target;
  const component = header.closest('.column, .viewer, .utility');
  
  if (!component) return;
  
  let componentId = null;
  if (component.classList.contains('column')) {
    const colId = component.id;
    componentId = colId === 'col1' ? 'steno1' : 'steno2';
  } else if (component.classList.contains('viewer')) {
    componentId = 'viewer';
  } else if (component.classList.contains('utility')) {
    componentId = 'utility';
  }
  
  if (componentId === 'steno1') {
    e.preventDefault();
    return;
  }
  
  draggedElement = component;
  draggedId = componentId;
  
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', component.innerHTML);
  
  setTimeout(() => {
    component.classList.add('dragging');
  }, 0);
}

function handleDragEnd(e) {
  if (draggedElement) {
    draggedElement.classList.remove('dragging');
  }
  
  document.querySelectorAll('.layout-cell').forEach(cell => {
    cell.classList.remove('drag-over');
  });
  
  draggedElement = null;
  draggedId = null;
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  
  e.dataTransfer.dropEffect = 'move';
  
  const cell = e.target.closest('.layout-cell');
  if (cell && !cell.classList.contains('drag-over')) {
    cell.classList.add('drag-over');
  }
  
  return false;
}

function handleDragLeave(e) {
  const cell = e.target.closest('.layout-cell');
  if (cell) {
    cell.classList.remove('drag-over');
  }
}

function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }
  
  const targetCell = e.target.closest('.layout-cell');
  if (!targetCell || !draggedId) return;
  
  const targetPosition = parseInt(targetCell.dataset.position);
  
  if (targetPosition === 0) return;
  
  const targetComponentId = Object.keys(currentPositions).find(
    key => currentPositions[key] === targetPosition
  );
  
  const draggedPosition = currentPositions[draggedId];
  
  if (targetComponentId) {
    currentPositions[targetComponentId] = draggedPosition;
  }
  currentPositions[draggedId] = targetPosition;
  
  renderLayout();
  
  return false;
}

// 드래그 이벤트 초기화
function initializeDragEvents() {
  document.querySelectorAll('.draggable-header').forEach(header => {
    header.addEventListener('dragstart', handleDragStart);
    header.addEventListener('dragend', handleDragEnd);
  });
}

// 컴포넌트 초기화 함수
function initializeComponents() {
  updateDOMReferences();
  initializeDragEvents();
  
  if (myEditor) myEditor.style.fontSize = fontSizes[0] + 'px';
  if (otherEditor) otherEditor.style.fontSize = fontSizes[1] + 'px';
  
  if (myEditor) {
    myEditor.oninput = handleInputChange;
    myEditor.onblur = () => {
  // 권한자이고 대기 중인 전송이 있을 때만
  if (sendInputTimeout && myRole === activeStenographer) {
    clearTimeout(sendInputTimeout);
    sendInputTimeout = null;
    
    // sendInput() 함수를 통해 전송 (중복 방지 로직 포함)
    const currentText = myEditor.value;
    if (currentText !== lastSentText) {
      socket.emit('steno_input', { channel, role: `steno${myRole}`, text: currentText });
      lastSentText = currentText;
      lastSendTime = Date.now();
    }
  }
};
    // 엔터키 이벤트 처리 추가
    myEditor.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (e.shiftKey) {
          // Shift+Enter: 모드 전환
          e.preventDefault();
          toggleEnterMode();
        } else if (enterMode === 'send') {
          // 전송 모드에서 Enter: 텍스트 전송
          e.preventDefault();
          
          // HTML 모드이거나 권한자인 경우만 전송
          if (isHtmlMode || myRole === activeStenographer) {
            sendToMonitor();
          }
        }
        // newline 모드에서는 기본 동작(줄바꿈) 허용
      }
    });
  }
  
  // 뷰어 contentEditable에서 ESC 키 처리
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
        // 현재 origin 사용
        const viewerUrl = `${window.location.origin}/viewer.html?channel=${channel}`;
        window.open(viewerUrl, '_blank');
    });
}
  
  updateStatus();
  updateUtilityStatus();
}

// DOM 참조 업데이트 함수
function updateDOMReferences() {
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
  }
}

// 레이아웃 복귀 함수
function resetToDefaultLayout() {
  currentLayout = 'default';
  currentPositions = {
    'steno1': 0,
    'steno2': 1,
    'viewer': 2,
    'utility': 3
  };
  renderLayout();
  console.log('[레이아웃] 기본 2x2 레이아웃으로 복귀');
}

// 레이아웃 전환 함수
function switchLayout(layoutName) {
  if (layoutConfigs[layoutName]) {
    currentLayout = layoutName;
    renderLayout();
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

function toggleCollapse(elementId) {
  const element = document.getElementById(elementId);
  const body = document.getElementById(elementId + '-body');
  if (element.classList.contains('collapsed')) {
    element.classList.remove('collapsed');
    body.classList.remove('collapsed');
  } else {
    element.classList.add('collapsed');
    body.classList.add('collapsed');
  }
}

// 탭 전환 함수
function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  
  event.target.classList.add('active');
  document.getElementById(tabName + '-tab').classList.add('active');
}

// 키 캡처 관련 변수
let isCapturingKey = false;
let captureTarget = null;

// 상용구 관리 시스템
let userPhrases = {};
let keySettings = {
  trigger: 'F3',
  register: 'F10'
};

// 테마 관리 시스템
let currentTheme = 'dark';

function loadTheme() {
  setTheme('dark');
}

function setTheme(theme) {
  currentTheme = theme;
  
  if (theme === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }
  
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`.theme-btn.${theme}`).classList.add('active');
}

// 상용구 관련 함수들
function loadUserSettings() {
  loadTheme();
  
  const savedKeys = localStorage.getItem('stenoKeySettings');
  if (savedKeys) {
    keySettings = { ...keySettings, ...JSON.parse(savedKeys) };
    document.getElementById('triggerKey').textContent = keySettings.trigger;
    document.getElementById('registerKey').textContent = keySettings.register;
  }
  
  const savedPhrases = localStorage.getItem('stenoPhrases');
  if (savedPhrases) {
    userPhrases = JSON.parse(savedPhrases);
    updatePhraseTable();
  }
}

function saveUserSettings() {
  localStorage.setItem('stenoKeySettings', JSON.stringify(keySettings));
  localStorage.setItem('stenoPhrases', JSON.stringify(userPhrases));
}

function captureKey(type) {
  if (isCapturingKey) return;
  
  isCapturingKey = true;
  captureTarget = type;
  
  const keyDisplay = document.getElementById(type + 'Key');
  keyDisplay.classList.add('capturing');
  keyDisplay.textContent = '입력대기...';
}

function registerPhrase() {
  const input = document.getElementById('phraseInput');
  const text = input.value.trim();
  
  if (!text.includes(':')) {
    alert('형식: 키:내용 (예: ㄱ:감사합니다)');
    return;
  }
  
  const [key, ...contentParts] = text.split(':');
  const content = contentParts.join(':');
  
  if (!key || !content) {
    alert('키와 내용을 모두 입력해주세요');
    return;
  }
  
  const problematicKeys = ['Tab', 'Enter', 'Shift', 'Ctrl', 'Alt', 'Meta', 'Escape', 'F1', 'F5', 'F11', 'F12'];
  if (problematicKeys.includes(key.trim())) {
    alert(`"${key.trim()}" 키는 시스템 키라서 사용할 수 없습니다.`);
    return;
  }
  
  userPhrases[key.trim()] = content.trim();
  input.value = '';
  
  updatePhraseTable();
  saveUserSettings();
}

// 입력창에서 실시간 상용구 등록
function registerPhraseFromEditor() {
  const editor = myEditor;
  const text = editor.value;
  const cursorPos = editor.selectionStart;
  
  const beforeCursor = text.substring(0, cursorPos);
  const lastColonIndex = beforeCursor.lastIndexOf(':');
  
  if (lastColonIndex === -1) {
    alert('상용구 형식을 찾을 수 없습니다. (예: 가:가나다)');
    return;
  }
  
  const beforeColon = beforeCursor.substring(0, lastColonIndex);
  const words = beforeColon.split(' ');
  const keyPart = words[words.length - 1];
  
  if (!keyPart.trim()) {
    alert('키를 입력해주세요. (예: 가:가나다)');
    return;
  }
  
  const afterColon = beforeCursor.substring(lastColonIndex + 1);
  
  if (!afterColon.trim()) {
    alert('내용을 입력해주세요. (예: 가:가나다)');
    return;
  }
  
  const problematicKeys = ['Tab', 'Enter', 'Shift', 'Ctrl', 'Alt', 'Meta', 'Escape', 'F1', 'F5', 'F11', 'F12'];
  if (problematicKeys.includes(keyPart.trim())) {
    alert(`"${keyPart.trim()}" 키는 시스템 키라서 사용할 수 없습니다.`);
    return;
  }
  
  userPhrases[keyPart.trim()] = afterColon.trim();
  
  const removeStartPos = beforeColon.length - keyPart.length;
  const newText = text.substring(0, removeStartPos) + text.substring(cursorPos);
  editor.value = newText;
  
  const newCursorPos = removeStartPos;
  editor.setSelectionRange(newCursorPos, newCursorPos);
  
  updatePhraseTable();
  saveUserSettings();
  
  updateViewerFromEditor();
}

function updatePhraseTable() {
  const tbody = document.getElementById('phraseTableBody');
  tbody.innerHTML = '';
  
  Object.entries(userPhrases).forEach(([key, content]) => {
    const row = tbody.insertRow();
    
    const keyCell = row.insertCell();
    keyCell.className = 'phrase-key';
    keyCell.textContent = key;
    
    const contentCell = row.insertCell();
    contentCell.className = 'phrase-content';
    contentCell.textContent = content;
    contentCell.title = content;
    
    const deleteCell = row.insertCell();
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'phrase-delete';
    deleteBtn.textContent = '삭제';
    deleteBtn.onclick = () => deletePhrase(key);
    deleteCell.appendChild(deleteBtn);
  });
}

function deletePhrase(key) {
  if (confirm(`"${key}" 상용구를 삭제하시겠습니까?`)) {
    delete userPhrases[key];
    updatePhraseTable();
    saveUserSettings();
  }
}

// 텍스트 파일 내보내기
function exportPhrasesText() {
  if (Object.keys(userPhrases).length === 0) {
    alert('내보낼 상용구가 없습니다.');
    return;
  }
  
  const textContent = Object.entries(userPhrases)
    .map(([key, content]) => `${key} ${content}`)
    .join('\n');
  
  const blob = new Blob([textContent], { type: 'text/plain; charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `steno-phrases-${new Date().toISOString().split('T')[0]}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// 텍스트 파일 불러오기
function importPhrasesText() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.txt';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const textContent = e.target.result;
        const lines = textContent.split('\n').filter(line => line.trim());
        
        let importedCount = 0;
        let errorCount = 0;
        
        lines.forEach(line => {
          const trimmedLine = line.trim();
          if (!trimmedLine) return;
          
          const spaceIndex = trimmedLine.indexOf(' ');
          if (spaceIndex === -1) {
            errorCount++;
            return;
          }
          
          const key = trimmedLine.substring(0, spaceIndex).trim();
          const content = trimmedLine.substring(spaceIndex + 1).trim();
          
          if (key && content) {
            userPhrases[key] = content;
            importedCount++;
          } else {
            errorCount++;
          }
        });
        
        updatePhraseTable();
        saveUserSettings();
        
        if (importedCount > 0) {
          alert(`상용구 ${importedCount}개를 성공적으로 불러왔습니다!${errorCount > 0 ? `\n(오류 ${errorCount}개)` : ''}`);
        } else {
          alert('불러올 수 있는 상용구가 없습니다.\n형식: 키 내용 (예: ㄱ 가나다)');
        }
        
      } catch (error) {
        alert('파일을 읽는 중 오류가 발생했습니다.');
      }
    };
    reader.readAsText(file, 'utf-8');
  };
  input.click();
}

function handlePhraseShortcut(text) {
  const editor = myEditor;
  const cursorPos = editor.selectionStart;
  const beforeCursor = text.substring(0, cursorPos);
  const words = beforeCursor.split(/\s+/);
  const lastWord = words[words.length - 1];
  
  if (userPhrases[lastWord]) {
    const beforeWord = beforeCursor.substring(0, beforeCursor.lastIndexOf(lastWord));
    const afterCursor = text.substring(cursorPos);
    const newText = beforeWord + userPhrases[lastWord] + afterCursor;
    
    editor.value = newText;
    const newCursorPos = beforeWord.length + userPhrases[lastWord].length;
    editor.setSelectionRange(newCursorPos, newCursorPos);
    
    updateViewerFromEditor();
    
    return true;
  }
  return false;
}

// 화자 관리 시스템 - 수정된 버전
let speakers = [];
let selectedSpeaker = null;
let speakerIdCounter = 0;
let isDraggingSpeaker = false;
let dragOffset = { x: 0, y: 0 };
let currentDraggingSpeaker = null;
let dragTimeout = null;

// 원형 숫자 배열 (1~9)
const circleNumbers = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];

// 화자 추가
function addSpeaker() {
  const workspace = document.getElementById('speakerWorkspace');
  const speakerId = `speaker_${++speakerIdCounter}`;
  
  // 현재 화자 수가 9명 이상이면 추가 제한
  if (speakers.length >= 9) {
    alert('화자는 최대 9명까지만 추가할 수 있습니다.');
    return;
  }
  
  const speaker = {
    id: speakerId,
    name: `화자${speakers.length + 1}`,
    number: speakers.length + 1,  // 순서 번호 추가
    x: 10 + (speakers.length * 90) % (workspace.offsetWidth - 100),
    y: 10 + Math.floor(speakers.length / 3) * 40
  };
  
  speakers.push(speaker);
  
  const speakerBox = createSpeakerElement(speaker);
  workspace.appendChild(speakerBox);
  
  setTimeout(() => startEditingSpeaker(speakerId), 100);
  
  // localStorage 저장 제거 - saveSpeakers() 호출 삭제
  
  // 소켓으로 화자 추가 전송
  if (!isHtmlMode && socket) {
    socket.emit('speaker_update', { 
      channel, 
      action: 'add', 
      speaker 
    });
  }
}

// 화자 요소 생성 - 번호 표시 추가
function createSpeakerElement(speaker) {
  const div = document.createElement('div');
  div.className = 'speaker-box';
  div.id = speaker.id;
  div.style.left = speaker.x + 'px';
  div.style.top = speaker.y + 'px';
  
  // 번호와 이름을 함께 표시
  const numberSpan = document.createElement('span');
  numberSpan.className = 'speaker-number';
  numberSpan.textContent = speaker.number <= 9 ? circleNumbers[speaker.number - 1] : '';
  numberSpan.style.cssText = 'color: #ff9500; font-family: Consolas, Monaco, monospace; margin-right: 4px;';
  
  const nameSpan = document.createElement('span');
  nameSpan.textContent = speaker.name;
  
  div.appendChild(numberSpan);
  div.appendChild(nameSpan);
  
  div.addEventListener('mousedown', handleSpeakerMouseDown);
  div.addEventListener('dblclick', handleSpeakerDoubleClick);
  div.addEventListener('click', handleSpeakerClick);
  
  return div;
}

// 마우스 다운 이벤트
function handleSpeakerMouseDown(e) {
  if (e.target.tagName === 'INPUT') return;
  
  e.preventDefault();
  const speakerBox = e.currentTarget;
  currentDraggingSpeaker = speakerBox;
  isDraggingSpeaker = true;
  
  const rect = speakerBox.getBoundingClientRect();
  const workspaceRect = speakerBox.parentElement.getBoundingClientRect();
  dragOffset.x = e.clientX - rect.left;
  dragOffset.y = e.clientY - rect.top;
  
  speakerBox.classList.add('dragging');
  
  // 드래그 시작 알림
  if (!isHtmlMode && socket) {
    socket.emit('speaker_drag_start', { 
      channel, 
      speakerId: speakerBox.id,
      userName: myRole === '1' ? '속기사1' : '속기사2'
    });
  }
  
  document.addEventListener('mousemove', handleSpeakerMouseMove);
  document.addEventListener('mouseup', handleSpeakerMouseUp);
}

// 마우스 이동 이벤트
function handleSpeakerMouseMove(e) {
  if (!isDraggingSpeaker || !currentDraggingSpeaker) return;
  
  const workspace = document.getElementById('speakerWorkspace');
  const workspaceRect = workspace.getBoundingClientRect();
  
  let newX = e.clientX - workspaceRect.left - dragOffset.x;
  let newY = e.clientY - workspaceRect.top - dragOffset.y;
  
  const boxWidth = currentDraggingSpeaker.offsetWidth;
  const boxHeight = currentDraggingSpeaker.offsetHeight;
  
  newX = Math.max(0, Math.min(newX, workspace.offsetWidth - boxWidth));
  newY = Math.max(0, Math.min(newY, workspace.offsetHeight - boxHeight));
  
  currentDraggingSpeaker.style.left = newX + 'px';
  currentDraggingSpeaker.style.top = newY + 'px';
  
  const speaker = speakers.find(s => s.id === currentDraggingSpeaker.id);
  if (speaker) {
    speaker.x = newX;
    speaker.y = newY;
    
    // 실시간으로 이동 상태 전송 (쓰로틀링 적용)
    if (!isHtmlMode && socket) {
      clearTimeout(dragTimeout);
      dragTimeout = setTimeout(() => {
        socket.emit('speaker_dragging', { 
          channel, 
          speakerId: speaker.id,
          x: newX,
          y: newY
        });
      }, 50); // 50ms마다 한 번씩만 전송
    }
  }
}

// 마우스 업 이벤트
function handleSpeakerMouseUp(e) {
  if (!isDraggingSpeaker) return;
  
  isDraggingSpeaker = false;
  if (currentDraggingSpeaker) {
    currentDraggingSpeaker.classList.remove('dragging');
    
    // 최종 위치 전송
    if (!isHtmlMode && socket) {
      const speaker = speakers.find(s => s.id === currentDraggingSpeaker.id);
      if (speaker) {
        socket.emit('speaker_drag_end', { 
          channel, 
          speaker 
        });
      }
    }
  }
  currentDraggingSpeaker = null;
  
  document.removeEventListener('mousemove', handleSpeakerMouseMove);
  document.removeEventListener('mouseup', handleSpeakerMouseUp);
  
  // localStorage 저장 제거
}

// 더블클릭 이벤트
function handleSpeakerDoubleClick(e) {
  e.stopPropagation();
  const speakerId = e.currentTarget.id;
  startEditingSpeaker(speakerId);
}

// 클릭 이벤트
function handleSpeakerClick(e) {
  if (e.target.tagName === 'INPUT') return;
  e.stopPropagation();
  
  const speakerBox = e.currentTarget;
  selectSpeaker(speakerBox.id);
}

// 화자 선택
function selectSpeaker(speakerId) {
  document.querySelectorAll('.speaker-box').forEach(box => {
    box.classList.remove('selected');
  });
  
  const speakerBox = document.getElementById(speakerId);
  if (speakerBox) {
    speakerBox.classList.add('selected');
    selectedSpeaker = speakerId;
  }
}

// 화자 편집 시작
function startEditingSpeaker(speakerId) {
  const speakerBox = document.getElementById(speakerId);
  const speaker = speakers.find(s => s.id === speakerId);
  if (!speakerBox || !speaker) return;
  
  speakerBox.classList.add('editing');
  
  const input = document.createElement('input');
  input.type = 'text';
  input.value = speaker.name;
  input.maxLength = 20;
  
  speakerBox.innerHTML = '';
  speakerBox.appendChild(input);
  
  input.focus();
  input.select();
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      finishEditingSpeaker(speakerId, input.value);
    } else if (e.key === 'Escape') {
      finishEditingSpeaker(speakerId, speaker.name);
    }
  });
  
  input.addEventListener('blur', () => {
    finishEditingSpeaker(speakerId, input.value);
  });
}

// 화자 편집 완료 - 번호 표시 유지
function finishEditingSpeaker(speakerId, newName) {
  const speakerBox = document.getElementById(speakerId);
  const speaker = speakers.find(s => s.id === speakerId);
  if (!speakerBox || !speaker) return;
  
  speaker.name = newName.trim() || `화자${speaker.number}`;
  speakerBox.classList.remove('editing');
  
  // 번호와 이름을 다시 표시
  speakerBox.innerHTML = '';
  
  const numberSpan = document.createElement('span');
  numberSpan.className = 'speaker-number';
  numberSpan.textContent = speaker.number <= 9 ? circleNumbers[speaker.number - 1] : '';
  numberSpan.style.cssText = 'color: #ff9500; font-family: Consolas, Monaco, monospace; margin-right: 4px;';
  
  const nameSpan = document.createElement('span');
  nameSpan.textContent = speaker.name;
  
  speakerBox.appendChild(numberSpan);
  speakerBox.appendChild(nameSpan);
  
  // localStorage 저장 제거 - saveSpeakers() 호출 삭제
  
  // 소켓으로 화자 수정 전송
  if (!isHtmlMode && socket) {
    socket.emit('speaker_update', { 
      channel, 
      action: 'edit', 
      speaker 
    });
  }
}

// 화자 삭제 - 번호 재정렬 추가
function deleteSpeaker(speakerId) {
  const index = speakers.findIndex(s => s.id === speakerId);
  if (index !== -1) {
    speakers.splice(index, 1);
    const speakerBox = document.getElementById(speakerId);
    if (speakerBox) {
      speakerBox.remove();
    }
    selectedSpeaker = null;
    
    // 번호 재정렬
    speakers.forEach((speaker, idx) => {
      speaker.number = idx + 1;
    });
    
    // 모든 화자 박스 다시 그리기 (번호 업데이트를 위해)
    refreshSpeakerWorkspace();
    
    // localStorage 저장 제거 - saveSpeakers() 호출 삭제
    
    // 소켓으로 화자 삭제 전송
    if (!isHtmlMode && socket) {
      socket.emit('speaker_update', { 
        channel, 
        action: 'delete', 
        speakerId 
      });
    }
  }
}

// 화자 워크스페이스 새로고침 함수 (번호 업데이트 시 사용)
function refreshSpeakerWorkspace() {
  const workspace = document.getElementById('speakerWorkspace');
  if (!workspace) return;
  
  // 현재 선택된 화자 ID 저장
  const currentSelectedId = selectedSpeaker;
  
  // 워크스페이스 비우기
  workspace.innerHTML = '';
  
  // 모든 화자 다시 그리기
  speakers.forEach(speaker => {
    const speakerBox = createSpeakerElement(speaker);
    workspace.appendChild(speakerBox);
    
    // 선택 상태 복원
    if (speaker.id === currentSelectedId) {
      speakerBox.classList.add('selected');
    }
  });
}

// 화자 데이터 저장 - 함수 비활성화
function saveSpeakers() {
  // localStorage 저장 기능 제거
  // 이제 아무것도 하지 않음
}

// 화자 데이터 로드 - 함수 비활성화
function loadSpeakers() {
  // localStorage 로드 기능 제거
  // 항상 빈 화자 목록으로 시작
  speakers = [];
  selectedSpeaker = null;
  speakerIdCounter = 0;
  
  // 화자 워크스페이스 초기화
  const workspace = document.getElementById('speakerWorkspace');
  if (workspace) {
    workspace.innerHTML = '';
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

// 1. toggleViewerEdit을 window에 바인딩
window.toggleViewerEdit = function() {
  if (isViewerEditing) {
    completeViewerEdit();
  } else {
    startViewerEdit();
  }
};

// 2. startViewerEdit 함수 (조건 명확화 및 편집 모드 진입)
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
    // 서버에 알림(있으면)
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

// 3. completeViewerEdit 함수 (줄바꿈 포함 텍스트 추출)
function completeViewerEdit() {
  if (!isViewerEditing) return;
  const viewerContent = document.getElementById('viewerContent');
  const viewer = document.getElementById('viewer');
  const editBtn = document.getElementById('viewerEditBtn');
  // 줄바꿈 포함 텍스트 추출 (div, br, span, 텍스트 모두 처리)
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
  fullTextStorage = editedText; // 전체 텍스트도 업데이트
  isViewerEditing = false;
  viewer.classList.remove('editing');
  viewerContent.contentEditable = 'false';
  editBtn.textContent = '편집';
  editBtn.classList.remove('editing');
  // 서버에 전송
  if (socket && socket.connected) {
    socket.emit('viewer_edit_complete', { 
      channel, 
      editedText,
      editorRole: `속기사${myRole}`
    });
  }
  // 뷰어 갱신
  updateViewerContent();
  if (myEditor) myEditor.focus();
}

function cancelViewerEdit() {
  if (!isViewerEditing) return;
  // 서버에 편집 취소 전송
  if (socket && socket.connected) {
    socket.emit('viewer_edit_cancel', { channel });
  }
  // 원래 내용으로 복원
  updateViewerContent();
  // 편집 모드 해제
  exitEditMode();
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
    // 자동 스크롤 방지
    viewerContent.scrollTop = 0;
  }
  if (editBtn) {
    editBtn.textContent = '완료';
    editBtn.classList.add('editing');
  }
  console.log('[뷰어 편집] 편집 모드 시작');
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

// 전역 키 이벤트 처리
document.addEventListener('keydown', (e) => {
  const keyName = e.key;
  
  // 뷰어 편집 모드에서 ESC 처리 (이미 viewerContent에서 처리하므로 여기서는 제외)
  
  if (keyName === 'F5') {
    e.preventDefault();
    return;
  }
  
  if (keyName === 'F4' && document.activeElement === myEditor) {
    e.preventDefault();
    deleteWordBackward();
    return;
  }
  
  if (e.key === 'Delete' && selectedSpeaker) {
    if (document.activeElement.tagName === 'INPUT' || 
        document.activeElement.tagName === 'TEXTAREA') {
      return;
    }
    
    const speakersTab = document.getElementById('speakers-tab');
    if (speakersTab && speakersTab.classList.contains('active')) {
      deleteSpeaker(selectedSpeaker);
    }
  }
  
  if (isCapturingKey) {
    e.preventDefault();
    
    if (keyName === 'Escape') {
      const keyDisplay = document.getElementById(captureTarget + 'Key');
      keyDisplay.classList.remove('capturing');
      keyDisplay.textContent = keySettings[captureTarget];
    } else {
      keySettings[captureTarget] = keyName;
      const keyDisplay = document.getElementById(captureTarget + 'Key');
      keyDisplay.classList.remove('capturing');
      keyDisplay.textContent = keyName;
      saveUserSettings();
    }
    
    isCapturingKey = false;
    captureTarget = null;
    return;
  }
  
  if (keyName === keySettings.register) {
    e.preventDefault();
    
    if (document.activeElement === myEditor) {
      registerPhraseFromEditor();
    } else {
      registerPhrase();
    }
    return;
  }
  
  if (keyName === keySettings.trigger && document.activeElement === myEditor) {
    e.preventDefault();
    if (handlePhraseShortcut(myEditor.value)) {
      // 상용구가 적용되었으면 추가 처리 없음
    }
    return;
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
  
  // HTML 모드이거나 권한자인 경우만 뷰어 업데이트
  if (isHtmlMode || myRole === activeStenographer) {
    updateViewerFromEditor();
  }
  
  // 소켓 모드에서는 즉시 전송
  if (!isHtmlMode && socket && socket.connected) {
    socket.emit('steno_input', { 
      channel: channel, 
      role: `steno${myRole}`, 
      text: editor.value 
    });
    lastSentText = editor.value;
  }
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

function addLineToMonitoring(line) {
  if (line !== undefined && line !== null) {
    monitoringLines.push(line);
    if (monitoringLines.length > MAX_MONITORING_LINES) {
      monitoringLines = monitoringLines.slice(-MAX_MONITORING_LINES);
    }
  }
}

function getMonitoringText() {
  return monitoringLines.join('\n');
}

function updateMonitoringFromText(fullText) {
  monitoringLines = splitTextIntoLines(fullText, MAX_MONITORING_LINES);
}

// 최적화된 뷰어 업데이트 함수들
function updateViewerFromEditor() {
  if (isViewerEditing) return;
  
  const startTime = performance.now();
  const viewerContent = document.getElementById('viewerContent');
  if (!viewerContent || !myEditor) return;
  
  const currentText = accumulatedText + myEditor.value;
  
  // 전체 텍스트 보존
  fullTextStorage = currentText;
  
  updateMonitoringFromText(currentText);
  const monitoringText = getMonitoringText();
  
  // 렌더링 최적화: requestAnimationFrame 사용
  if (Date.now() - lastRenderTime < 16) { // 60fps = 16ms
    return;
  }
  
  requestAnimationFrame(() => {
    const newLines = monitoringText.split('\n');
    
    // 스마트 렌더링: 변경된 부분만 업데이트
    if (lastRenderedLines.length === 0 || lastRenderedLines.length !== newLines.length) {
      // 전체 다시 그리기
      viewerContent.innerHTML = processRealisticEmotionsLineByLine(monitoringText) || '<span class="viewer-placeholder">자막이 여기에 표시됩니다.</span>';
      lastRenderedLines = [...newLines];
    } else {
      // 변경된 줄만 업데이트
      let hasChanges = false;
      const children = viewerContent.children;
      
      newLines.forEach((line, index) => {
        if (line !== lastRenderedLines[index]) {
          hasChanges = true;
          const { text: processed, effect } = processRealisticEmotions(line);
          
          if (children[index]) {
            // 기존 줄 업데이트
            children[index].className = effect || '';
            children[index].innerHTML = processed;
          } else {
            // 새 줄 추가
            const span = document.createElement('span');
            span.className = effect || '';
            span.innerHTML = processed;
            viewerContent.appendChild(span);
          }
          lastRenderedLines[index] = line;
        }
      });
      
      if (!hasChanges) {
        console.log('[스마트 렌더링] 변경 없음, 스킵');
        return;
      }
    }
    
    viewerContent.scrollTop = viewerContent.scrollHeight;
    lastDisplayedText = monitoringText;
    lastRenderTime = Date.now();
    
    const renderTime = performance.now() - startTime;
    if (renderTime > 16) {
      console.warn(`[렌더링 성능] ${renderTime.toFixed(2)}ms (목표: 16ms 이하)`);
    }
  });
}

// 엔터키 모드 전환 함수
function toggleEnterMode() {
  enterMode = enterMode === 'newline' ? 'send' : 'newline';
  
  // 상태바에 현재 모드 표시
  const modeIndicator = document.querySelector('.enter-mode-indicator');
  if (modeIndicator) {
    modeIndicator.textContent = enterMode === 'send' ? '[전송 모드]' : '[줄바꿈 모드]';
  } else {
    // 모드 표시가 없으면 생성
    const myStatusBar = document.getElementById('statusBar1');
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

// 전송 모드에서 텍스트 전송 함수
function sendToMonitor() {
  if (!myEditor || myEditor.value.trim() === '') return;
  
  // 현재 입력창의 내용을 누적 텍스트에 추가
  accumulatedText += myEditor.value + '\n';
  fullTextStorage = accumulatedText; // 전체 텍스트도 업데이트
  
  // 입력창 비우기
  myEditor.value = '';
  
  // 뷰어 업데이트
  if (isHtmlMode) {
    updateViewerFromEditor();
  } else {
    updateViewerContent();
    // 소켓으로 누적 텍스트 동기화
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

// 입력 처리 함수 - 최적화 주기 변경
function handleInputChange() {
  let val = myEditor.value.replace(/ {2,}/g, ' ');
  if (val !== myEditor.value) {
    myEditor.value = val;
  }
  
  inputOptimizationCounter++;
  if (inputOptimizationCounter % 50 === 0) { // 100 → 50으로 변경
    trimEditorText(myEditor);
  }
  
  if (isHtmlMode) {
    updateViewerFromEditor();
  } else {
    sendInput();
  }
}

// 소켓 모드 전용 함수들
function sendInput() {
  if (!socket || isHtmlMode) return;
  
  // 화면은 즉시 업데이트
  if (shouldUpdateViewer()) {
    updateViewerWithCurrentInput();
  }
  
  // 권한자만 디바운싱 적용
  if (myRole === activeStenographer) {
    // 이전 타이머 취소
    if (sendInputTimeout) {
      clearTimeout(sendInputTimeout);
    }
    
    // 즉시 전송 조건
    const currentText = myEditor.value;
    const shouldSendImmediately = 
      currentText.endsWith(' ') || // 공백 입력 (단어 완성)
      currentText.endsWith('\n') || // 엔터 입력
      currentText === '' || // 전체 삭제
      (Date.now() - lastSendTime) > 5000; // 5초 이상 경과
    
    if (shouldSendImmediately) {
      // 즉시 전송
      if (currentText !== lastSentText) {
        if (socket.connected) {
          // role을 steno1 또는 steno2 형식으로 전송
          socket.emit('steno_input', { 
            channel: channel, 
            role: `steno${myRole}`, 
            text: currentText 
          });
        }
        lastSentText = currentText;
        lastSendTime = Date.now();
        
        // 중요: 대기 중인 타이머 취소!
        if (sendInputTimeout) {
          clearTimeout(sendInputTimeout);
          sendInputTimeout = null;
        }
      }
    } else {
      // 디바운싱 전송 (200ms 대기)
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
    // 대기자는 즉시 전송 (매칭을 위해)
    if (socket.connected) {
      socket.emit('steno_input', { 
        channel: channel, 
        role: `steno${myRole}`, 
        text: myEditor.value 
      });
    }
  }
  
  // 대기자 매칭 체크
  if (isCollaborationMode() && myRole !== activeStenographer) {
    checkWordMatchingAsWaiting();
  }
  
  // 권한자 매칭 체크
  if (isCollaborationMode() && myRole === activeStenographer) {
    checkWordMatchingAsActive();
  }
}

// 뷰어 콘텐츠 갱신 통합 함수 - 최적화
function updateViewerContent() {
  if (isViewerEditing) {
    // 편집 모드에서는 애니메이션 없이 텍스트만 표시
    const viewerContent = document.getElementById('viewerContent');
    if (viewerContent) {
      updateMonitoringFromText(accumulatedText);
      const monitoringText = getMonitoringText();
      viewerContent.innerHTML = monitoringText.split('\n').map(line => `<span>${line}</span>`).join('<br>');
      viewerContent.className = 'panel-content';
      lastDisplayedText = monitoringText;
    }
    return;
  }
  
  const viewerContent = document.getElementById('viewerContent');
  if (viewerContent) {
    // 전체 텍스트 보존
    fullTextStorage = accumulatedText;
    
    updateMonitoringFromText(accumulatedText);
    const monitoringText = getMonitoringText();
    
    requestAnimationFrame(() => {
      viewerContent.innerHTML = processRealisticEmotionsLineByLine(monitoringText) || '<span class="viewer-placeholder">자막이 여기에 표시됩니다.</span>';
      viewerContent.className = 'panel-content';
      viewerContent.scrollTop = viewerContent.scrollHeight;
      lastDisplayedText = monitoringText;
      console.log('[뷰어갱신] 모니터링 30줄 제한 표시:', `(${monitoringLines.length}줄, 전체:${fullTextStorage.length}자)`);
    });
  }
}

// 현재 입력과 함께 뷰어 갱신 - 최적화
function updateViewerWithCurrentInput() {
  // 편집 모드 보호 추가
  if (isViewerEditing) {
    console.log('[뷰어 보호] 편집 중 - 업데이트 스킵');
    return;
  }
  
  const viewerContent = document.getElementById('viewerContent');
  if (!viewerContent) return;
  // 마지막 입력 중인 단어 제외 (1단어 지연)
let displayText = accumulatedText;
if (myEditor.value.endsWith(' ')) {
  // 공백으로 끝나면 전체 표시
  displayText = accumulatedText + myEditor.value;
} else {
  // 입력 중인 마지막 단어는 제외
  const words = myEditor.value.split(' ');
  if (words.length > 1) {
    displayText = accumulatedText + words.slice(0, -1).join(' ') + ' ';
  }
}
  
  fullTextStorage = displayText; // 전체 텍스트 보존
  updateMonitoringFromText(displayText);
  const monitoringText = getMonitoringText();
  
  requestAnimationFrame(() => {
    viewerContent.innerHTML = processRealisticEmotionsLineByLine(monitoringText) || '<span class="viewer-placeholder">자막이 여기에 표시됩니다.</span>';
    viewerContent.scrollTop = viewerContent.scrollHeight;
    lastDisplayedText = monitoringText;
    console.log('[뷰어갱신] 즉시 표시:', `(${monitoringLines.length}줄, 전체:${fullTextStorage.length}자)`);
  });
}
// 상대방 입력으로 뷰어 갱신 - 최적화
function updateViewerWithOtherInput(otherText) {
  // 편집 모드 보호 추가
  if (isViewerEditing) {
    console.log('[뷰어 보호] 편집 중 - 상대방 업데이트 스킵');
    return;
  }
  
  const viewerContent = document.getElementById('viewerContent');
  if (!viewerContent) return;
  
 // 마지막 입력 중인 단어 제외 (1단어 지연)
let displayText = accumulatedText;
if (otherText.endsWith(' ')) {
  // 공백으로 끝나면 전체 표시
  displayText = accumulatedText + otherText;
} else {
  // 입력 중인 마지막 단어는 제외
  const words = otherText.split(' ');
  if (words.length > 1) {
    displayText = accumulatedText + words.slice(0, -1).join(' ') + ' ';
  }
}
  
  fullTextStorage = displayText; // 전체 텍스트 보존
  updateMonitoringFromText(displayText);
  const monitoringText = getMonitoringText();
  
  requestAnimationFrame(() => {
    viewerContent.innerHTML = processRealisticEmotionsLineByLine(monitoringText) || '<span class="viewer-placeholder">자막이 여기에 표시됩니다.</span>';
    viewerContent.scrollTop = viewerContent.scrollHeight;
    lastDisplayedText = monitoringText;
    console.log('[뷰어갱신-상대] 즉시 표시:', `(${monitoringLines.length}줄, 전체:${fullTextStorage.length}자)`);
  });
}
// 입력창 텍스트 관리 시스템 - 더 적극적인 최적화
const EDITOR_MAX_CHARS = 4000; // 5000 → 4000으로 축소
const EDITOR_TRIM_CHARS = 2500; // 3000 → 2500으로 축소

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

// 모드별 동작
function isSoloMode() {
  return stenoList.length === 1;
}

function isCollaborationMode() {
  return stenoList.length === 2;
}

function getActiveRole() {
  if (isSoloMode()) return myRole;
  return activeStenographer;
}

function shouldUpdateViewer() {
  if (isSoloMode()) return true;
  return myRole === activeStenographer;
}

// 상태 업데이트 함수
function updateStatus() {
  if (!myEditor || !otherEditor) return;
  
  // 엔터 모드 표시 업데이트
  const myStatusBar = document.getElementById('statusBar1');
  if (myStatusBar && !document.querySelector('.enter-mode-indicator')) {
    const indicator = document.createElement('span');
    indicator.className = 'enter-mode-indicator';
    indicator.textContent = '[줄바꿈 모드]';
    indicator.style.cssText = 'color: #5a78ff; font-weight: bold; margin-left: 16px;';
    myStatusBar.appendChild(indicator);
  }
  
  // 뷰어 편집 버튼 표시/숨김 처리
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
      otherColDiv.style.display = 'flex';
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
    
    if (otherColDiv) otherColDiv.style.display = 'flex';
  } else {
    statusInfo.textContent = isSoloMode() ? '1인 속기 모드' : '상대 대기 중';
    
    myColDiv.classList.add('active');
    myBadge.textContent = '입력권한';
    myBadge.classList.add('live-badge');
    myStatus.textContent = '입력 가능';
    myDot.className = 'status-dot';
    
    if (isSoloMode()) {
      if (otherColDiv) otherColDiv.style.display = 'none';
    } else {
      if (otherColDiv) {
        otherColDiv.style.display = 'flex';
        otherColDiv.classList.remove('active');
        otherBadge.textContent = '대기';
        otherBadge.classList.remove('live-badge');
        otherStatus.textContent = '대기 중';
        otherDot.className = 'status-dot waiting';
      }
    }
  }
}

// 유틸리티 업데이트 함수
function updateUtility() {
  updateUtilityStatus();
}

function updatePerformanceInfo() {
  const perfChars1 = document.getElementById('perfChars' + myColNum);
  const perfStatus1 = document.getElementById('perfStatus' + myColNum);
  const perfMonitor1 = document.getElementById('perfMonitor' + myColNum);
  
  if (perfChars1 && perfStatus1 && perfMonitor1 && myEditor) {
    const charCount = myEditor.value.length;
    const monitorLinesCount = monitoringLines.length;
    
    perfChars1.textContent = `${charCount}자`;
    
    if (charCount > 3500) { // 4500 → 3500으로 변경
      perfStatus1.textContent = '곧최적화';
      perfStatus1.className = 'performance-warning';
    } else if (charCount > 3000) { // 4000 → 3000으로 변경
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
      
      if (otherCharCount > 3500) { // 4500 → 3500으로 변경
        perfStatus2.textContent = '곧최적화';
        perfStatus2.className = 'performance-warning';
      } else if (otherCharCount > 3000) { // 4000 → 3000으로 변경
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

function updateUtilityStatus() {
  const utilityStatus = document.getElementById('utilityStatus');
  if (utilityStatus) {
    const currentLines = monitoringLines.length;
    
    const myEditorChars = myEditor ? myEditor.value.length : 0;
    const otherEditorChars = otherEditor ? otherEditor.value.length : 0;
    
    const modeText = isHtmlMode ? 'HTML 모드' :
                     isSoloMode() ? '1인 속기 모드' : 
                     isCollaborationMode() ? '2인 매칭 완료' : '상대 대기 중';
    
    const authorityText = isHtmlMode ? '나 (HTML 모드)' :
                         isSoloMode() ? '나 (1인 모드)' :
                         activeStenographer === myRole ? '나' : '상대';
    
    utilityStatus.innerHTML =
      `<div>내 역할: <b>속기사${myRole}</b></div>`+
      `<div>채널: <b>${channel}</b></div>`+
      `<div>매칭 상태: <b>${modeText}</b></div>`+
      `<div>입력권한: <b>${authorityText}</b></div>`+
      `<div>누적 텍스트 길이: <b>${accumulatedText.length}자</b></div>`+
      `<div>전체 텍스트 길이: <b>${fullTextStorage.length}자</b></div>`+ // 추가
      (isCollaborationMode() && !isHtmlMode ? `<div>상대 입력창: <b>${otherEditorChars}자</b></div>` : '') +
      `<div>등록된 상용구: <b>${Object.keys(userPhrases).length}개</b></div>`;
  }
  
  updatePerformanceInfo();
}

setInterval(updateUtility, 1000);

// 애니메이션 트리거 변환 함수들
function processRealisticEmotions(text) {
  let processedText = text;
  let effectClass = '';
  let svgElement = '';
  if (text.includes('(진동)')) {
    processedText = text.replace(/\(진동\)/g, '📳');
    effectClass = 'shake';
  } else if (text.includes('(페이드)')) {
    processedText = text.replace(/\(페이드\)/g, '✨');
    effectClass = 'fade-in';
  } else if (text.includes('(확대)')) {
    processedText = text.replace(/\(확대\)/g, '🔍');
    effectClass = 'zoom';
  } else if (text.includes('(무지개)')) {
    processedText = text.replace(/\(무지개\)/g, '🌈');
    effectClass = 'gradient-text';
  } else if (text.includes('(네온)')) {
    processedText = text.replace(/\(네온\)/g, '💡');
    effectClass = 'neon';
  } else if (text.includes('(타자기)')) {
    processedText = text.replace(/\(타자기\)/g, '⌨️');
    effectClass = 'typewriter';
  } else if (text.includes('(회전)')) {
    processedText = text.replace(/\(회전\)/g, '🔄');
    effectClass = 'rotate';
  } else if (text.includes('(왼슬라이드)')) {
    processedText = text.replace(/\(왼슬라이드\)/g, '←');
    effectClass = 'slide-left';
  } else if (text.includes('(오른슬라이드)')) {
    processedText = text.replace(/\(오른슬라이드\)/g, '→');
    effectClass = 'slide-right';
  } else if (text.includes('(파티)')) {
    processedText = text.replace(/\(파티\)/g, '🎉');
    effectClass = 'bg-party';
  } else if (text.includes('(파동)')) {
    processedText = text.replace(/\(파동\)/g, '〰️');
    effectClass = 'wave-shadow';
  } else if (text.includes('(파티클)')) {
    processedText = text.replace(/\(파티클\)/g, '⭐');
    effectClass = 'simple-particle';
  } else if (text.includes('(블러)')) {
    processedText = text.replace(/\(블러\)/g, '👁️');
    effectClass = 'blur-in';
  } else if (text.includes('(글리치)')) {
    processedText = text.replace(/\(글리치\)/g, '📺');
    effectClass = 'glitch';
  } else if (text.includes('(하트)')) {
    svgElement = `<svg width="30" height="30" viewBox="0 0 24 24" style="display:inline-block;margin:0 5px;vertical-align:middle;"><path d="M12,21.35l-1.45-1.32C5.4,15.36,2,12.28,2,8.5 C2,5.42,4.42,3,7.5,3c1.74,0,3.41,0.81,4.5,2.09C13.09,3.81,14.76,3,16.5,3 C19.58,3,22,5.42,22,8.5c0,3.78-3.4,6.86-8.55,11.54L12,21.35z" fill="red"><animateTransform attributeName="transform" type="scale" values="1;1.2;1" dur="1s" repeatCount="indefinite"/></path></svg>`;
    processedText = text.replace(/\(하트\)/g, svgElement);
    effectClass = 'heart';
  } else if (text.includes('(별)')) {
    svgElement = `<svg width="30" height="30" viewBox="0 0 24 24" style="display:inline-block;margin:0 5px;vertical-align:middle;"><path d="M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.46,13.97L5.82,21L12,17.27Z" fill="gold"><animateTransform attributeName="transform" type="rotate" values="0 12 12;360 12 12" dur="2s" repeatCount="2"/><animate attributeName="fill" values="gold;yellow;gold" dur="1s" repeatCount="3"/></path></svg>`;
    processedText = text.replace(/\(별\)/g, svgElement);
    effectClass = 'stars';
  } else if (text.includes('(파도)')) {
    svgElement = `<svg width="50" height="25" viewBox="0 0 50 25" style="display:inline-block;margin:0 5px;vertical-align:middle;"><path d="M0,12 Q12,2 25,12 T50,12" stroke="cyan" stroke-width="2" fill="none"><animate attributeName="d" values="M0,12 Q12,2 25,12 T50,12;M0,12 Q12,22 25,12 T50,12;M0,12 Q12,2 25,12 T50,12" dur="2s" repeatCount="indefinite"/></path></svg>`;
    processedText = text.replace(/\(파도\)/g, svgElement);
    effectClass = 'wave';
  } else if (text.includes('(펄스)')) {
    svgElement = `<svg width="40" height="40" viewBox="0 0 40 40" style="display:inline-block;margin:0 5px;vertical-align:middle;"><circle cx="20" cy="20" r="3" fill="lime"><animate attributeName="r" values="3;15;3" dur="1s" repeatCount="3"/><animate attributeName="opacity" values="1;0.2;1" dur="1s" repeatCount="3"/></circle><circle cx="20" cy="20" r="8" fill="none" stroke="lime" stroke-width="2"><animate attributeName="r" values="8;20;8" dur="1s" repeatCount="3"/><animate attributeName="opacity" values="0.8;0;0.8" dur="1s" repeatCount="3"/></circle></svg>`;
    processedText = text.replace(/\(펄스\)/g, svgElement);
    effectClass = 'neon';
  }
  return { text: processedText, effect: effectClass };
}

// 줄별 애니메이션 변환 함수
function processRealisticEmotionsLineByLine(text) {
  if (isViewerEditing) {
    // 편집 모드에서는 애니메이션 처리하지 않음
    return text.split('\n').map(line => `<span>${line}</span>`).join('<br>');
  }
  
  const lines = text.split('\n');
  return lines.map(line => {
    const { text: processed, effect } = processRealisticEmotions(line);
    return `<span class="${effect || ''}">${processed}</span>`;
  }).join('<br>');
}

// --- 실시간 협업 로직과 HTML 모드 로직 ---
const params = new URLSearchParams(window.location.search);
const channel = params.get('channel') || 'default';
let myRole = params.get('role') || '1';
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
roleInfo.textContent = `속기사${myRole}`;
statusInfo.textContent = isHtmlMode ? 'HTML 모드' : '접속 중';

let stenoList = [];
let activeStenographer = '1';
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
let inputOptimizationCounter = 0;
let manualSwitchCooldown = false;
let isSwitchingRole = false;

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

// 초기 레이아웃 렌더링
renderLayout();

// 소켓 모드에서만 필요한 함수들
function getLastNWords(str, n) {
  if (!str || typeof str !== 'string' || !n || n <= 0) {
    return '';
  }
  
  try {
    const words = str.split(' ').filter(Boolean);
    const result = words.slice(-n).join(' ');
    return result;
  } catch (error) {
    return '';
  }
}

// switch_role 이벤트 핸들러 수정
socket.on('switch_role', ({ newActive, matchedText, accumulatedText: serverAccum, previousActive, manual, matchStartIndex, matchWordCount: matchCount }) => {
    try {
      const wasIActive = (activeStenographer === myRole);
      activeStenographer = newActive === 'steno1' ? '1' : '2';
      const amINowActive = (activeStenographer === myRole);
      
      // 권한 전환 시 편집 모드 자동 해제
      if (isViewerEditing && (wasIActive !== amINowActive)) {
        console.log('[권한 전환] 뷰어 편집 모드 자동 해제');
        cancelViewerEdit();
      }
      
      if (manual) {
        console.log('[수동 전환 완료]', wasIActive ? '권한 상실' : '권한 획득');
      }
      
      if (typeof serverAccum === 'string') {
        accumulatedText = serverAccum;
        fullTextStorage = serverAccum; // 전체 텍스트도 업데이트
        updateMonitoringFromText(accumulatedText);
        updateViewerContent();
      }
      
      updateStatus();
      
      if (amINowActive && !wasIActive) {
  // 대기자 → 권한자로 전환된 경우
  if (sendInputTimeout) {
    clearTimeout(sendInputTimeout);
    sendInputTimeout = null;
  }
  
  // 권한 전환 시 입력창 처리
  if (myEditor) {
    if (manual) {
      // 수동 전환: 입력창 비우기
      myEditor.value = '';
    } else {
      // 자동 매칭: 권한자가 입력한 부분까지만 제거
      const currentText = myEditor.value;
      const words = currentText.split(' ').filter(Boolean);
      
      // 매칭이 모든 단어를 포함하는지 확인
if (typeof matchStartIndex === 'number' && matchCount) {
  console.log('[권한 획득] 자동 매칭 처리:', {
    전체단어수: words.length,
    매칭시작: matchStartIndex,
    매칭개수: matchCount,
    제거전: currentText
  });
  
  // 매칭이 전체 입력을 포함하면 완전히 비우기
  if (matchStartIndex === 0 && matchCount >= words.length) {
    myEditor.value = '';
  } else {
    // 부분 매칭인 경우만 해당 부분 제거
    words.splice(matchStartIndex, matchCount);
    myEditor.value = words.length > 0 ? words.join(' ') + ' ' : '';
  }
  
  // 한글 IME 조합 상태 강제 초기화
  myEditor.blur();
  setTimeout(() => {
    myEditor.focus();
  }, 10);
} else {
  myEditor.value = '';
}
      
      console.log('[권한 획득] 제거 후:', myEditor.value);
    }
    
    // 변경된 내용 서버로 전송
    if (socket.connected) {
      socket.emit('steno_input', { 
        channel: channel, 
        role: `steno${myRole}`, 
        text: myEditor.value 
      });
      lastSentText = myEditor.value;
    }
  }
// 권한 전환 직후 강제로 한 번 더 전송
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
  // 권한자 → 대기자로 전환된 경우
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
      
      // 상대방 입력창도 비우기
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


function checkWordMatchingAsWaiting() {
  if (isHtmlMode) return;
  
  // 이미 권한자인 경우 체크하지 않음
  if (myRole === activeStenographer) {
    console.log('[대기자 매칭] 이미 권한자임 - 매칭 체크 중단');
    return;
  }
  
  const myWordsArr = myEditor.value.split(' ').filter(Boolean);
  
  // 권한자의 입력이 없으면 체크하지 않음
  if (!otherEditor.value) {
    return;
  }
  
// 권한자의 현재 입력만 비교
const currentViewerText = accumulatedText + otherEditor.value;
  
  console.log('[대기자 매칭 체크]', {
    '내 역할': myRole,
    '현재 권한자': activeStenographer,
    '내 입력 단어수': myWordsArr.length,
    '권한자 입력': otherEditor.value.slice(-50) + '...',
    '뷰어 끝부분': currentViewerText.slice(-50) + '...'
  });
  
  // 대기자의 모든 가능한 연속 N단어 조합 확인
  for (let startIdx = 0; startIdx <= myWordsArr.length - matchWordCount; startIdx++) {
    const candidateWords = myWordsArr.slice(startIdx, startIdx + matchWordCount).join(' ');
    
    if (candidateWords && matchWordCount >= 3) {
      // 뷰어 텍스트 끝과 매칭되는지 확인 (대소문자 구분 없이)
      const trimmedViewer = currentViewerText.trim().toLowerCase();
      const trimmedCandidate = candidateWords.trim().toLowerCase();
      
      console.log(`[매칭 시도 ${startIdx}]`, {
        '후보 단어': candidateWords,
        '뷰어 끝 20자': trimmedViewer.slice(-20),
        '매칭 여부': trimmedViewer.endsWith(trimmedCandidate)
      });

 // 권한자의 현재 입력에서만 매칭 확인
const activeEditorText = otherEditor.value.trim().toLowerCase();
if (activeEditorText.includes(trimmedCandidate)) {
  // 매칭된 부분까지의 텍스트 추출
  const matchedPartFromActive = getMatchedTextUpToBySequence(otherEditor.value, candidateWords);
  
  if (matchedPartFromActive) {
    console.log(`[매칭 성공!] 위치 ${startIdx}에서 "${candidateWords}" 매칭`);
    
    // 서버로 보낼 때는 누적 텍스트 포함
    const fullMatchedText = accumulatedText + matchedPartFromActive;
    
    const newActive = myRole === '1' ? 'steno1' : 'steno2';
    
    // 자기 자신으로의 전환 방지
    if ((newActive === 'steno1' && activeStenographer === '1') || 
        (newActive === 'steno2' && activeStenographer === '2')) {
      console.log('[매칭 중단] 이미 해당 역할이 권한자임');
      return;
    }
    
    socket.emit('switch_role', { 
      channel: channel, 
      newActive: newActive, 
      matchedText: fullMatchedText,
      matchStartIndex: startIdx,
      matchWordCount: matchWordCount || 3
    });
console.log('[매칭 전송 확인]', {
  startIdx: startIdx,
  matchWordCount: matchWordCount || 3
});
          
          console.log('[매칭 전송] 서버로 권한 전환 요청 전송 완료');
          return;
        }
      }
    }
  }
}

function getMatchedTextUpToBySequence(fullText, matchSeq) {
  if (!fullText || !matchSeq || typeof fullText !== 'string' || typeof matchSeq !== 'string') {
    console.log('[매칭 함수] 잘못된 입력:', { fullText: !!fullText, matchSeq: !!matchSeq });
    return '';
  }
  
  try {
    const normalizeForMatch = s => s.trim().replace(/\s+/g, ' ').toLowerCase();
    const normalizedFull = normalizeForMatch(fullText);
    const normalizedMatch = normalizeForMatch(matchSeq);
    
    if (!normalizedFull || !normalizedMatch) {
      console.log('[매칭 함수] 정규화 실패');
      return '';
    }
    
    const fullWords = normalizedFull.split(' ').filter(Boolean);
    const matchWords = normalizedMatch.split(' ').filter(Boolean);
    
    if (matchWords.length === 0) {
      console.log('[매칭 함수] 매칭 단어 없음');
      return '';
    }
    
    console.log('[매칭 함수] 검색 중:', {
      '전체 단어 수': fullWords.length,
      '매칭 단어 수': matchWords.length,
      '매칭 시퀀스': matchSeq,
      '전체 끝부분': fullWords.slice(-10).join(' ')
    });
    
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
        console.log(`[매칭 함수] 매칭 발견! 위치: ${i}, 끝 인덱스: ${lastIdx}`);
      }
    }
    
    if (lastIdx === -1) {
      console.log('[매칭 함수] 매칭 실패 - 시퀀스를 찾을 수 없음');
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
    
    const result = fullText.slice(0, idx);
    console.log('[매칭 함수] 결과:', {
      '결과 길이': result.length,
      '결과 끝부분': result.slice(-30) + '...'
    });
    return result;
    
  } catch (error) {
    console.error('[매칭 함수] 에러:', error);
    return '';
  }
}
function checkWordMatchingAsActive() {
  if (isHtmlMode) return;
  
  if (myRole !== activeStenographer) {
    return;
  }
  
  if (!otherEditor.value) {
    return;
  }
  
  const currentViewerText = accumulatedText + myEditor.value;
  const viewerWords = currentViewerText.trim().split(' ').filter(Boolean);
  
  if (viewerWords.length < matchWordCount) {
    return;
  }
  
  const viewerEndWords = viewerWords.slice(-matchWordCount).join(' ').toLowerCase();
  const otherWords = otherEditor.value.trim().split(' ').filter(Boolean);
  
  console.log('[권한자 매칭 체크]', {
    '뷰어 끝 단어': viewerEndWords,
    '대기자 입력 단어수': otherWords.length
  });
  
  for (let startIdx = 0; startIdx <= otherWords.length - matchWordCount; startIdx++) {
    const candidateWords = otherWords.slice(startIdx, startIdx + matchWordCount).join(' ').toLowerCase();
    
    if (candidateWords === viewerEndWords) {
      console.log(`[권한자 매칭 성공!] 대기자의 ${startIdx}번째 위치에서 매칭`);
      
      const newActive = myRole === '1' ? 'steno2' : 'steno1';
      
      socket.emit('switch_role', { 
        channel, 
        newActive, 
        matchedText: currentViewerText,
        matchStartIndex: startIdx,        // ← 이 부분 확인!
        matchWordCount: matchWordCount || 3  // console.log와 동일하게!
});
      
      return;
    }
  }
}
// 수동 권한 전환 함수들
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

// 교정 요청 함수
let correctionRequestTimeout = null;

function requestCorrection() {
  if (isHtmlMode) return;
  
  try {
    if (myRole !== activeStenographer) {
      console.log('[교정 요청] 권한자만 요청할 수 있습니다.');
      return;
    }
    
    // 이전 타이머가 있으면 취소
    if (correctionRequestTimeout) {
      clearTimeout(correctionRequestTimeout);
      correctionRequestTimeout = null;
    }
    
    // 교정 요청 표시 추가 - 항상 내 창(왼쪽)에만 표시
    const myStatusBar = document.getElementById('statusBar1');  // 항상 col1 (왼쪽)
    if (myStatusBar) {
      // 기존 교정 요청 표시 제거
      const existingRequest = myStatusBar.querySelector('.correction-request');
      if (existingRequest) existingRequest.remove();
      
      // 새 교정 요청 표시 추가
      const correctionIndicator = document.createElement('span');
      correctionIndicator.className = 'correction-request';
      correctionIndicator.textContent = '교정 요청';
      correctionIndicator.style.cssText = 'color: #ff8c00; font-weight: bold; margin-left: 16px; animation: blink 1s infinite;';
      myStatusBar.appendChild(correctionIndicator);
    }
    
    // 소켓으로 교정 요청 전송
    if (socket && socket.connected) {
      socket.emit('correction_request', { 
        channel, 
        active: true,
        requester: myRole,
        requesterRole: `steno${myRole}`  // 서버 호환성 유지
      });
    }
    
    console.log('[교정 요청] 활성화됨 (2초 후 자동 해제)');
    
    // 2초 후 자동으로 교정 요청 해제
    correctionRequestTimeout = setTimeout(() => {
      // 교정 요청 표시 제거
      const correctionIndicator = document.querySelector('.correction-request');
      if (correctionIndicator) {
        correctionIndicator.remove();
      }
      
      // 소켓으로 교정 요청 해제 전송
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
    }, 2000);  // 2초
    
  } catch (error) {
    console.error('[교정 요청] 에러:', error);
  }
}

// 수동 최적화 함수
function manualOptimizeEditor() {
  if (!myEditor) return;
  
  const beforeLength = myEditor.value.length;
  const wasOptimized = trimEditorText(myEditor);
  
  if (wasOptimized) {
    const afterLength = myEditor.value.length;
    alert(`입력창이 최적화되었습니다.\n${beforeLength}자 → ${afterLength}자`);
    
    if (!isHtmlMode && socket) {
      socket.emit('editor_optimized', { 
        channel, 
        role: `steno${myRole}`, // 서버 호환성을 위해 steno 형식 사용
        newText: myEditor.value,
        reason: '수동 최적화 실행'
      });
    }
    
    if (isHtmlMode) {
      updateViewerFromEditor();
    } else {
      sendInput();
    }
  } else {
    alert('입력창이 4000자 미만이므로 최적화가 필요하지 않습니다.');
  }
}

// 소켓 이벤트들 (HTML 모드가 아닐 때만)
if (!isHtmlMode && socket) {
  socket.emit('join_channel', { 
    channel, 
    role: 'steno',
    requestSync: true
  });

  socket.on('role_assigned', ({ role }) => {
    myRole = role === 'steno1' ? '1' : '2';
    roleInfo.textContent = `속기사${myRole}`;
    
    activeStenographer = '1';
    
    // 속기사2일 때 위치 교체
    if (myRole === '2') {
        currentPositions = {
            'steno2': 0,  // 속기사2를 왼쪽으로
            'steno1': 1,  // 속기사1을 오른쪽으로
            'viewer': 2,
            'utility': 3
        };
    }
    
    renderLayout();
    updateStatus();
  });

  socket.on('steno_list', ({ stenos }) => {
    const wasCollaboration = isCollaborationMode();
    const wasSolo = isSoloMode();
    
    stenoList = stenos;
    
    const nowCollaboration = isCollaborationMode();
    const nowSolo = isSoloMode();
    
    if (wasSolo && nowCollaboration) {
      console.log('[모드 전환] 1인 → 2인 협업 모드 전환');
      activeStenographer = '1';
    } else if (wasCollaboration && nowSolo) {
      console.log('[모드 전환] 2인 → 1인 모드 전환');
      activeStenographer = myRole;
    } else if (nowCollaboration) {
      activeStenographer = '1';
    }
    
    updateStatus();
    
    if (!stenos.includes('steno1') || !stenos.includes('steno2')) {
      if (otherEditor) otherEditor.value = '';
      updateViewerContent();
    }
    
    updateUtilityStatus();
    
    socket.emit('speaker_sync_request', { channel });
  });

  socket.on('sync_accumulated', ({ accumulatedText: serverAccum }) => {
    accumulatedText = serverAccum || '';
    fullTextStorage = accumulatedText; // 전체 텍스트도 동기화
    updateMonitoringFromText(accumulatedText);
    updateViewerContent();
  });

  socket.on('steno_input', ({ role, text }) => {
  // role 형식 정규화 (steno1 -> 1, steno2 -> 2)
  const senderRole = role.replace('steno', '');
  
  if (senderRole === myRole) return;
  
  // 뷰어 편집 중이면 상대방 입력 무시 (편집 내용 보호)
  if (isViewerEditing && myRole !== activeStenographer) {
    console.log('[입력 보호] 뷰어 편집 중 - 상대방 입력 무시');
    return;
  }
  
  if (isCollaborationMode()) {
    otherEditor.value = text;
    
    trimEditorText(otherEditor);
    
    otherEditor.scrollTop = otherEditor.scrollHeight;
  }
  
  // 상대방이 권한자인 경우 뷰어 업데이트
  if (isCollaborationMode() && senderRole === activeStenographer) {
    updateViewerWithOtherInput(text);
  }
  
  // 내가 권한자인 경우 대기자의 매칭 체크
  if (isCollaborationMode() && myRole === activeStenographer) {
    checkWordMatchingAsActive();
  }
});

  socket.on('editor_optimized', ({ role, newText, reason }) => {
  const senderRole = typeof role === 'string' && role.includes('steno') ? 
    role.replace('steno', '') : role;
  
  if (senderRole !== myRole) {
    otherEditor.value = newText;
    otherEditor.scrollTop = otherEditor.scrollHeight;
    console.log(`[상대방 최적화] ${reason}`);
  }
});

// switch_role 이벤트 핸들러 수정 - 매칭된 단어 제거 로직 강화
socket.on('switch_role', ({ newActive, matchedText, accumulatedText: serverAccum, previousActive, manual, matchStartIndex, matchWordCount: matchCount }) => {
    try {
      const wasIActive = (activeStenographer === myRole);
      activeStenographer = newActive === 'steno1' ? '1' : '2';
      const amINowActive = (activeStenographer === myRole);
      
      console.log('[권한 전환 디버그]', {
        이전권한자: previousActive,
        새권한자: newActive,
        내역할: myRole,
        매칭시작위치: matchStartIndex,
        매칭단어수: matchCount,
        수동전환: manual
      });
      
      // 권한 전환 시 편집 모드 자동 해제
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
        // 대기자 → 권한자로 전환된 경우
        if (sendInputTimeout) {
          clearTimeout(sendInputTimeout);
          sendInputTimeout = null;
        }
        
        // 매칭 정보가 있으면 해당 부분만 제거
        if (myEditor && typeof matchStartIndex === 'number' && matchCount) {
          const originalText = myEditor.value;
          const words = originalText.split(' ').filter(Boolean);
          
          console.log('[매칭 단어 제거]', {
            원본텍스트: originalText,
            전체단어수: words.length,
            제거시작: matchStartIndex,
            제거개수: matchCount,
            제거될단어: words.slice(matchStartIndex, matchStartIndex + matchCount).join(' ')
          });
          
          // matchStartIndex부터 matchCount개의 단어 제거
          const removedWords = words.splice(matchStartIndex, matchCount);
          
          // 남은 단어들로 입력창 업데이트
          const newText = words.length > 0 ? words.join(' ') + ' ' : '';
          myEditor.value = newText;
          
          console.log('[매칭 단어 제거 완료]', {
            제거된단어: removedWords.join(' '),
            남은텍스트: newText,
            남은단어수: words.length
          });
          
          // 제거 후 즉시 소켓으로 업데이트된 텍스트 전송
          if (socket.connected) {
            socket.emit('steno_input', { 
              channel: channel, 
              role: `steno${myRole}`, 
              text: newText 
            });
            lastSentText = newText;
          }
          
        } else if (manual && myEditor) {
          // 수동 전환인 경우 기존 로직 유지
          myEditor.value = '';
        }
        
        setTimeout(() => {
          if (myEditor) myEditor.focus();
        }, 100);
        
      } else if (!amINowActive && wasIActive) {
        // 권한자 → 대기자로 전환된 경우
        if (myEditor) {
          console.log('[권한 상실] 입력창 비우기');
          myEditor.value = '';
        }
      }
      
      // 상대방 입력창도 비우기
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
  // 화자 관련 소켓 이벤트 - 수정된 버전
  socket.on('speaker_update', ({ action, speaker, speakerId, speakers: allSpeakers }) => {
    const workspace = document.getElementById('speakerWorkspace');
    if (!workspace) return;
    
    switch (action) {
      case 'add':
        if (!speakers.find(s => s.id === speaker.id)) {
          // 새 화자에게 올바른 번호 부여
          speaker.number = speakers.length + 1;
          speakers.push(speaker);
          const speakerBox = createSpeakerElement(speaker);
          workspace.appendChild(speakerBox);
          
          const idNum = parseInt(speaker.id.split('_')[1]) || 0;
          if (idNum > speakerIdCounter) {
            speakerIdCounter = idNum;
          }
        }
        break;
        
      case 'edit':
        const existingSpeaker = speakers.find(s => s.id === speaker.id);
        if (existingSpeaker) {
          existingSpeaker.name = speaker.name;
          const speakerBox = document.getElementById(speaker.id);
          if (speakerBox && !speakerBox.classList.contains('editing')) {
            // 번호와 이름 함께 표시
            speakerBox.innerHTML = '';
            
            const numberSpan = document.createElement('span');
            numberSpan.className = 'speaker-number';
            numberSpan.textContent = existingSpeaker.number <= 9 ? circleNumbers[existingSpeaker.number - 1] : '';
            numberSpan.style.cssText = 'color: #ff9500; font-family: Consolas, Monaco, monospace; margin-right: 4px;';
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = speaker.name;
            
            speakerBox.appendChild(numberSpan);
            speakerBox.appendChild(nameSpan);
          }
        }
        break;
        
      case 'move':
        const movedSpeaker = speakers.find(s => s.id === speaker.id);
        if (movedSpeaker) {
          movedSpeaker.x = speaker.x;
          movedSpeaker.y = speaker.y;
          const speakerBox = document.getElementById(speaker.id);
          if (speakerBox && !speakerBox.classList.contains('dragging')) {
            speakerBox.style.left = speaker.x + 'px';
            speakerBox.style.top = speaker.y + 'px';
          }
        }
        break;
        
      case 'delete':
        const deleteIndex = speakers.findIndex(s => s.id === speakerId);
        if (deleteIndex !== -1) {
          speakers.splice(deleteIndex, 1);
          
          // 번호 재정렬
          speakers.forEach((s, idx) => {
            s.number = idx + 1;
          });
          
          // 모든 화자 박스 다시 그리기
          refreshSpeakerWorkspace();
        }
        break;
        
      case 'sync':
        if (allSpeakers) {
          speakers = allSpeakers;
          
          // 번호 재정렬
          speakers.forEach((s, idx) => {
            s.number = idx + 1;
          });
          
          workspace.innerHTML = '';
          speakers.forEach(speaker => {
            const speakerBox = createSpeakerElement(speaker);
            workspace.appendChild(speakerBox);
          });
          
          if (speakers.length > 0) {
            const maxId = Math.max(...speakers.map(s => 
              parseInt(s.id.split('_')[1]) || 0
            ));
            speakerIdCounter = maxId;
          }
        }
        break;
    }
    
    // localStorage 저장 제거
  });

  socket.on('speaker_drag_start', ({ speakerId, userName }) => {
    const speakerBox = document.getElementById(speakerId);
    if (speakerBox && !speakerBox.classList.contains('dragging')) {
      const indicator = document.createElement('div');
      indicator.className = 'drag-indicator';
      indicator.textContent = `${userName} 이동 중...`;
      indicator.style.cssText = `
        position: absolute;
        top: -20px;
        left: 0;
        font-size: 10px;
        color: #5a78ff;
        background: rgba(0,0,0,0.8);
        padding: 2px 6px;
        border-radius: 3px;
        white-space: nowrap;
        z-index: 1000;
      `;
      speakerBox.appendChild(indicator);
    }
  });

  socket.on('speaker_dragging', ({ speakerId, x, y }) => {
    const speakerBox = document.getElementById(speakerId);
    if (speakerBox && !speakerBox.classList.contains('dragging')) {
      speakerBox.style.left = x + 'px';
      speakerBox.style.top = y + 'px';
      
      speakerBox.style.opacity = '0.7';
      speakerBox.style.transition = 'none';
    }
  });

  socket.on('speaker_drag_end', ({ speaker }) => {
    const speakerBox = document.getElementById(speaker.id);
    if (speakerBox) {
      const indicator = speakerBox.querySelector('.drag-indicator');
      if (indicator) {
        indicator.remove();
      }
      
      const movedSpeaker = speakers.find(s => s.id === speaker.id);
      if (movedSpeaker) {
        movedSpeaker.x = speaker.x;
        movedSpeaker.y = speaker.y;
        speakerBox.style.left = speaker.x + 'px';
        speakerBox.style.top = speaker.y + 'px';
      }
      
      speakerBox.style.opacity = '1';
      speakerBox.style.transition = 'all 0.2s';
      
      // localStorage 저장 제거
    }
  });

  // 교정 요청 수신 처리
  socket.on('correction_request', ({ active, requester, requesterRole }) => {
    if (requester !== myRole) {
      // 상대방의 교정 요청을 받음
      // 상대방은 항상 오른쪽(col2)에 있음
      const otherStatusBar = document.getElementById('statusBar2');
      if (otherStatusBar) {
        const existingRequest = otherStatusBar.querySelector('.correction-request-notify');
        
        if (active && !existingRequest) {
          // 교정 요청 알림 표시
          const notifyIndicator = document.createElement('span');
          notifyIndicator.className = 'correction-request-notify';
          notifyIndicator.textContent = '교정 요청 받음';
          notifyIndicator.style.cssText = 'color: #ff8c00; font-weight: bold; margin-left: 16px; animation: blink 1s infinite;';
          otherStatusBar.appendChild(notifyIndicator);
          
          // 대기자인 경우에만 내 창에 추가 알림
          if (myRole !== activeStenographer) {
            const myStatusBar = document.getElementById('statusBar1');  // 항상 col1 (왼쪽)
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
          // 교정 요청 알림 제거
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
      // 다른 속기사가 전송한 경우 동기화
      accumulatedText = newAccumulated;
      fullTextStorage = newAccumulated; // 전체 텍스트도 동기화
      updateViewerContent();
      console.log(`[텍스트 전송 수신] ${sender}가 텍스트 전송`);
    }
  });
  
  // 뷰어 편집 관련 소켓 이벤트
  socket.on('viewer_edit_state', ({ isEditing, editorRole }) => {
    if (isEditing) {
      editorBeingEdited = editorRole;
      // 다른 사용자가 편집 중이면 편집 버튼 비활성화
      const editBtn = document.getElementById('viewerEditBtn');
      if (editBtn && editorRole !== `속기사${myRole}`) {
        editBtn.disabled = true;
        editBtn.title = `${editorRole}가 편집 중입니다`;
      }
      
      // 내가 편집자면 편집 모드 진입
      if (editorRole === `속기사${myRole}`) {
        enterEditMode();
      }
    } else {
      editorBeingEdited = null;
      // 편집 버튼 활성화
      const editBtn = document.getElementById('viewerEditBtn');
      if (editBtn) {
        editBtn.disabled = false;
        editBtn.title = '뷰어 편집';
      }
      
      // 편집 모드 해제
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
    fullTextStorage = newAccumulated; // 전체 텍스트도 동기화
    updateViewerContent();
    console.log(`[뷰어 편집] ${editorRole}가 뷰어 내용을 수정했습니다.`);
  });
  
  socket.on('connect', () => {
    isConnected = true;
    statusInfo.textContent = '접속 중';
    updateUtilityStatus();
  });

  socket.on('disconnect', () => {
    isConnected = false;
    statusInfo.textContent = '연결 끊김';
    
    // 연결 끊김 시 편집 모드 해제
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
    socket.emit('join_channel', { 
      channel, 
      role: 'steno',
      requestSync: true
    });
  });
}

// 페이지 로드 시 초기화 - 수정됨
document.addEventListener('DOMContentLoaded', () => {
  loadUserSettings();
  // loadSpeakers() 호출 제거 - 화자는 항상 빈 상태로 시작
});

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
  
  // F6, F7, F8 단축키 추가
  if (e.key === 'F6') {
    e.preventDefault();
    offerRole();
  } else if (e.key === 'F7') {
    e.preventDefault();
    requestRole();
  } else if (e.key === 'F8') {
    e.preventDefault();
    if (!isHtmlMode && myRole === activeStenographer) {
      requestCorrection();
    }
  }
});

// ========== 자동 저장 기능 시작 ==========
// 자동 저장 최적화: 변경사항이 있을 때만 저장
let lastSaveData = null;

// 5초마다 자동 저장
function enableAutoSave() {
  setInterval(() => {
    try {
      const saveData = {
        channel: channel,
        role: myRole,
        timestamp: new Date().toISOString(),
        
        // 텍스트 데이터
        editor1Text: document.getElementById('editor1')?.value || '',
        editor2Text: document.getElementById('editor2')?.value || '',
        accumulatedText: accumulatedText || '',
        fullTextStorage: fullTextStorage || '', // 전체 텍스트도 저장
        
        // UI 상태
        activeTab: document.querySelector('.tab-btn.active')?.textContent || '상용구',
        fontSize1: fontSizes[0],
        fontSize2: fontSizes[1],
        viewerFontSize: viewerFontSize,
        
        // 상용구 입력
        phraseInput: document.getElementById('phraseInput')?.value || ''
      };
      
      // 변경사항이 있을 때만 저장
      const currentDataStr = JSON.stringify(saveData);
      if (lastSaveData !== currentDataStr) {
        localStorage.setItem(`steno_autosave_${channel}`, currentDataStr);
        lastSaveData = currentDataStr;
        console.log(`[자동저장] ${new Date().toLocaleTimeString()}`);
      }
      
    } catch (error) {
      console.error('[자동저장 실패]', error);
    }
  }, 5000); // 5초마다
}

// 페이지 로드 시 복구
function checkAutoSave() {
  try {
    const saved = localStorage.getItem(`steno_autosave_${channel}`);
    if (!saved) return;
    
    const data = JSON.parse(saved);
    const savedTime = new Date(data.timestamp);
    const now = new Date();
    const diffMinutes = (now - savedTime) / 1000 / 60;
    
    // 30분 이내 데이터만 복구 (자동으로!)
    if (diffMinutes < 30) {
      // confirm과 alert 제거, 바로 복구 진행
      console.log(`[자동저장] ${Math.floor(diffMinutes)}분 전 데이터 자동 복구 중...`);
      
      // 텍스트 복구
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
      
      // 폰트 크기 복구
      if (data.fontSize1) fontSizes[0] = data.fontSize1;
      if (data.fontSize2) fontSizes[1] = data.fontSize2;
      if (data.viewerFontSize) viewerFontSize = data.viewerFontSize;
      
      // 화면 업데이트
      if (isHtmlMode) {
        updateViewerFromEditor();
      } else {
        updateViewerContent();
      }
      
      console.log('[자동저장] 복구 완료!');
if (!isHtmlMode && socket && socket.connected) {
  if (myEditor && myEditor.value) {
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

// ========== 자동 저장 기능 끝 ==========

// 전체 텍스트 다운로드 기능 추가
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

// window 객체에 함수들 바인딩 (HTML onclick에서 호출하기 위해)
window.adjustFontSize = adjustFontSize;
window.adjustViewerFontSize = adjustViewerFontSize;
window.toggleCollapse = toggleCollapse;
window.switchTab = switchTab;
window.captureKey = captureKey;
window.registerPhrase = registerPhrase;
window.exportPhrasesText = exportPhrasesText;
window.importPhrasesText = importPhrasesText;
window.deletePhrase = deletePhrase;
window.addSpeaker = addSpeaker;
window.toggleViewerEdit = toggleViewerEdit;
window.resetToDefaultLayout = resetToDefaultLayout;
window.switchLayout = switchLayout;
window.downloadFullText = downloadFullText; // 추가