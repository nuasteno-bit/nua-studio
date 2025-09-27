// socket-server.js - 완전 수정 버전
// NUA STUDIO 실시간 협업 속기 서버 v2.1 - 버전 관리 적용

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const fs = require('fs');

// === DB 모듈 로드 ===
const DB = require('./db/db_app');
console.log('[DB] Using file:', DB.DB_PATH);

// =========================
// 환경 자동 감지 및 설정
// =========================
const IS_RENDER = process.env.RENDER === 'true' || process.env.RENDER_SERVICE_NAME;
const NODE_ENV = process.env.NODE_ENV || (IS_RENDER ? 'production' : 'development');
const IS_PRODUCTION = NODE_ENV === 'production';

const PORT = process.env.PORT || 3000;
const SERVICE_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

console.log('=================================');
console.log('[NUA STUDIO] 서버 초기화 v2.1');
console.log('=================================');
console.log(`플랫폼: ${IS_RENDER ? 'Render Cloud' : 'Local'}`);
console.log(`환경: ${NODE_ENV}`);
console.log(`포트: ${PORT}`);
console.log(`URL: ${SERVICE_URL}`);
console.log('=================================');

const HEARTBEAT_TIMEOUT = IS_RENDER ? 30000 : 20000;
const PING_INTERVAL = IS_RENDER ? 25000 : 15000;
const PING_TIMEOUT = IS_RENDER ? 60000 : 30000;

// =========================
// 채널 버전 관리 시스템 (핵심 추가)
// =========================
const channelVersions = new Map();

function getChannelState(code) {
  if (!channelVersions.has(code)) {
    channelVersions.set(code, { 
      docVersion: 0, 
      text: '',
      lastUpdate: Date.now()
    });
  }
  return channelVersions.get(code);
}

// =========================
// 메모리 기반 데이터 저장소 (기존)
// =========================
const channelDatabase = new Map();
const stenoChannels = {};
const channelStates = {};
const channelEditStates = {};
const recentMessages = new Map();
const channelBackups = {};
const connectionStats = new Map();
const channelSwitchCooldowns = {};
const SWITCH_COOLDOWN_MS = 600;

// 커밋 시각 관리 (누락된 변수 추가)
const lastCommitAt = new Map();
const COMMIT_NOISE_FILTER_MS = 100;

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
      lastActivity: Date.now(),
      lastSwitchTime: 0
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

function canSwitch(channel) {
  if (!channelSwitchCooldowns[channel]) {
    return true;
  }
  const now = Date.now();
  return (now - channelSwitchCooldowns[channel]) >= SWITCH_COOLDOWN_MS;
}

function updateSwitchCooldown(channel) {
  channelSwitchCooldowns[channel] = Date.now();
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
  const INACTIVE_THRESHOLD = 2 * 60 * 60 * 1000;
  
  let cleanedCount = 0;
  
  for (const [channel, state] of Object.entries(channelStates)) {
    if (now - state.lastActivity > INACTIVE_THRESHOLD && 
        (!stenoChannels[channel] || stenoChannels[channel].length === 0)) {
      delete channelStates[channel];
      delete stenoChannels[channel];
      delete channelEditStates[channel];
      delete channelBackups[channel];
      delete channelSwitchCooldowns[channel];
      channelDatabase.delete(channel);
      channelVersions.delete(channel);  // 버전 정보도 정리
      lastCommitAt.delete(channel);     // 커밋 시각도 정리 (누락 추가)
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

const corsOptions = IS_PRODUCTION ? {
  origin: [
    'https://nuastudio.co.kr',
    'https://www.nuastudio.co.kr',
    /\.nuastudio\.co\.kr$/,
    /\.onrender\.com$/
  ],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS', 'DELETE', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization']
} : {
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS', 'DELETE', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(helmet({ 
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false 
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));

app.use(express.static(__dirname));
console.log(`[정적 파일] 루트 디렉토리 서빙: ${__dirname}`);

// =========================
// 라우트 설정
// =========================

app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  
  if (fs.existsSync(indexPath)) {
    console.log('[라우트] index.html 제공');
    res.sendFile(indexPath);
  } else {
    console.log('[라우트] index.html 없음, 기본 페이지 표시');
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
          .warning {
            background: #ef4444;
            padding: 1rem;
            border-radius: 0.5rem;
            margin: 1rem 0;
          }
          .info { margin-top: 2rem; opacity: 0.9; }
          .info p { margin: 0.5rem 0; }
          a { color: white; text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🎙️ NUA STUDIO</h1>
          <div class="status">✅ Server Active</div>
          <div class="warning">
            ⚠️ index.html 파일을 찾을 수 없습니다!
          </div>
          <div class="info">
            <p>서버는 정상 작동 중이지만 앱 파일이 없습니다.</p>
            <p>파일 위치: ${__dirname}</p>
            <p>
              <a href="/health">시스템 상태</a> | 
              <a href="/api/metrics">성능 지표</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `);
  }
});

app.get('/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  const uptime = process.uptime();
  
  if (req.headers['user-agent']?.includes('Render')) {
    return res.status(200).json({ status: 'healthy', timestamp: Date.now() });
  }
  
  // 버전 정보 추가
  const versionInfo = {};
  for (const [code, state] of channelVersions.entries()) {
    versionInfo[code] = {
      version: state.docVersion,
      textLength: state.text.length,
      lastUpdate: state.lastUpdate
    };
  }
  
  res.status(200).json({
    status: 'healthy',
    service: 'NUA STUDIO Socket Server v2.1',
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
      total: channelDatabase.size,
      versions: versionInfo
    },
    environment: {
      node: process.version,
      platform: process.platform,
      env: NODE_ENV,
      port: PORT,
      workingDir: __dirname
    }
  });
});

app.get('/status', (req, res) => {
  res.status(200).send('OK');
});

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
// 관리자 API 라우트
// =========================

app.post('/api/admin/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log(`[관리자 로그인 시도] Username: ${username}`);
    
    const account = ADMIN_ACCOUNTS[username];
    if (!account) {
      console.log(`[관리자 로그인 실패] 계정 없음: ${username}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (account.password !== password) {
      console.log(`[관리자 로그인 실패] 잘못된 비밀번호`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = generateToken();
    activeSessions.set(token, {
      username,
      role: account.role,
      loginTime: Date.now()
    });
    
    console.log(`[관리자 로그인 성공] ${username} - Token: ${token.substring(0, 8)}...`);
    
    res.json({
      success: true,
      token,
      role: account.role
    });
    
  } catch (error) {
    console.error('[관리자 로그인 오류]', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  const token = req.headers['authorization'];
  if (token && activeSessions.has(token)) {
    activeSessions.delete(token);
    console.log('[관리자 로그아웃] 토큰 삭제됨');
  }
  res.json({ success: true });
});

app.get('/api/admin/check', (req, res) => {
  const token = req.headers['authorization'];
  if (token && activeSessions.has(token)) {
    const session = activeSessions.get(token);
    res.json({
      authenticated: true,
      username: session.username,
      role: session.role
    });
  } else {
    res.json({ authenticated: false });
  }
});

app.get('/api/admin/stats', requireAuth, (req, res) => {
  try {
    const stats = {
      channels: {
        total: channelDatabase.size,
        active: Object.keys(channelStates).length,
        list: Array.from(channelDatabase.values()).map(ch => ({
          code: ch.code,
          type: ch.type,
          eventName: ch.eventName,
          createdAt: ch.createdAt,
          activeUsers: stenoChannels[ch.code]?.length || 0,
          accumulatedText: channelStates[ch.code]?.accumulatedText?.length || 0,
          version: channelVersions.get(ch.code)?.docVersion || 0
        }))
      },
      connections: {
        current: io.engine ? io.engine.clientsCount : 0,
        today: Array.from(connectionStats.values())
          .filter(stat => Date.now() - stat.firstConnect < 24 * 60 * 60 * 1000)
          .reduce((sum, stat) => sum + stat.count, 0)
      },
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        platform: IS_RENDER ? 'Render' : 'Local'
      }
    };
    res.json(stats);
  } catch (error) {
    console.error('[관리자 통계 오류]', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

app.delete('/api/admin/channel/:code', requireAuth, (req, res) => {
  try {
    const { code } = req.params;
    
    const ch = DB.loadChannel(code);
    if (!ch) return res.status(404).json({ error: 'Channel not found' });
    
    DB.deleteChannel(code);
    
    delete channelStates[code];
    delete stenoChannels[code];
    delete channelEditStates[code];
    delete channelBackups[code];
    delete channelSwitchCooldowns[code];
    channelDatabase.delete(code);
    channelVersions.delete(code);
    lastCommitAt.delete(code);  // 커밋 시각도 정리 (누락 추가)
    
    io.to(code).emit('channel_closed', { reason: 'Admin closed this channel' });
    io.socketsLeave(code);
    res.json({ success: true, message: `Channel ${code} deleted` });
    
  } catch (error) {
    console.error('[채널 삭제 오류]', error);
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

app.post('/api/admin/reset-all', requireAuth, (req, res) => {
  try {
    const { confirm } = req.body;
    
    if (confirm !== 'RESET_ALL') {
      return res.status(400).json({ error: 'Confirmation required' });
    }
    
    const allChannels = DB.loadAllChannels();
    allChannels.forEach(ch => {
      DB.deleteChannel(ch.code);
    });
    
    const channelCount = channelDatabase.size;
    channelDatabase.clear();
    Object.keys(channelStates).forEach(key => delete channelStates[key]);
    Object.keys(stenoChannels).forEach(key => delete stenoChannels[key]);
    Object.keys(channelEditStates).forEach(key => delete channelEditStates[key]);
    Object.keys(channelBackups).forEach(key => delete channelBackups[key]);
    Object.keys(channelSwitchCooldowns).forEach(key => delete channelSwitchCooldowns[key]);
    channelVersions.clear();
    lastCommitAt.clear();  // 커밋 시각도 초기화 (누락 추가)
    
    console.log(`[관리자] 전체 초기화 - ${allChannels.length}개 DB 채널, ${channelCount}개 메모리 채널 삭제됨`);
    res.json({ 
      success: true, 
      message: `Reset complete. ${allChannels.length} DB channels, ${channelCount} memory channels deleted.` 
    });
    
  } catch (error) {
    console.error('[전체 초기화 오류]', error);
    res.status(500).json({ error: 'Failed to reset' });
  }
});

// =========================
// 채널 API 라우트
// =========================

app.post('/api/channel/create', (req, res) => {
  try {
    const { code, type, passkey, eventName, eventDateTime } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Channel code is required' });
    }
    
    if (DB.loadChannel(code)) {
      return res.status(400).json({ error: 'Channel already exists' });
    }
    
    const saved = DB.saveChannel({
      code,
      type: type || 'public',
      passkey: (type === 'secured') ? passkey : null,
      eventName: eventName || '',
      eventDateTime: eventDateTime || null,
      createdAt: Date.now(),
      autoDelete: true,
      expiresAt: null,
      lastActivity: Date.now()
    });
    if (!saved) return res.status(500).json({ error: 'DB save failed' });
    
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
    const channels = DB.loadAllChannels().map(ch => ({
      ...ch,
      activeUsers: Array.isArray(stenoChannels[ch.code]) ? stenoChannels[ch.code].length : 0,
      accumulated: channelStates[ch.code]?.accumulatedText?.length || 0,
      version: channelVersions.get(ch.code)?.docVersion || 0
    }));
    res.json(channels);
  } catch (error) {
    console.error('[API] Channels list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/channel/:code/verify', (req, res) => {
  try {
    const { code } = req.params;
    
    const ch = DB.loadChannel(code);
    if (ch) {
      res.json({
        success: true,
        exists: true,
        channel: {
          code: ch.code,
          type: ch.type,
          eventName: ch.eventName,
          needsPasskey: ch.type === 'secured'
        }
      });
    } else {
      res.json({ success: false, exists: false, message: 'Channel not found' });
    }
  } catch (error) {
    console.error('[API] Channel verify error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/channel/check/:code', (req, res) => {
  try {
    const { code } = req.params;
    
    const ch = DB.loadChannel(code);
    if (ch) {
      res.json({
        exists: true,
        channel: {
          code: ch.code,
          type: ch.type,
          eventName: ch.eventName,
          needsPasskey: ch.type === 'secured'
        }
      });
    } else {
      res.json({ exists: false });
    }
  } catch (error) {
    console.error('[API] Channel check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/check-channel', (req, res) => {
  try {
    const { code } = req.body;
    
    const ch = DB.loadChannel(code);
    res.json({
      exists: !!ch,
      needsPasskey: ch ? (ch.type === 'secured') : false
    });
  } catch (error) {
    console.error('[API] Check channel error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/channel/join', (req, res) => {
  try {
    const { code, passkey } = req.body;
    
    const channel = DB.loadChannel(code);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    if (channel.type === 'secured' && channel.passkey) {
      if (passkey !== channel.passkey) {
        return res.status(401).json({ error: 'Invalid passkey' });
      }
    }
    
    res.json({ 
      success: true,
      channel: {
        code: channel.code,
        type: channel.type,
        eventName: channel.eventName
      }
    });
  } catch (error) {
    console.error('[API] Channel join error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/channel/info/:code', (req, res) => {
  try {
    const { code } = req.params;
    
    const ch = DB.loadChannel(code);
    if (!ch) return res.status(404).json({ error: 'Channel not found' });
    
    const state = channelStates[code];
    const versionState = getChannelState(code);
    const stenos = stenoChannels[code] || [];
    res.json({
      channel: {
        code: ch.code,
        type: ch.type,
        eventName: ch.eventName,
        eventDateTime: ch.eventDateTime,
        createdAt: ch.createdAt
      },
      status: {
        activeUsers: stenos.length,
        accumulatedText: state?.accumulatedText?.length || 0,
        activeStenographer: state?.activeStenographer || null,
        stenographers: stenos.map(s => s.role),
        version: versionState.docVersion
      }
    });
  } catch (error) {
    console.error('[API] Channel info error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/channel/text/:code', (req, res) => {
  try {
    const { code } = req.params;
    const ch = DB.loadChannel(code);
    if (!ch) return res.status(404).json({ error: 'Channel not found' });
    
    const versionState = getChannelState(code);
    const memText = versionState.text || channelStates[code]?.accumulatedText;
    
    if (typeof memText === 'string' && memText.length) {
      return res.json({
        code,
        accumulatedText: memText,
        length: memText.length,
        source: 'memory',
        version: versionState.docVersion,
        lastActivity: channelStates[code]?.lastActivity || null
      });
    }
    
    const rows = DB.loadRecentViewerTexts(code, 10000);
    const textFromDB = Array.isArray(rows) ? rows.map(r => r.content).join('\n') : '';
    return res.json({
      code,
      accumulatedText: textFromDB,
      length: textFromDB.length || 0,
      source: 'db',
      version: 0,
      lastActivity: channelStates[code]?.lastActivity || null
    });
  } catch (error) {
    console.error('[API] Channel text error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/channel/text/:code', (req, res) => {
  try {
    const { code } = req.params;
    const { text = '' } = req.body || {};
    const ch = DB.loadChannel(code);
    if (!ch) return res.status(404).json({ error: 'Channel not found' });
    
    const versionState = getChannelState(code);
    const normalized = (text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // 버전 증가
    versionState.docVersion += 1;
    versionState.text = normalized;
    versionState.lastUpdate = Date.now();
    
    if (!channelStates[code]) channelStates[code] = { accumulatedText: '' };
    channelStates[code].accumulatedText = normalized;
    channelStates[code].lastActivity = Date.now();
    
    if (normalized && normalized.trim()) {
      DB.appendViewerText(code, normalized.trim());
    }
    
    // 버전 정보와 함께 브로드캐스트
    io.to(code).emit('text_broadcast', { 
      channel: code,
      version: versionState.docVersion,
      text: normalized,
      sender: 'api',
      timestamp: Date.now()
    });
    
    res.json({ success: true, version: versionState.docVersion });
  } catch (error) {
    console.error('[API] Save text error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/channel/export/:code', (req, res) => {
  try {
    const { code } = req.params;
    
    const ch = DB.loadChannel(code);
    if (!ch) return res.status(404).json({ error: 'Channel not found' });
    
    const versionState = getChannelState(code);
    const finalText = versionState.text || channelStates[code]?.accumulatedText || '';
    
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${code}_${Date.now()}.txt"`);
    res.send(finalText);
  } catch (error) {
    console.error('[API] Channel export error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/channel/update/:code', requireAuth, (req, res) => {
  try {
    const { code } = req.params;
    const { eventName, eventDateTime, passkey } = req.body;
    
    const ch = DB.loadChannel(code);
    if (!ch) return res.status(404).json({ error: 'Channel not found' });
    
    const updated = {
      ...ch,
      eventName: (eventName !== undefined) ? eventName : ch.eventName,
      eventDateTime: (eventDateTime !== undefined) ? eventDateTime : ch.eventDateTime,
      passkey: (passkey !== undefined) ? passkey : ch.passkey,
      lastActivity: Date.now()
    };
    if (!DB.saveChannel(updated)) return res.status(500).json({ error: 'DB update failed' });
    
    channelDatabase.set(code, {
      code: updated.code,
      type: updated.type,
      passkey: updated.passkey,
      eventName: updated.eventName,
      eventDateTime: updated.eventDateTime,
      createdAt: new Date(updated.createdAt)
    });
    res.json({ success: true, channel: updated });
  } catch (error) {
    console.error('[API] Channel update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/channel/backup/:code', requireAuth, (req, res) => {
  try {
    const { code } = req.params;
    
    if (!channelStates[code]) {
      return res.status(404).json({ error: 'Channel state not found' });
    }
    
    backupChannelState(code);
    
    res.json({ 
      success: true, 
      backup: channelBackups[code]
    });
  } catch (error) {
    console.error('[API] Channel backup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/backups', requireAuth, (req, res) => {
  try {
    const backups = Object.entries(channelBackups).map(([code, backup]) => ({
      code,
      backupTime: backup.backupTime,
      textLength: backup.accumulatedText?.length || 0,
      age: Date.now() - backup.backupTime
    }));
    
    res.json(backups);
  } catch (error) {
    console.error('[API] Backups list error:', error);
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
  
  const statKey = `${clientIP}_${new Date().toDateString()}`;
  if (!connectionStats.has(statKey)) {
    connectionStats.set(statKey, { count: 0, firstConnect: Date.now(), messageCount: 0 });
  }
  connectionStats.get(statKey).count++;
  
  socket.data = {
    channel: null,
    role: null,
    lastActivity: Date.now(),
    messageCount: 0
  };
  
  // 중복 방지 래퍼 (서버→클라이언트 emit 중복 방지용)
  // 주의: 이는 socket.emit을 오버라이드하여 서버가 보내는 이벤트 중복을 방지
  // steno_input은 클라→서버 이벤트이므로 직접 영향 없음
  const originalEmit = socket.emit;
  socket.emit = function(...args) {
    // 특정 이벤트에 대한 중복 방지 (필요시 확장 가능)
    if (args[0] === 'steno_preview' && args[1]) {  // steno_input이 아닌 preview로 수정
      const key = `${socket.id}_${args[0]}_${JSON.stringify(args[1])}`;
      const now = Date.now();
      const last = recentMessages.get(key);
      
      if (last && now - last < 50) {
        console.log(`[중복 방지] ${args[0]} 이벤트 스킵`);
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
      
      // 버전 상태 초기화
      const versionState = getChannelState(channel);
      
      // 채널 상태 초기화 또는 복구
      if (!channelStates[channel]) {
        if (!restoreChannelState(channel)) {
          channelStates[channel] = {
            activeStenographer: 'steno1',
            accumulatedText: '',
            lastSwitchText: '',
            lastActivity: Date.now(),
            lastSwitchTime: 0
          };
        }
      }
      
      channelStates[channel].lastActivity = Date.now();
      
      // DB에서 이전 데이터 복원
      try {
        if (!versionState.text && !channelStates[channel]?.accumulatedText) {
          const rows = DB.loadRecentViewerTexts(channel, 10000);
          const restored = Array.isArray(rows) ? rows.map(r => r.content).join('\n') : '';
          if (restored) {
            versionState.text = restored;
            versionState.docVersion = 1;
            channelStates[channel].accumulatedText = restored;
          }
        }
      } catch (e) {
        console.error('[join_channel] DB restore failed:', e);
      }
      
      const isStenoJoin = role === 'steno' || role === 'steno1' || role === 'steno2';
      
      if (isStenoJoin) {
        if (!stenoChannels[channel]) {
          stenoChannels[channel] = [];
          channelEditStates[channel] = { isEditing: false, editorId: null, editorRole: null };
        }
        
        if (stenoChannels[channel].length >= 2) {
          socket.emit('join_reject', { reason: 'Channel full (max 2 stenographers)' });
          console.log(`[${channel}] Join rejected: capacity exceeded`);
          return;
        }
        
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
        
        // 초기 동기화 - 버전 정보와 함께
        if (requestSync || versionState.text) {
          socket.emit('text_broadcast', {
            channel: channel,
            version: versionState.docVersion,
            text: versionState.text,
            sender: 'system',
            timestamp: Date.now()
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
        
        if (versionState.text) {
          socket.emit('text_broadcast', {
            channel: channel,
            version: versionState.docVersion,
            text: versionState.text,
            sender: 'system',
            timestamp: Date.now()
          });
        }
        
        console.log(`[${channel}] Viewer joined: ${socket.id}`);
      }
    } catch (error) {
      console.error('[join_channel] Error:', error);
      socket.emit('error', { message: 'Failed to join channel' });
    }
  });

  // 미리보기 입력 (버전 정보 포함)
  socket.on('steno_input', ({ channel, role, text, ts }) => {
    try {
      const ch = channel || socket.data.channel;
      const versionState = getChannelState(ch);
      
      // 커밋 직후 노이즈 필터 (빈 입력만 차단) - 누락된 로직 추가
      const lastCommit = lastCommitAt.get(ch);
      if (lastCommit && Date.now() - lastCommit < COMMIT_NOISE_FILTER_MS) {
        if (!text || text.trim() === '') {
          console.log(`[${ch}] 커밋 직후 빈 입력 무시`);
          return;
        }
      }
      
      // Rate limiting
      socket.data.messageCount++;
      if (socket.data.messageCount > 100) {
        const timeDiff = Date.now() - socket.data.lastActivity;
        if (timeDiff < 1000) {
          console.log(`[레이트 리밋] ${socket.id} 과도한 메시지`);
          return;
        }
        socket.data.messageCount = 0;
      }
      socket.data.lastActivity = Date.now();
      
      // 발신자 제외하고 미리보기 브로드캐스트
      socket.broadcast.to(ch).emit('steno_preview', {
        channel: ch,
        text: text || '',
        sender: role,
        ts: ts || Date.now(),
        baseVersion: versionState.docVersion
      });
      
      console.log(`[${ch}] 미리보기 전송 - baseVersion: ${versionState.docVersion}`);
      
    } catch (error) {
      console.error('[steno_input] Error:', error);
    }
  });

  // 텍스트 확정 전송 (단일 이벤트)
  socket.on('text_sent', ({ channel, accumulatedText, sender }) => {
    try {
      const ch = channel || socket.data.channel;
      console.log(`[${ch}] Text sent attempt by ${sender} - ${accumulatedText?.length || 0}자`);
      
      // 강화된 역할 검증 (GPT 재지적 반영)
      const myRole = socket.data.role; // 서버가 할당한 실제 역할
      const activeRole = channelStates[ch]?.activeStenographer;
      
      // sender 파라미터와 실제 소켓 역할 일치 확인
      const expectedSender = myRole === 'steno1' ? '1' : (myRole === 'steno2' ? '2' : 'viewer');
      if (sender !== expectedSender) {
        console.log(`[${ch}] 역할 위조 시도: sender=${sender}, 실제=${expectedSender}`);
        socket.emit('error', { message: 'Invalid sender role' });
        return;
      }
      
      // 1인 모드 체크
      const stenographers = stenoChannels[ch] || [];
      const isSoloMode = stenographers.length === 1;
      
      // 2인 모드에서는 활성 권한자만 전송 가능
      if (!isSoloMode && myRole !== activeRole) {
        console.log(`[${ch}] 권한 없음: ${myRole} (활성: ${activeRole})`);
        socket.emit('error', { message: 'Not active stenographer' });
        return;
      }
      
      // 뷰어는 절대 전송 불가
      if (myRole === 'viewer') {
        console.log(`[${ch}] 뷰어는 전송 불가`);
        socket.emit('error', { message: 'Viewers cannot send text' });
        return;
      }
      
      // 텍스트 길이 제한 (200KB)
      if (accumulatedText && accumulatedText.length > 200000) {
        socket.emit('error', { message: 'Text too long (max 200KB)' });
        return;
      }
      
      console.log(`[${ch}] 권한 검증 통과: ${myRole} === ${activeRole} (1인모드: ${isSoloMode})`);
      
      // 버전 상태 가져오기
      const versionState = getChannelState(ch);
      
      // 이전 텍스트 캡처 (DB 증분 저장용)
      const prevText = versionState.text;
      
      // 버전 증가 및 텍스트 업데이트
      versionState.docVersion += 1;
      versionState.text = (accumulatedText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      versionState.lastUpdate = Date.now();
      
      // 단일 확정 이벤트만 방송 (text_broadcast)
      io.to(ch).emit('text_broadcast', {
        channel: ch,
        version: versionState.docVersion,
        text: versionState.text,
        sender: sender,
        timestamp: Date.now()
      });
      
      // DB 증분 저장
      try {
        if (versionState.text && versionState.text.startsWith(prevText)) {
          const delta = versionState.text.slice(prevText.length).trim();
          if (delta) {
            DB.appendViewerText(ch, delta);
          }
        } else if (versionState.text && !prevText) {
          DB.appendViewerText(ch, versionState.text.trim());
        }
      } catch (e) {
        console.error('[text_sent] DB append failed:', e);
      }
      
      // 기존 channelStates도 업데이트 (호환성)
      if (channelStates[ch]) {
        channelStates[ch].accumulatedText = versionState.text;
        channelStates[ch].lastActivity = Date.now();
        lastCommitAt.set(ch, Date.now());  // 커밋 시각 기록 (누락 추가)
        // 백업 추가
        backupChannelState(ch);
      }
      
      console.log(`[${ch}] 확정 전송 완료 - v${versionState.docVersion}`);
      
    } catch (error) {
      console.error('[text_sent] Error:', error);
    }
  });

  // text_commit 이벤트 (선택적 - 완전한 버전)
  socket.on('text_commit', ({ channel, commitText, accumulatedText }) => {
    try {
      const ch = channel || socket.data.channel;
      console.log(`[${ch}] Text commit: ${commitText?.length || 0}자`);
      
      const versionState = getChannelState(ch);
      
      if (channelStates[ch]) {
        // 기존 누적 텍스트 가져오기
        let currentAccumulated = versionState.text || '';
        
        // 커밋 텍스트가 있으면 추가
        if (commitText) {
          // 줄바꿈 자동 추가
          if (currentAccumulated && !currentAccumulated.endsWith('\n')) {
            currentAccumulated += '\n';
          }
          currentAccumulated += commitText;
        } else if (accumulatedText) {
          // 전체 누적 텍스트가 제공된 경우
          currentAccumulated = accumulatedText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
          if (currentAccumulated && !currentAccumulated.endsWith('\n')) {
            currentAccumulated += '\n';
          }
        }
        
        // 버전 증가 및 상태 업데이트
        versionState.docVersion += 1;
        versionState.text = currentAccumulated;
        versionState.lastUpdate = Date.now();
        
        channelStates[ch].accumulatedText = currentAccumulated;
        channelStates[ch].lastActivity = Date.now();
        lastCommitAt.set(ch, Date.now());  // 커밋 시각 기록 (누락 추가)
        backupChannelState(ch);
        
        // DB 저장
        if (commitText && commitText.trim()) {
          DB.appendViewerText(ch, commitText.trim());
        } else if (currentAccumulated && currentAccumulated.trim()) {
          const lastLine = currentAccumulated.trim().split('\n').slice(-1)[0];
          if (lastLine && lastLine.trim()) {
            DB.appendViewerText(ch, lastLine.trim());
          }
        }
        
        // 버전 정보와 함께 브로드캐스트
        io.to(ch).emit('text_broadcast', {
          channel: ch,
          version: versionState.docVersion,
          text: currentAccumulated,
          sender: 'commit',
          timestamp: Date.now()
        });
        
        // 호환성을 위한 이벤트도 발송
        io.to(ch).emit('text_committed', {
          accumulatedText: currentAccumulated,
          commitText: commitText,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('[text_commit] Error:', error);
    }
  });

  // 동기화 요청 (재접속/복구용)
  socket.on('request_sync', ({ channel }) => {
    try {
      const ch = channel || socket.data.channel;
      const versionState = getChannelState(ch);
      
      // 현재 최신 정본만 전송 (개별)
      socket.emit('text_broadcast', {
        channel: ch,
        version: versionState.docVersion,
        text: versionState.text,
        sender: 'system',
        timestamp: Date.now()
      });
      
      console.log(`[${ch}] 동기화 요청 - v${versionState.docVersion} 전송`);
      
    } catch (error) {
      console.error('[request_sync] Error:', error);
    }
  });

  // 역할 전환
  socket.on('switch_role', ({ channel, newActive, matchedText, manual, reason, matchStartIndex, matchWordCount }) => {
    try {
      const ch = channel || socket.data.channel;
      
      if (!manual && !canSwitch(ch)) {
        console.log(`[${ch}] Switch denied - cooldown active`);
        return;
      }
      
      if (!channelStates[ch]) {
        channelStates[ch] = {
          activeStenographer: 'steno1',
          accumulatedText: '',
          lastSwitchText: '',
          lastActivity: Date.now(),
          lastSwitchTime: 0
        };
      }
      
      if (newActive !== 'steno1' && newActive !== 'steno2') return;
      
      if (!hasRole(ch, newActive)) {
        console.log(`[${ch}] Switch denied - ${newActive} not present`);
        return;
      }
      
      const previousActive = channelStates[ch].activeStenographer;
      const currentActive = ensureActiveConsistent(ch);
      
      if (currentActive === newActive) {
        console.log(`[${ch}] Switch aborted - ${newActive} already active`);
        return;
      }
      
      channelStates[ch].activeStenographer = newActive;
      channelStates[ch].lastActivity = Date.now();
      channelStates[ch].lastSwitchTime = Date.now();
      channelStates[ch].lastSwitchText = '';
      
      updateSwitchCooldown(ch);
      
      if (matchedText && matchedText.trim()) {
        console.log(`[${ch}] Switch with matchedText(len=${matchedText.length})`);
        backupChannelState(ch);
      }
      
      // 버전 상태 가져오기 (GPT 제안 반영)
      const versionState = getChannelState(ch);
      
      io.to(ch).emit('switch_role', {
        newActive,
        previousActive,
        matchedText,
        accumulatedText: channelStates[ch].accumulatedText,
        manual: !!manual,
        matchStartIndex,
        matchWordCount,
        ts: Date.now(),
        // 정본 동봉 (GPT 제안 반영)
        version: versionState.docVersion,
        text: versionState.text
      });
      
      broadcastActiveRole(io, ch);
      
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
          lastActivity: Date.now(),
          lastSwitchTime: 0
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
      channelStates[ch].lastSwitchTime = Date.now();
      updateSwitchCooldown(ch);
      
      io.to(ch).emit('force_role_switch', { 
        newActive, 
        previousActive
      });
      console.log(`[${ch}] Force switch: ${previousActive} -> ${newActive} (${reason})`);
    } catch (error) {
      console.error('[force_role_switch] Error:', error);
    }
  });

  // 파트너 입장 응답
  socket.on('partner_joined_ack', ({ channel }) => {
    console.log(`[${channel}] Partner sync acknowledged`);
  });

  // 파트너 입력 수신 (누락된 핸들러 추가)
  socket.on('partner_input', ({ channel, role, text }) => {
    try {
      const ch = channel || socket.data.channel;
      const senderRole = role.replace('steno', '');
      
      console.log(`[${ch}] Partner input from ${senderRole}: ${text?.length || 0}자`);
      
      // 대기자끼리 입력 공유
      const stenoPeers = stenoChannels[ch] || [];
      stenoPeers.forEach(s => {
        if (s.id !== socket.id) {
          io.to(s.id).emit('partner_input', { 
            role, 
            text 
          });
        }
      });
      
    } catch (error) {
      console.error('[partner_input] Error:', error);
    }
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
      
      // 버전 상태 업데이트
      const versionState = getChannelState(ch);
      versionState.docVersion += 1;
      versionState.text = editedText;
      versionState.lastUpdate = Date.now();
      
      if (channelStates[ch]) {
        channelStates[ch].accumulatedText = editedText;
        channelStates[ch].lastActivity = Date.now();
        console.log(`[${ch}] Text updated to ${editedText.length} chars - v${versionState.docVersion}`);
        backupChannelState(ch);
      }
      
      channelEditStates[ch] = { isEditing: false, editorId: null, editorRole: null };
      
      // 버전 정보와 함께 브로드캐스트
      io.to(ch).emit('text_broadcast', {
        channel: ch,
        version: versionState.docVersion,
        text: editedText,
        sender: editorRole,
        timestamp: Date.now()
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

  // 동기화 체크 수신 (누락된 핸들러 추가)
  socket.on('sync_check', ({ activeStenographer: clientActive, accumulatedLength }) => {
    try {
      const ch = socket.data.channel;
      if (!ch) return;
      
      const versionState = getChannelState(ch);
      
      // 서버와 클라이언트 상태 비교
      if (versionState.text.length !== accumulatedLength) {
        console.log(`[${ch}] 동기화 불일치 감지 - 서버: ${versionState.text.length}, 클라: ${accumulatedLength}`);
        
        // 최신 버전 전송
        socket.emit('text_broadcast', {
          channel: ch,
          version: versionState.docVersion,
          text: versionState.text,
          sender: 'sync',
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('[sync_check] Error:', error);
    }
  });

  // 디버그용
  socket.on('get_channel_state', ({ channel }) => {
    try {
      const ch = channel || socket.data.channel;
      const versionState = getChannelState(ch);
      
      if (channelStates[ch]) {
        socket.emit('channel_state', {
          channel: ch,
          state: channelStates[ch],
          version: versionState,
          stenographers: stenoChannels[ch] || [],
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
      const host = '0.0.0.0';
      
      server.listen(PORT, host, () => {
        console.log('=========================================');
        console.log('[NUA STUDIO] 실시간 협업 속기 서버 v2.1');
        console.log('=========================================');
        console.log(`[플랫폼] ${IS_RENDER ? 'Render Cloud' : 'Local Development'}`);
        console.log(`[환경] ${NODE_ENV}`);
        console.log(`[서버] http://${host}:${PORT}`);
        console.log(`[외부 URL] ${SERVICE_URL}`);
        console.log(`[Node.js] ${process.version}`);
        console.log(`[메모리] ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`);
        console.log(`[작업 디렉토리] ${__dirname}`);
        console.log(`[시작 시간] ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);
        console.log('=========================================');
        console.log('[새로운 기능]');
        console.log('✅ 채널별 버전 관리 시스템');
        console.log('✅ 단일 확정 이벤트 (text_broadcast)');
        console.log('✅ 미리보기 버전 체크 (steno_preview)');
        console.log('✅ Rate limiting 강화');
        console.log('=========================================');
        
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
