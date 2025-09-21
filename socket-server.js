// socket-server.js - Render 최적화 완전판
// NUA STUDIO 실시간 협업 속기 서버 v2.0

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const fs = require('fs');

// =========================
// 환경 자동 감지 및 설정
// =========================
const IS_RENDER = process.env.RENDER === 'true' || process.env.RENDER_SERVICE_NAME;
const NODE_ENV = process.env.NODE_ENV || (IS_RENDER ? 'production' : 'development');
const IS_PRODUCTION = NODE_ENV === 'production';

// Render는 PORT를 자동 할당 - 절대 수동 설정하지 마세요
const PORT = process.env.PORT || 3000;
const SERVICE_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// 시작 로그
console.log('=================================');
console.log('[NUA STUDIO] 서버 초기화');
console.log('=================================');
console.log(`플랫폼: ${IS_RENDER ? 'Render Cloud' : 'Local'}`);
console.log(`환경: ${NODE_ENV}`);
console.log(`포트: ${PORT}`);
console.log(`URL: ${SERVICE_URL}`);
console.log('=================================');

// 연결 설정 (Render 유료 플랜 최적화)
const HEARTBEAT_TIMEOUT = IS_RENDER ? 30000 : 20000;
const PING_INTERVAL = IS_RENDER ? 25000 : 15000;
const PING_TIMEOUT = IS_RENDER ? 60000 : 30000;

// =========================
// 메모리 기반 데이터 저장소
// =========================
const channelDatabase = new Map();
const stenoChannels = {};
const channelStates = {};
const channelSpeakers = {};
const channelEditStates = {};
const recentMessages = new Map();
const channelBackups = {};
const connectionStats = new Map();

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
    channelStates[channel].activeStenographer = present[0];
    return present[0];
  }
  
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

function backupChannelState(channel) {
  if (channelStates[channel]) {
    channelBackups[channel] = {
      ...channelStates[channel],
      backupTime: Date.now()
    };
    console.log(`[백업] 채널 ${channel} 상태 백업 완료`);
  }
}

function restoreChannelState(channel) {
  if (channelBackups[channel]) {
    const backup = channelBackups[channel];
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

function cleanupInactiveChannels() {
  const now = Date.now();
  const INACTIVE_THRESHOLD = 2 * 60 * 60 * 1000; // 2시간
  
  let cleanedCount = 0;
  
  for (const [channel, state] of Object.entries(channelStates)) {
    if (now - state.lastActivity > INACTIVE_THRESHOLD && 
        (!stenoChannels[channel] || stenoChannels[channel].length === 0)) {
      delete channelStates[channel];
      delete stenoChannels[channel];
      delete channelSpeakers[channel];
      delete channelEditStates[channel];
      delete channelBackups[channel];
      channelDatabase.delete(channel);
      cleanedCount++;
    }
  }
  
  for (const [channel, backup] of Object.entries(channelBackups)) {
    if (now - backup.backupTime > 24 * 60 * 60 * 1000) {
      delete channelBackups[channel];
      cleanedCount++;
    }
  }
  
  for (const [key, time] of recentMessages.entries()) {
    if (now - time > 1000) {
      recentMessages.delete(key);
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

// CORS 설정
const corsOptions = IS_PRODUCTION ? {
  origin: [
    'https://nuastudio.co.kr',
    'https://www.nuastudio.co.kr',
    /\.nuastudio\.co\.kr$/,
    /\.onrender\.com$/
  ],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
} : {
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(helmet({ 
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false 
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// 정적 파일 서빙
const publicPath = path.join(__dirname, 'public');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
  console.log(`[정적 파일] ${publicPath} 서빙 중`);
} else {
  console.log(`[경고] public 디렉토리 없음`);
}

// =========================
// 라우트 설정
// =========================

// 루트 경로
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>NUA STUDIO Server</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; 
            justify-content: center; 
            align-items: center; 
            height: 100vh; 
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .container {
            text-align: center;
            padding: 2rem;
            background: rgba(255,255,255,0.1);
            border-radius: 1rem;
            backdrop-filter: blur(10px);
          }
          h1 { margin: 0 0 1rem 0; font-size: 2.5rem; }
          .status { 
            display: inline-block; 
            padding: 0.5rem 1rem; 
            background: #22c55e;
            border-radius: 2rem;
            font-weight: bold;
            margin: 1rem 0;
          }
          .info { margin-top: 2rem; opacity: 0.9; }
          .info p { margin: 0.5rem 0; }
          a { color: white; text-decoration: underline; }
          .stats {
            margin-top: 2rem;
            padding: 1rem;
            background: rgba(0,0,0,0.2);
            border-radius: 0.5rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🎙️ NUA STUDIO</h1>
          <div class="status">✅ Server Active</div>
          <div class="info">
            <p>실시간 협업 속기 서버가 정상 작동 중입니다</p>
            <p>환경: ${NODE_ENV} | 포트: ${PORT}</p>
            <p>
              <a href="/health">시스템 상태</a> | 
              <a href="/api/metrics">성능 지표</a> | 
              <a href="/api/channels">채널 목록</a>
            </p>
          </div>
          <div class="stats">
            <p>서버 시작: ${new Date().toLocaleString('ko-KR')}</p>
            <p>플랫폼: ${IS_RENDER ? 'Render Cloud' : 'Local Server'}</p>
          </div>
        </div>
      </body>
      </html>
    `);
  }
});

// 헬스체크 (Render 필수)
app.get('/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  const uptime = process.uptime();
  
  // Render 헬스체크는 빠르게 응답
  if (req.headers['user-agent']?.includes('Render')) {
    return res.status(200).json({ status: 'healthy', timestamp: Date.now() });
  }
  
  res.status(200).json({
    status: 'healthy',
    service: 'NUA STUDIO Socket Server',
    platform: IS_RENDER ? 'Render' : 'Local',
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: uptime,
      formatted: `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
    },
    memory: {
      rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(1)} MB`,
      heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(1)} MB`,
      heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(1)} MB`
    },
    channels: {
      active: Object.keys(channelStates).length,
      total: channelDatabase.size
    },
    environment: {
      node: process.version,
      platform: process.platform,
      env: NODE_ENV,
      port: PORT
    }
  });
});

// 상태 체크
app.get('/status', (req, res) => {
  res.status(200).send('OK');
});

// 성능 지표
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
      current: io.engine ? io.engine.clientsCount : 0,
      stats: Array.from(connectionStats.values()).length
    }
  };
  res.status(200).json(metrics);
});

// 채널 생성 API
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

// 채널 목록
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
// Socket.IO 서버 설정
// =========================
const io = new Server(server, {
  cors: corsOptions,
  transports: IS_RENDER ? ['websocket', 'polling'] : ['polling', 'websocket'],
  pingInterval: PING_INTERVAL,
  pingTimeout: PING_TIMEOUT,
  perMessageDeflate: IS_PRODUCTION ? {
    threshold: 1024
  } : false,
  httpCompression: IS_PRODUCTION,
  maxHttpBufferSize: 1e6,
  allowEIO3: true,
  connectTimeout: 45000
});

// =========================
// Socket.IO 이벤트 핸들러
// =========================
io.on('connection', (socket) => {
  const clientIP = socket.handshake.address;
  console.log(`[연결] Socket connected: ${socket.id} from ${clientIP}`);
  
  // 연결 통계
  const statKey = `${clientIP}_${new Date().toDateString()}`;
  if (!connectionStats.has(statKey)) {
    connectionStats.set(statKey, { count: 0, firstConnect: Date.now(), messageCount: 0 });
  }
  connectionStats.get(statKey).count++;
  
  // 소켓 상태 초기화
  socket.data = {
    channel: null,
    role: null,
    lastActivity: Date.now(),
    messageCount: 0
  };
  
  // 중복 방지 래퍼
  const originalEmit = socket.emit;
  socket.emit = function(...args) {
    if (args[0] === 'steno_input' && args[1]) {
      const key = `${socket.id}_${args[1].text}`;
      const now = Date.now();
      const last = recentMessages.get(key);
      
      if (last && now - last < 50) {
        return;
      }
      
      recentMessages.set(key, now);
      setTimeout(() => recentMessages.delete(key), 100);
    }
    return originalEmit.apply(this, args);
  };

  // 채널 입장
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
          myRole = 'steno1';
        }
        
        stenoChannels[channel].push({ id: socket.id, role: myRole });
        socket.data.role = myRole;
        
        console.log(`[${channel}] Role assigned: ${myRole} to ${socket.id}`);
        
        const stenos = listRolesPresent(channel);
        io.to(channel).emit('steno_list', { stenos });
        socket.emit('role_assigned', { role: myRole });
        broadcastActiveRole(io, channel);
        
        if (requestSync || channelStates[channel]?.accumulatedText) {
          socket.emit('sync_accumulated', {
            accumulatedText: channelStates[channel]?.accumulatedText || ''
          });
        }
        
        if (stenoChannels[channel].length === 2) {
          const otherSteno = stenoChannels[channel].find(s => s.id !== socket.id);
          if (otherSteno) {
            io.to(otherSteno.id).emit('partner_joined', {
              newPartner: myRole,
              requestSync: true
            });
          }
        }
        
        if (channelEditStates[channel]?.isEditing) {
          socket.emit('viewer_edit_state', {
            isEditing: true,
            editorRole: channelEditStates[channel].editorRole
          });
        }
        
      } else {
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

  // 입력 처리
  socket.on('steno_input', ({ channel, role, text, isSync }) => {
    try {
      socket.data.messageCount++;
      
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
      
      if (channelStates[ch]) {
        channelStates[ch].lastActivity = Date.now();
      }
      
      if (serverRole !== active) {
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

  // 역할 전환
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
      
      if (matchedText && matchedText.trim()) {
        const before = channelStates[ch].accumulatedText.length;
        channelStates[ch].accumulatedText = matchedText;
        const after = channelStates[ch].accumulatedText.length;
        
        backupChannelState(ch);
        console.log(`[${ch}] Text accumulated: ${before} -> ${after} chars`);
      }
      
      broadcastActiveRole(io, ch);
      
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

  // 강제 권한 전환
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

  // 텍스트 전송 확정
  socket.on('text_sent', ({ channel, accumulatedText, sender }) => {
    try {
      const ch = channel || socket.data.channel;
      console.log(`[${ch}] Text sent by ${sender}`);
      
      if (channelStates[ch]) {
        channelStates[ch].accumulatedText = accumulatedText;
        channelStates[ch].lastActivity = Date.now();
        backupChannelState(ch);
      }
      
      socket.broadcast.to(ch).emit('text_sent', { accumulatedText, sender });
    } catch (error) {
      console.error('[text_sent] Error:', error);
    }
  });

  // 파트너 입장 응답
  socket.on('partner_joined_ack', ({ channel }) => {
    console.log(`[${channel}] Partner sync acknowledged`);
  });

  // 교정 요청
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

  // 뷰어 편집 시작
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

  // 뷰어 편집 완료
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

  // 뷰어 편집 취소
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

  // 채팅 메시지
  socket.on('chat_message', ({ channel, sender, message }) => {
    try {
      const ch = channel || socket.data.channel;
      socket.broadcast.to(ch).emit('chat_message', { sender, message });
      console.log(`[${ch}] Chat from ${sender}: ${message}`);
    } catch (error) {
      console.error('[chat_message] Error:', error);
    }
  });

  // 핑/퐁 테스트
  socket.on('ping_test', ({ channel }) => {
    socket.emit('pong_test', { channel, timestamp: Date.now() });
  });

  // Keep-alive
  socket.on('keep_alive', ({ channel, role, dataCheck }) => {
    socket.emit('keep_alive_ack', { timestamp: Date.now() });
    
    if (socket.data.channel) {
      socket.data.lastActivity = Date.now();
    }
  });

  // 백업 상태 저장
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

  // 동기화 요청
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

  // 연결 해제
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
          
          if (channelEditStates[ch]?.editorId === socket.id) {
            channelEditStates[ch] = { isEditing: false, editorId: null, editorRole: null };
            io.to(ch).emit('viewer_edit_state', { isEditing: false, editorRole: null });
          }
          
          broadcastActiveRole(io, ch);
          
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

  // 디버그용
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
// 정기 작업
// =========================

// 메모리 정리 (10분마다)
setInterval(() => {
  cleanupInactiveChannels();
  
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
    totalConnections: io.engine ? io.engine.clientsCount : 0,
    memory: {
      rss: `${(memUsage.rss / 1024 / 1024).toFixed(1)} MB`,
      heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(1)} MB`,
      heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(1)} MB`
    },
    uptime: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`
  };
  console.log('[통계]', JSON.stringify(stats, null, 2));
}, 60 * 60 * 1000);

// =========================
// 종료 핸들러
// =========================
let isShuttingDown = false;

const gracefulShutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`[종료] ${signal} 신호 수신`);
  
  // 모든 채널 백업
  Object.keys(channelStates).forEach(channel => {
    backupChannelState(channel);
  });
  
  server.close(() => {
    console.log('[종료] HTTP 서버 종료 완료');
    
    io.close(() => {
      console.log('[종료] Socket.IO 서버 종료 완료');
      process.exit(0);
    });
  });
  
  // 타임아웃
  setTimeout(() => {
    console.error('[종료] 강제 종료');
    process.exit(1);
  }, IS_RENDER ? 30000 : 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  console.error('[치명적 오류] Uncaught Exception:', error);
  if (IS_PRODUCTION) {
    console.error('[복구] 서비스 계속 실행');
  } else {
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[경고] Unhandled Rejection:', reason);
});

// =========================
// 서버 시작
// =========================
const startServer = () => {
  return new Promise((resolve, reject) => {
    try {
      const host = '0.0.0.0';  // 모든 인터페이스에서 접근 가능
      
      server.listen(PORT, host, () => {
        console.log('=========================================');
        console.log('[NUA STUDIO] 실시간 협업 속기 서버 v2.0');
        console.log('=========================================');
        console.log(`[플랫폼] ${IS_RENDER ? 'Render Cloud' : 'Local Development'}`);
        console.log(`[환경] ${NODE_ENV}`);
        console.log(`[서버] http://${host}:${PORT}`);
        console.log(`[외부 URL] ${SERVICE_URL}`);
        console.log(`[Node.js] ${process.version}`);
        console.log(`[메모리] ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`);
        console.log(`[시작 시간] ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);
        console.log('=========================================');
        console.log('[엔드포인트]');
        console.log(`✅ Health: ${SERVICE_URL}/health`);
        console.log(`✅ Status: ${SERVICE_URL}/status`);
        console.log(`✅ Metrics: ${SERVICE_URL}/api/metrics`);
        console.log('=========================================');
        console.log('[기능]');
        console.log('✅ 2인 1조 실시간 협업 속기');
        console.log('✅ 자동 3단어 매칭 교대');
        console.log('✅ 파트너 간 실시간 입력 공유');
        console.log('✅ 2시간 백업/자동 복구');
        console.log('✅ 24시간 연속 운영 최적화');
        console.log('=========================================');
        
        // 시작 시 메모리 정리
        cleanupInactiveChannels();
        
        resolve(server);
      });
      
      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`[오류] 포트 ${PORT}가 이미 사용 중입니다`);
        } else if (error.code === 'EACCES') {
          console.error(`[오류] 포트 ${PORT}에 접근 권한이 없습니다`);
        } else {
          console.error('[서버 시작 오류]', error);
        }
        reject(error);
      });
      
    } catch (error) {
      console.error('[시작 실패]', error);
      reject(error);
    }
  });
};

// 서버 시작 실행
startServer().catch((error) => {
  console.error('[치명적 오류] 서버 시작 실패:', error);
  process.exit(1);
});
