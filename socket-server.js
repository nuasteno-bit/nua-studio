// socket-server.js - Render 유료 플랜 24시간 운영 버전
// NUA STUDIO 실시간 협업 속기 서버 (24/7 운영 최적화)

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');

// =========================
// 환경 변수 및 설정
// =========================
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// 연결 설정 (Render 유료 플랜 - 24시간 운영)
const HEARTBEAT_TIMEOUT = 30000; // 30초
const PING_INTERVAL = 25000; // 25초
const PING_TIMEOUT = 60000; // 60초

// 추후 데이터베이스 연동 옵션 (유료 플랜 확장 가능)
// const REDIS_URL = process.env.REDIS_URL;  // Redis for session/cache
// const DATABASE_URL = process.env.DATABASE_URL;  // PostgreSQL for persistence

// =========================
// 메모리 기반 데이터 저장소 
// 24/7 운영용 - 추후 Redis/PostgreSQL 연동 가능
// =========================
const channelDatabase = new Map();        // 채널 메타 정보
const stenoChannels = {};                 // 채널별 속기사 소켓 [{id, role}]
const channelStates = {};                 // 채널별 상태 { activeStenographer, accumulatedText, lastSwitchText }
const channelSpeakers = {};               // 채널별 화자 리스트
const channelEditStates = {};             // 채널별 뷰어 편집 상태
const recentMessages = new Map();         // 중복방지 (socket.emit 훅)
const channelBackups = {};                // 채널별 백업 데이터 (복구용)
const connectionStats = new Map();        // 연결 통계

// =========================
// Helper 함수들
// =========================
function listRolesPresent(channel) {
  return (stenoChannels[channel] || []).map(s => s.role);
}

function hasRole(channel, role) {
  return (stenoChannels[channel] || []).some(s => s.role === role);
}

function ensureActiveConsistent(channel) {
  if (!channelStates[channel]) {
    channelStates[channel] = { 
      activeStenographer: 'steno1', 
      accumulatedText: '', 
      lastSwitchText: '',
      lastActivity: Date.now()
    };
  }
  
  const present = listRolesPresent(channel);
  const current = channelStates[channel].activeStenographer || 'steno1';
  
  if (present.length === 0) return current;
  
  if (present.length === 1) {
    // 1인 전환 시: 남아있는 사람을 자동 활성화
    channelStates[channel].activeStenographer = present[0];
    return present[0];
  }
  
  // 2인인데 active가 접속 목록에 없으면 첫 사람으로 지정
  if (!present.includes(current)) {
    channelStates[channel].activeStenographer = present[0];
  }
  
  return channelStates[channel].activeStenographer;
}

function broadcastActiveRole(io, channel) {
  const active = ensureActiveConsistent(channel);
  io.to(channel).emit('active_role', { active });
  return active;
}

// 채널 백업 함수
function backupChannelState(channel) {
  if (channelStates[channel]) {
    channelBackups[channel] = {
      ...channelStates[channel],
      backupTime: Date.now()
    };
    console.log(`[백업] 채널 ${channel} 상태 백업 완료`);
  }
}

// 채널 복구 함수 (24시간 운영용)
function restoreChannelState(channel) {
  if (channelBackups[channel]) {
    const backup = channelBackups[channel];
    // 2시간 이내 백업 복구 (유료 플랜용 확대)
    if (Date.now() - backup.backupTime < 2 * 60 * 60 * 1000) {
      channelStates[channel] = {
        ...backup,
        lastActivity: Date.now()
      };
      console.log(`[복구] 채널 ${channel} 상태 복구 완료`);
      return true;
    }
  }
  return false;
}

// 메모리 정리 함수 (24시간 운영 최적화)
function cleanupInactiveChannels() {
  const now = Date.now();
  const INACTIVE_THRESHOLD = 2 * 60 * 60 * 1000; // 2시간 (유료 플랜용 확대)
  
  let cleanedCount = 0;
  
  // 비활성 채널 정리
  for (const [channel, state] of Object.entries(channelStates)) {
    if (now - state.lastActivity > INACTIVE_THRESHOLD && (!stenoChannels[channel] || stenoChannels[channel].length === 0)) {
      delete channelStates[channel];
      delete stenoChannels[channel];
      delete channelSpeakers[channel];
      delete channelEditStates[channel];
      delete channelBackups[channel];
      channelDatabase.delete(channel);
      cleanedCount++;
    }
  }
  
  // 오래된 백업 정리 (24시간 이상)
  for (const [channel, backup] of Object.entries(channelBackups)) {
    if (now - backup.backupTime > 24 * 60 * 60 * 1000) {
      delete channelBackups[channel];
      cleanedCount++;
    }
  }
  
  // 오래된 메시지 정리
  for (const [key, time] of recentMessages.entries()) {
    if (now - time > 1000) {
      recentMessages.delete(key);
    }
  }
  
  // 오래된 연결 통계 정리 (7일 이상)
  for (const [key, stat] of connectionStats.entries()) {
    if (now - stat.firstConnect > 7 * 24 * 60 * 60 * 1000) {
      connectionStats.delete(key);
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`[메모리 정리] ${cleanedCount}개 항목 정리 완료`);
  }
}

// =========================
// Express 앱 설정
// =========================
const app = express();
const server = http.createServer(app);

// 보안 및 최적화 미들웨어
app.use(helmet({ 
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false 
}));
app.use(compression());
app.use(cors({
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// =========================
// 헬스체크 엔드포인트 (24/7 모니터링용)
// =========================
app.get('/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  const uptime = process.uptime();
  
  res.status(200).json({
    status: 'healthy',
    service: 'NUA STUDIO Socket Server',
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: uptime,
      formatted: `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
    },
    memory: {
      rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(1)} MB`,
      heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(1)} MB`,
      heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(1)} MB`,
      external: `${(memoryUsage.external / 1024 / 1024).toFixed(1)} MB`
    },
    channels: {
      active: Object.keys(channelStates).length,
      total: channelDatabase.size,
      connections: Array.from(connectionStats.values()).reduce((sum, stat) => sum + stat.count, 0)
    },
    performance: {
      avgResponseTime: '< 50ms',
      operatingMode: '24/7 Premium'
    },
    environment: NODE_ENV,
    version: '2.0.0'
  });
});

// 서버 상태 엔드포인트
app.get('/status', (req, res) => {
  res.status(200).json({ 
    status: 'active',
    timestamp: Date.now(),
    version: '2.0.0'
  });
});

// 성능 모니터링 엔드포인트 (24/7 운영 모니터링)
app.get('/api/metrics', (req, res) => {
  const metrics = {
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    },
    channels: {
      active: Object.keys(channelStates).length,
      total: channelDatabase.size,
      backups: Object.keys(channelBackups).length
    },
    connections: {
      current: io.engine.clientsCount,
      today: Array.from(connectionStats.values())
        .filter(stat => Date.now() - stat.firstConnect < 24 * 60 * 60 * 1000)
        .reduce((sum, stat) => sum + stat.count, 0)
    },
    performance: {
      messagesProcessed: Array.from(connectionStats.values())
        .reduce((sum, stat) => sum + (stat.messageCount || 0), 0),
      lastCleanup: new Date(Date.now() - (Date.now() % (10 * 60 * 1000))).toISOString()
    }
  };
  
  res.status(200).json(metrics);
});

// =========================
// Socket.IO 서버 설정
// =========================
const io = new Server(server, {
  cors: { 
    origin: '*', 
    methods: ['GET', 'POST'] 
  },
  transports: ['websocket', 'polling'],
  pingInterval: PING_INTERVAL,
  pingTimeout: PING_TIMEOUT,
  // Render 최적화 설정
  perMessageDeflate: {
    threshold: 1024 // 1KB 이상만 압축
  },
  httpCompression: true,
  maxHttpBufferSize: 1e6 // 1MB
});

// =========================
// 관리자 인증 시스템
// =========================
const ADMIN_ACCOUNTS = {
  'admin': { password: process.env.ADMIN_PASSWORD || '123456s', role: 'system_admin' }
};
const activeSessions = new Map();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function requireAuth(req, res, next) {
  const token = req.headers['authorization'];
  if (!token || !activeSessions.has(token)) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.user = activeSessions.get(token);
  next();
}

// =========================
// 채널 REST API
// =========================
app.post('/api/channel/create', (req, res) => {
  try {
    const { code, type, passkey, eventName, eventDateTime } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Channel code is required' });
    }
    
    if (channelDatabase.has(code)) {
      return res.status(400).json({ error: 'Channel already exists' });
    }
    
    const channelInfo = {
      code,
      type: type || 'public',
      passkey: type === 'secured' ? passkey : null,
      eventName: eventName || '',
      eventDateTime: eventDateTime || null,
      createdAt: new Date(),
    };
    
    channelDatabase.set(code, channelInfo);
    console.log(`[API] Channel created: ${code}`);
    res.json({ success: true, channel: channelInfo });
  } catch (error) {
    console.error('[API] Channel create error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/channels', (req, res) => {
  try {
    const channels = Array.from(channelDatabase.values()).map(ch => ({
      ...ch,
      activeUsers: Array.isArray(stenoChannels[ch.code]) ? stenoChannels[ch.code].length : 0,
      accumulated: channelStates[ch.code]?.accumulatedText.length || 0
    }));
    res.json(channels);
  } catch (error) {
    console.error('[API] Channels list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================
// Socket.IO 이벤트 핸들러
// =========================
io.on('connection', (socket) => {
  const clientIP = socket.handshake.address;
  console.log(`[연결] Socket connected: ${socket.id} from ${clientIP}`);
  
  // 연결 통계 업데이트
  const statKey = `${clientIP}_${new Date().toDateString()}`;
  if (!connectionStats.has(statKey)) {
    connectionStats.set(statKey, { count: 0, firstConnect: Date.now() });
  }
  connectionStats.get(statKey).count++;
  
  // 소켓별 상태 초기화
  socket.data = {
    channel: null,
    role: null,
    lastActivity: Date.now(),
    messageCount: 0
  };
  
  // 중복 emit 방지 래퍼
  const originalEmit = socket.emit;
  socket.emit = function(...args) {
    if (args[0] === 'steno_input' && args[1]) {
      const key = `${socket.id}_${args[1].text}`;
      const now = Date.now();
      const last = recentMessages.get(key);
      
      if (last && now - last < 50) {
        return; // 중복 차단
      }
      
      recentMessages.set(key, now);
      setTimeout(() => recentMessages.delete(key), 100);
    }
    return originalEmit.apply(this, args);
  };

  // -------- 채널 입장 --------
  socket.on('join_channel', ({ channel, role, requestSync, currentInput, lastData }) => {
    try {
      console.log(`[${channel}] Join request - Role: ${role}, Socket: ${socket.id}`);
      
      socket.join(channel);
      socket.data.channel = channel;
      
      // 채널 상태 초기화 또는 복구
      if (!channelStates[channel]) {
        if (!restoreChannelState(channel)) {
          channelStates[channel] = {
            activeStenographer: 'steno1',
            accumulatedText: '',
            lastSwitchText: '',
            lastActivity: Date.now()
          };
        }
      }
      
      channelStates[channel].lastActivity = Date.now();
      
      const isStenoJoin = role === 'steno' || role === 'steno1' || role === 'steno2';
      
      if (isStenoJoin) {
        if (!stenoChannels[channel]) {
          stenoChannels[channel] = [];
          channelEditStates[channel] = { isEditing: false, editorId: null, editorRole: null };
        }
        
        // 최대 2명 제한
        if (stenoChannels[channel].length >= 2) {
          socket.emit('join_reject', { reason: 'Channel full (max 2 stenographers)' });
          console.log(`[${channel}] Join rejected: capacity exceeded`);
          return;
        }
        
        // 역할 할당
        let myRole;
        const hasSteno1 = hasRole(channel, 'steno1');
        const hasSteno2 = hasRole(channel, 'steno2');
        
        if (!hasSteno1) {
          myRole = 'steno1';
        } else if (!hasSteno2) {
          myRole = 'steno2';
        } else {
          myRole = 'steno1'; // 폴백
        }
        
        stenoChannels[channel].push({ id: socket.id, role: myRole });
        socket.data.role = myRole;
        
        console.log(`[${channel}] Role assigned: ${myRole} to ${socket.id}`);
        
        // 속기사 목록 브로드캐스트
        const stenos = listRolesPresent(channel);
        io.to(channel).emit('steno_list', { stenos });
        
        // 역할 할당 통지
        socket.emit('role_assigned', { role: myRole });
        
        // 활성 역할 브로드캐스트
        broadcastActiveRole(io, channel);
        
        // 누적 텍스트 동기화
        if (requestSync || channelStates[channel]?.accumulatedText) {
          socket.emit('sync_accumulated', {
            accumulatedText: channelStates[channel]?.accumulatedText || ''
          });
        }
        
        // 2인 매칭 시 서로의 현재 입력 상태 요청
        if (stenoChannels[channel].length === 2) {
          const otherSteno = stenoChannels[channel].find(s => s.id !== socket.id);
          if (otherSteno) {
            // 기존 속기사에게 새 속기사 입장 알림 (입력 상태 공유 요청)
            io.to(otherSteno.id).emit('partner_joined', {
              newPartner: myRole,
              requestSync: true
            });
          }
        }
        
        // 편집 상태 동기화
        if (channelEditStates[channel]?.isEditing) {
          socket.emit('viewer_edit_state', {
            isEditing: true,
            editorRole: channelEditStates[channel].editorRole
          });
        }
        
      } else {
        // 뷰어로 입장
        socket.data.role = 'viewer';
        io.to(channel).emit('user_joined', { role: 'viewer' });
        
        broadcastActiveRole(io, channel);
        
        if (channelStates[channel]?.accumulatedText) {
          socket.emit('sync_accumulated', {
            accumulatedText: channelStates[channel].accumulatedText
          });
        }
        
        console.log(`[${channel}] Viewer joined: ${socket.id}`);
      }
      
    } catch (error) {
      console.error('[join_channel] Error:', error);
      socket.emit('error', { message: 'Failed to join channel' });
    }
  });

  // -------- 입력 처리 (개선된 실시간 공유) --------
  socket.on('steno_input', ({ channel, role, text, isSync }) => {
    try {
      // 레이트 리밋 체크
      socket.data.messageCount++;
      
      // 통계 업데이트
      const clientIP = socket.handshake.address;
      const statKey = `${clientIP}_${new Date().toDateString()}`;
      if (connectionStats.has(statKey)) {
        connectionStats.get(statKey).messageCount = (connectionStats.get(statKey).messageCount || 0) + 1;
      }
      
      if (socket.data.messageCount > 100) {
        const timeDiff = Date.now() - socket.data.lastActivity;
        if (timeDiff < 1000) {
          console.log(`[레이트 리밋] ${socket.id} 과도한 메시지`);
          return;
        }
        socket.data.messageCount = 0;
      }
      
      socket.data.lastActivity = Date.now();
      
      const ch = channel || socket.data.channel;
      const serverRole = socket.data.role || role || 'viewer';
      const active = ensureActiveConsistent(ch);
      
      // 채널 활동 시간 업데이트
      if (channelStates[ch]) {
        channelStates[ch].lastActivity = Date.now();
      }
      
      // 권한자와 대기자 구분 처리
      if (serverRole !== active) {
        // 대기자 입력: 다른 속기사에게만 실시간 전송 (뷰어 제외)
        const stenoPeers = stenoChannels[ch] || [];
        stenoPeers.forEach(s => {
          if (s.id !== socket.id) {
            io.to(s.id).emit('steno_input', { 
              role: serverRole, 
              text,
              isSync: isSync || false
            });
          }
        });
        
        console.log(`[${ch}] 대기자 입력 공유: ${serverRole}, ${text.length}자`);
      } else {
        // 권한자 입력: 모든 참가자에게 전송
        socket.broadcast.to(ch).emit('steno_input', { 
          role: serverRole, 
          text,
          isSync: isSync || false
        });
        
        console.log(`[${ch}] 권한자 입력 송출: ${serverRole}, ${text.length}자`);
      }
      
    } catch (error) {
      console.error('[steno_input] Error:', error);
    }
  });

  // -------- 역할 전환 --------
  socket.on('switch_role', ({ channel, newActive, matchedText, manual, reason, matchStartIndex, matchWordCount }) => {
    try {
      const ch = channel || socket.data.channel;
      
      if (!channelStates[ch]) {
        channelStates[ch] = {
          activeStenographer: 'steno1',
          accumulatedText: '',
          lastSwitchText: '',
          lastActivity: Date.now()
        };
      }
      
      if (newActive !== 'steno1' && newActive !== 'steno2') return;
      
      // 실제 접속자 검증
      if (!hasRole(ch, newActive)) {
        console.log(`[${ch}] Switch denied - ${newActive} not present`);
        return;
      }
      
      const currentActive = ensureActiveConsistent(ch);
      if (currentActive === newActive) {
        console.log(`[${ch}] Switch aborted - ${newActive} already active`);
        return;
      }
      
      const previousActive = currentActive;
      channelStates[ch].activeStenographer = newActive;
      channelStates[ch].lastActivity = Date.now();
      
      // 누적 텍스트 업데이트
      if (matchedText && matchedText.trim()) {
        const before = channelStates[ch].accumulatedText.length;
        channelStates[ch].accumulatedText = matchedText;
        const after = channelStates[ch].accumulatedText.length;
        
        // 백업
        backupChannelState(ch);
        
        console.log(`[${ch}] Text accumulated: ${before} -> ${after} chars`);
      }
      
      // 활성자 방송
      broadcastActiveRole(io, ch);
      
      // 스위치 이벤트 방송
      io.to(ch).emit('switch_role', {
        newActive,
        matchedText,
        accumulatedText: channelStates[ch].accumulatedText,
        previousActive,
        manual: !!manual,
        matchStartIndex,
        matchWordCount
      });
      
      console.log(`[${ch}] ${manual ? 'Manual' : 'Auto'} switch: ${previousActive} -> ${newActive}`);
      
    } catch (error) {
      console.error('[switch_role] Error:', error);
    }
  });

  // -------- 강제 권한 전환 --------
  socket.on('force_role_switch', ({ channel, newActive, reason }) => {
    try {
      const ch = channel || socket.data.channel;
      
      if (!channelStates[ch]) {
        channelStates[ch] = {
          activeStenographer: 'steno1',
          accumulatedText: '',
          lastSwitchText: '',
          lastActivity: Date.now()
        };
      }
      
      if (newActive !== 'steno1' && newActive !== 'steno2') return;
      
      if (!hasRole(ch, newActive)) {
        console.log(`[${ch}] Force switch denied - ${newActive} not present`);
        return;
      }
      
      const previousActive = channelStates[ch].activeStenographer;
      channelStates[ch].activeStenographer = newActive;
      channelStates[ch].lastActivity = Date.now();
      
      io.to(ch).emit('force_role_switch', { newActive, previousActive });
      console.log(`[${ch}] Force switch: ${previousActive} -> ${newActive} (${reason})`);
      
    } catch (error) {
      console.error('[force_role_switch] Error:', error);
    }
  });

  // -------- 텍스트 전송 확정 --------
  socket.on('text_sent', ({ channel, accumulatedText, sender }) => {
    try {
      const ch = channel || socket.data.channel;
      console.log(`[${ch}] Text sent by ${sender}`);
      
      if (channelStates[ch]) {
        channelStates[ch].accumulatedText = accumulatedText;
        channelStates[ch].lastActivity = Date.now();
        
        // 주기적 백업
        backupChannelState(ch);
      }
      
      socket.broadcast.to(ch).emit('text_sent', { accumulatedText, sender });
      
    } catch (error) {
      console.error('[text_sent] Error:', error);
    }
  });

  // -------- 파트너 입장 알림 (실시간 동기화) --------
  socket.on('partner_joined_ack', ({ channel }) => {
    // 클라이언트가 파트너 입장을 인지하고 응답
    console.log(`[${channel}] Partner sync acknowledged`);
  });

  // -------- 교정 요청 --------
  socket.on('correction_request', ({ channel, active, requester, requesterRole }) => {
    try {
      const ch = channel || socket.data.channel;
      socket.broadcast.to(ch).emit('correction_request', { 
        active, 
        requester, 
        requesterRole 
      });
      
    } catch (error) {
      console.error('[correction_request] Error:', error);
    }
  });

  // -------- 뷰어 편집 --------
  socket.on('viewer_edit_start', ({ channel, editorRole }) => {
    try {
      const ch = channel || socket.data.channel;
      
      if (!channelEditStates[ch]) {
        channelEditStates[ch] = { isEditing: false, editorId: null, editorRole: null };
      }
      
      if (channelEditStates[ch].isEditing) {
        socket.emit('viewer_edit_denied', { 
          reason: `${channelEditStates[ch].editorRole} is already editing` 
        });
        return;
      }
      
      channelEditStates[ch] = { 
        isEditing: true, 
        editorId: socket.id, 
        editorRole: editorRole 
      };
      
      io.to(ch).emit('viewer_edit_state', { isEditing: true, editorRole });
      
    } catch (error) {
      console.error('[viewer_edit_start] Error:', error);
    }
  });

  socket.on('viewer_edit_complete', ({ channel, editedText, editorRole }) => {
    try {
      const ch = channel || socket.data.channel;
      
      if (!channelEditStates[ch]) {
        channelEditStates[ch] = { isEditing: false, editorId: null, editorRole: null };
      }
      
      if (channelEditStates[ch].editorId !== socket.id) {
        console.log(`[${ch}] Edit complete denied - not current editor`);
        return;
      }
      
      if (channelStates[ch]) {
        channelStates[ch].accumulatedText = editedText;
        channelStates[ch].lastActivity = Date.now();
        console.log(`[${ch}] Text updated to ${editedText.length} chars`);
        
        // 백업
        backupChannelState(ch);
      }
      
      channelEditStates[ch] = { isEditing: false, editorId: null, editorRole: null };
      
      io.to(ch).emit('viewer_content_updated', { 
        accumulatedText: editedText, 
        editorRole 
      });
      io.to(ch).emit('viewer_edit_state', { isEditing: false, editorRole: null });
      
    } catch (error) {
      console.error('[viewer_edit_complete] Error:', error);
    }
  });

  socket.on('viewer_edit_cancel', ({ channel }) => {
    try {
      const ch = channel || socket.data.channel;
      
      if (channelEditStates[ch]?.editorId === socket.id) {
        channelEditStates[ch] = { isEditing: false, editorId: null, editorRole: null };
        io.to(ch).emit('viewer_edit_state', { isEditing: false, editorRole: null });
      }
      
    } catch (error) {
      console.error('[viewer_edit_cancel] Error:', error);
    }
  });

  // -------- 채팅 메시지 --------
  socket.on('chat_message', ({ channel, sender, message }) => {
    try {
      const ch = channel || socket.data.channel;
      socket.broadcast.to(ch).emit('chat_message', { sender, message });
      console.log(`[${ch}] Chat from ${sender}: ${message}`);
      
    } catch (error) {
      console.error('[chat_message] Error:', error);
    }
  });

  // -------- 핑/퐁 테스트 --------
  socket.on('ping_test', ({ channel }) => {
    socket.emit('pong_test', { channel, timestamp: Date.now() });
  });

  // -------- Keep-alive (클라이언트) --------
  socket.on('keep_alive', ({ channel, role, dataCheck }) => {
    socket.emit('keep_alive_ack', { timestamp: Date.now() });
    
    if (socket.data.channel) {
      socket.data.lastActivity = Date.now();
    }
  });

  // -------- 백업 상태 저장 --------
  socket.on('backup_state', ({ channel, accumulated, checksum }) => {
    try {
      const ch = channel || socket.data.channel;
      
      if (channelStates[ch] && accumulated) {
        channelStates[ch].accumulatedText = accumulated;
        channelStates[ch].lastActivity = Date.now();
        backupChannelState(ch);
        
        socket.emit('backup_saved', { success: true });
      }
      
    } catch (error) {
      console.error('[backup_state] Error:', error);
      socket.emit('backup_saved', { success: false });
    }
  });

  // -------- 동기화 요청 --------
  socket.on('request_sync', ({ channel }) => {
    try {
      const ch = channel || socket.data.channel;
      
      if (channelStates[ch]) {
        socket.emit('sync_accumulated', {
          accumulatedText: channelStates[ch].accumulatedText || ''
        });
      }
      
    } catch (error) {
      console.error('[request_sync] Error:', error);
    }
  });

  // -------- 연결 해제 --------
  socket.on('disconnect', () => {
    try {
      const ch = socket.data.channel;
      const role = socket.data.role;
      
      console.log(`[연결 해제] Socket disconnected: ${socket.id}`);
      
      if (ch && (role === 'steno1' || role === 'steno2')) {
        if (stenoChannels[ch]) {
          stenoChannels[ch] = stenoChannels[ch].filter(s => s.id !== socket.id);
          const stenos = listRolesPresent(ch);
          io.to(ch).emit('steno_list', { stenos });
          
          // 편집 중이던 사람이면 편집 상태 해제
          if (channelEditStates[ch]?.editorId === socket.id) {
            channelEditStates[ch] = { isEditing: false, editorId: null, editorRole: null };
            io.to(ch).emit('viewer_edit_state', { isEditing: false, editorRole: null });
          }
          
          // 활성자 재조정
          broadcastActiveRole(io, ch);
          
          // 채널 비면 백업
          if (stenoChannels[ch].length === 0) {
            backupChannelState(ch);
            console.log(`[${ch}] Channel empty - backed up`);
          }
        }
      } else if (ch) {
        io.to(ch).emit('user_left', { role });
        console.log(`[${ch}] Viewer left: ${socket.id}`);
      }
      
    } catch (error) {
      console.error('[disconnect] Error:', error);
    }
  });

  // -------- 디버그용 --------
  socket.on('get_channel_state', ({ channel }) => {
    try {
      const ch = channel || socket.data.channel;
      
      if (channelStates[ch]) {
        socket.emit('channel_state', {
          channel: ch,
          state: channelStates[ch],
          stenographers: stenoChannels[ch] || [],
          speakers: channelSpeakers[ch] || [],
          editState: channelEditStates[ch] || { isEditing: false }
        });
      }
      
    } catch (error) {
      console.error('[get_channel_state] Error:', error);
    }
  });
});

// =========================
// 정기 작업 스케줄러 (24/7 운영 최적화)
// =========================

// 메모리 정리 (10분마다 - 유료 플랜용 최적화)
setInterval(() => {
  cleanupInactiveChannels();
  
  // 가비지 컬렉션 강제 실행 (프로덕션 환경에서만)
  if (IS_PRODUCTION && global.gc) {
    global.gc();
    console.log('[GC] 가비지 컬렉션 실행');
  }
}, 10 * 60 * 1000);

// 통계 로깅 (1시간마다)
setInterval(() => {
  const memUsage = process.memoryUsage();
  const stats = {
    timestamp: new Date().toISOString(),
    activeChannels: Object.keys(channelStates).length,
    totalChannels: channelDatabase.size,
    totalConnections: io.engine.clientsCount,
    memory: {
      rss: `${(memUsage.rss / 1024 / 1024).toFixed(1)} MB`,
      heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(1)} MB`,
      heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(1)} MB`
    },
    uptime: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
    backups: Object.keys(channelBackups).length,
    dailyConnections: Array.from(connectionStats.values())
      .filter(stat => Date.now() - stat.firstConnect < 24 * 60 * 60 * 1000)
      .reduce((sum, stat) => sum + stat.count, 0)
  };
  console.log('[통계]', JSON.stringify(stats, null, 2));
}, 60 * 60 * 1000);

// =========================
// 종료 핸들러 (Graceful Shutdown)
// =========================
const gracefulShutdown = (signal) => {
  console.log(`[종료] ${signal} 신호 수신`);
  
  // 모든 채널 백업
  Object.keys(channelStates).forEach(channel => {
    backupChannelState(channel);
  });
  
  server.close(() => {
    console.log('[종료] HTTP 서버 종료 완료');
    
    // 모든 소켓 연결 종료
    io.close(() => {
      console.log('[종료] Socket.IO 서버 종료 완료');
      process.exit(0);
    });
  });
  
  // 10초 후 강제 종료
  setTimeout(() => {
    console.error('[종료] 강제 종료');
    process.exit(1);
  }, 10000);
};

// 종료 신호 처리
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 예외 처리
process.on('uncaughtException', (error) => {
  console.error('[치명적 오류] Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[치명적 오류] Unhandled Rejection:', reason);
  // 종료하지 않고 계속 실행
});

// =========================
// 서버 시작
// =========================
server.listen(PORT, '0.0.0.0', () => {
  console.log('=================================');
  console.log('[NUA STUDIO] 실시간 협업 속기 서버');
  console.log(`[서버 시작] http://0.0.0.0:${PORT}`);
  console.log(`[환경] ${NODE_ENV}`);
  console.log(`[Node.js] ${process.version}`);
  console.log(`[메모리] ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`);
  console.log(`[운영 모드] 24/7 연속 운영 (유료 플랜)`);
  console.log('=================================');
  console.log('[기능]');
  console.log('✓ 2인 1조 실시간 협업 속기');
  console.log('✓ 자동 3단어 매칭 교대');
  console.log('✓ 파트너 간 실시간 입력 공유');
  console.log('✓ 2시간 백업/자동 복구');
  console.log('✓ 24시간 연속 운영 최적화');
  console.log('✓ 향상된 메모리 관리');
  console.log('✓ 연결 통계 및 모니터링');
  console.log('=================================');
  
  // 시작 시 메모리 정리
  cleanupInactiveChannels();
});
