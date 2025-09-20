// socket-server.js (feature-preserving + active gating + robust 1↔2 fallback)

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');

// =========================
// 서버/상태 전역 (라우트보다 먼저 선언)
// =========================
const channelDatabase = new Map();        // 채널 메타 (in-memory)
const stenoChannels = {};                 // 채널별 속기사 소켓 [{id, role}]
const channelStates = {};                 // 채널별 상태 { activeStenographer, accumulatedText, lastSwitchText }
const channelSpeakers = {};               // 채널별 화자 리스트
const channelEditStates = {};             // 채널별 뷰어 편집 상태
const recentMessages = new Map();         // 중복방지 (socket.emit 훅)

// Helpers
function listRolesPresent(channel) {
  return (stenoChannels[channel] || []).map(s => s.role);
}
function hasRole(channel, role) {
  return (stenoChannels[channel] || []).some(s => s.role === role);
}
function ensureActiveConsistent(channel) {
  if (!channelStates[channel]) {
    channelStates[channel] = { activeStenographer: 'steno1', accumulatedText: '', lastSwitchText: '' };
  }
  const present = listRolesPresent(channel);
  const current = channelStates[channel].activeStenographer || 'steno1';
  if (present.length === 0) return current; // 의미 없음
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

// =========================
// Express/IO 부팅
// =========================
const app = express();
const server = http.createServer(app);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({
  origin: '*',
  credentials: false // '*'와 credentials 동시 사용 불가. 필요시 origin에 도메인 지정.
}));

// 헬스체크
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: (process.memoryUsage().rss / 1024 / 1024).toFixed(1) + ' MB'
  });
});

app.use(express.static(__dirname));
app.use(express.json());

// Socket.IO
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000
});

// =========================
// (선택) 관리자 세션
// =========================
const ADMIN_ACCOUNTS = {
  'admin': { password: '123456s', role: 'system_admin' }
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

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const account = ADMIN_ACCOUNTS[username];
  if (account && account.password === password) {
    const token = generateToken();
    activeSessions.set(token, { username, role: account.role, loginTime: new Date() });
    setTimeout(() => activeSessions.delete(token), 30 * 60 * 1000);
    return res.json({ success: true, token, role: account.role });
  }
  return res.status(401).json({ success: false, error: 'Invalid credentials' });
});

app.post('/api/admin/logout', (req, res) => {
  const token = req.headers['authorization'];
  if (token) activeSessions.delete(token);
  res.json({ success: true });
});

// =========================
// 채널 REST API
// =========================
app.post('/api/channel/create', (req, res) => {
  const { code, type, passkey, eventName, eventDateTime } = req.body;
  if (channelDatabase.has(code)) {
    return res.status(400).json({ error: 'Channel already exists' });
  }
  const channelInfo = {
    code,
    type,
    passkey: type === 'secured' ? passkey : null,
    eventName,
    eventDateTime,
    createdAt: new Date(),
  };
  channelDatabase.set(code, channelInfo);
  console.log(`[API] Channel created: ${code}`);
  res.json({ success: true, channel: channelInfo });
});

app.get('/api/channels', (req, res) => {
  const channels = Array.from(channelDatabase.values()).map(ch => ({
    ...ch,
    activeUsers: Array.isArray(stenoChannels[ch.code]) ? stenoChannels[ch.code].length : 0
  }));
  res.json(channels);
});

app.get('/api/channel/:code/verify', (req, res) => {
  const { code } = req.params;
  if (channelDatabase.has(code)) {
    res.json({ exists: true, channel: channelDatabase.get(code) });
  } else {
    res.status(404).json({ exists: false });
  }
});

app.delete('/api/channel/:code', (req, res) => {
  const { code } = req.params;
  if (!channelDatabase.has(code)) return res.status(404).json({ error: 'Channel not found' });
  channelDatabase.delete(code);
  // in-memory 상태도 정리
  delete stenoChannels[code];
  delete channelStates[code];
  delete channelSpeakers[code];
  delete channelEditStates[code];
  console.log(`[API] Channel deleted: ${code}`);
  res.json({ success: true });
});

// =========================
/** Socket.IO 이벤트 */
// =========================
io.on('connection', (socket) => {
  console.log(`[${new Date().toISOString()}] Socket connected: ${socket.id}`);

  // 중복 emit 방지 훅(서버에서 동일 텍스트 폭주 시 필터)
  const _emit = socket.emit;
  socket.emit = function (...args) {
    if (args[0] === 'steno_input' && args[1]) {
      const key = `${socket.id}_${args[1].text}`;
      const now = Date.now();
      const last = recentMessages.get(key);
      if (last && now - last < 50) return;
      recentMessages.set(key, now);
      setTimeout(() => recentMessages.delete(key), 100);
    }
    return _emit.apply(this, args);
  };

  // -------- 조인 --------
  socket.on('join_channel', ({ channel, role, requestSync }) => {
    console.log(`[${channel}] Join request - Role: ${role}, Socket: ${socket.id}`);
    socket.join(channel);
    socket.data.channel = channel;

    const isStenoJoin = role === 'steno' || role === 'steno1' || role === 'steno2';
    if (isStenoJoin) {
      if (!stenoChannels[channel]) {
        stenoChannels[channel] = [];
        channelStates[channel] = { activeStenographer: 'steno1', accumulatedText: '', lastSwitchText: '' };
        channelEditStates[channel] = { isEditing: false, editorId: null, editorRole: null };
      }
      if (stenoChannels[channel].length >= 2) {
        socket.emit('join_reject', { reason: 'Channel full (max 2 stenographers)' });
        console.log(`[${channel}] Join rejected: capacity exceeded`);
        return;
      }

      // 클라가 steno1/steno2로 들어와도 서버가 최종 배정(중복 방지)
      let myRole;
      const requested = (role === 'steno1' || role === 'steno2') ? role : null;
      const hasSteno1 = hasRole(channel, 'steno1');
      const hasSteno2 = hasRole(channel, 'steno2');

      if (requested && !hasRole(channel, requested)) {
        myRole = requested;
      } else if (!hasSteno1) {
        myRole = 'steno1';
      } else {
        myRole = 'steno2';
      }

      stenoChannels[channel].push({ id: socket.id, role: myRole });
      socket.data.role = myRole;

      console.log(`[${channel}] Role assigned: ${myRole} to ${socket.id}`);

      // 전체에게 속기사 리스트 브로드캐스트
      const stenos = listRolesPresent(channel);
      io.to(channel).emit('steno_list', { stenos });

      // 본인에게 역할 통지
      socket.emit('role_assigned', { role: myRole });

      // 활성자 일관성 보정 및 방송
      const active = broadcastActiveRole(io, channel);

      // 누적 텍스트 동기화
      if (requestSync || (channelStates[channel] && channelStates[channel].accumulatedText)) {
        socket.emit('sync_accumulated', {
          accumulatedText: channelStates[channel]?.accumulatedText || ''
        });
        console.log(`[${channel}] Sync sent to ${myRole}`);
      }

      // 편집 상태 동기화
      if (channelEditStates[channel]?.isEditing) {
        socket.emit('viewer_edit_state', {
          isEditing: true,
          editorRole: channelEditStates[channel].editorRole
        });
      }

    } else {
      // Viewer
      socket.data.role = 'viewer';
      io.to(channel).emit('user_joined', { role: 'viewer' });

      // 현재 활성자 공지
      broadcastActiveRole(io, channel);

      if (channelStates[channel]?.accumulatedText) {
        socket.emit('sync_accumulated', {
          accumulatedText: channelStates[channel].accumulatedText
        });
        console.log(`[${channel}] Sync sent to viewer`);
      }
      console.log(`[${channel}] Viewer joined: ${socket.id}`);
    }
  });

  // -------- 입력 --------
  socket.on('steno_input', ({ channel, role, text }) => {
    const now = Date.now();
    const msgKey = `${socket.id}_${text}`;
    if (!socket.lastMessages) socket.lastMessages = new Map();
    const last = socket.lastMessages.get(msgKey);
    if (last && now - last < 50) {
      console.log('[Server] Duplicate input blocked');
      return;
    }
    socket.lastMessages.set(msgKey, now);
    setTimeout(() => socket.lastMessages.delete(msgKey), 1000);

    const ch = channel || socket.data.channel;
    const serverRole = socket.data.role || role || 'viewer';
    const active = ensureActiveConsistent(ch);

    // 권한자만 송출(뷰어에 동일 화면 보장)
    if (serverRole !== active) {
      // 선택: 상대 속기사에게만 파트너 입력 공유(뷰어에게는 송출 안 함)
      const peers = (stenoChannels[ch] || []).map(s => s.id);
      peers.forEach(id => {
        if (id !== socket.id) io.to(id).emit('partner_input', { role: serverRole, text });
      });
      return;
    }

    console.log(`[${ch}] Input from ACTIVE ${serverRole}: "${text}"`);
    // 본인 제외 브로드캐스트 → 모든 뷰어/상대 속기사는 동일 이벤트 수신
    socket.broadcast.to(ch).emit('steno_input', { role: serverRole, text });
  });

  // -------- 역할 스위치 --------
  socket.on('switch_role', ({ channel, newActive, matchedText, manual, reason, matchStartIndex, matchWordCount }) => {
    const ch = channel || socket.data.channel;
    if (!channelStates[ch]) {
      channelStates[ch] = { activeStenographer: 'steno1', accumulatedText: '', lastSwitchText: '' };
    }
    if (newActive !== 'steno1' && newActive !== 'steno2') return;
    // 실제 접속자 검증: 없는 역할로 전환 방지
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

    if (manual && matchedText && matchedText.trim()) {
      const before = channelStates[ch].accumulatedText.length;
      channelStates[ch].accumulatedText += matchedText;
      const after = channelStates[ch].accumulatedText.length;
      console.log(`[${ch}] Manual switch - Text accumulated: ${before} -> ${after} chars`);
    } else if (!manual && matchedText && matchedText.trim()) {
      channelStates[ch].accumulatedText = matchedText;
      channelStates[ch].lastSwitchText = matchedText;
      console.log(`[${ch}] Auto match - Text confirmed: "${matchedText}"`);
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

    console.log(`[${ch}] ${(manual ? 'Manual' : 'Auto')} switch complete: ${previousActive} -> ${newActive}`);
  });

  // -------- 누적 텍스트 확정/전송 --------
  socket.on('text_sent', ({ channel, accumulatedText, sender }) => {
    const ch = channel || socket.data.channel;
    console.log(`[${ch}] Text sent by ${sender}`);
    if (channelStates[ch]) channelStates[ch].accumulatedText = accumulatedText;
    socket.broadcast.to(ch).emit('text_sent', { accumulatedText, sender });
  });

  // -------- 화자 관리 --------
  socket.on('speaker_update', ({ channel, action, speaker, speakerId }) => {
    const ch = channel || socket.data.channel;
    if (!channelSpeakers[ch]) channelSpeakers[ch] = [];

    switch (action) {
      case 'add':
        channelSpeakers[ch].push(speaker);
        socket.broadcast.to(ch).emit('speaker_update', { action: 'add', speaker });
        break;
      case 'edit': {
        const i = channelSpeakers[ch].findIndex(s => s.id === speaker.id);
        if (i !== -1) channelSpeakers[ch][i] = speaker;
        socket.broadcast.to(ch).emit('speaker_update', { action: 'edit', speaker });
        break;
      }
      case 'delete':
        channelSpeakers[ch] = channelSpeakers[ch].filter(s => s.id !== speakerId);
        socket.broadcast.to(ch).emit('speaker_update', { action: 'delete', speakerId });
        break;
    }
  });

  socket.on('speaker_sync_request', ({ channel }) => {
    const ch = channel || socket.data.channel;
    if (channelSpeakers[ch]?.length) {
      socket.emit('speaker_update', { action: 'sync', speakers: channelSpeakers[ch] });
    }
  });

  socket.on('speaker_drag_start', (data) => {
    const ch = data.channel || socket.data.channel;
    socket.broadcast.to(ch).emit('speaker_drag_start', data);
  });

  socket.on('speaker_dragging', (data) => {
    const ch = data.channel || socket.data.channel;
    socket.broadcast.to(ch).emit('speaker_dragging', data);
  });

  socket.on('speaker_drag_end', ({ channel, speaker }) => {
    const ch = channel || socket.data.channel;
    const speakers = channelSpeakers[ch];
    if (speakers) {
      const idx = speakers.findIndex(s => s.id === speaker.id);
      if (idx !== -1) speakers[idx] = speaker;
    }
    socket.broadcast.to(ch).emit('speaker_drag_end', { speaker });
  });

  // -------- 뷰어 편집 --------
  socket.on('correction_request', ({ channel, active, requester, requesterRole }) => {
    const ch = channel || socket.data.channel;
    socket.broadcast.to(ch).emit('correction_request', { active, requester, requesterRole });
  });

  socket.on('viewer_edit_start', ({ channel, editorRole }) => {
    const ch = channel || socket.data.channel;
    if (!channelEditStates[ch]) channelEditStates[ch] = { isEditing: false, editorId: null, editorRole: null };
    if (channelEditStates[ch].isEditing) {
      socket.emit('viewer_edit_denied', { reason: `${channelEditStates[ch].editorRole} is already editing` });
      return;
    }
    channelEditStates[ch] = { isEditing: true, editorId: socket.id, editorRole: editorRole };
    io.to(ch).emit('viewer_edit_state', { isEditing: true, editorRole });
  });

  socket.on('viewer_edit_complete', ({ channel, editedText, editorRole }) => {
    const ch = channel || socket.data.channel;
    if (!channelEditStates[ch]) channelEditStates[ch] = { isEditing: false, editorId: null, editorRole: null };
    if (channelEditStates[ch].editorId !== socket.id) {
      console.log(`[${ch}] Edit complete denied - not current editor`);
      return;
    }
    if (channelStates[ch]) {
      channelStates[ch].accumulatedText = editedText;
      console.log(`[${ch}] Text updated to ${editedText.length} chars`);
    }
    channelEditStates[ch] = { isEditing: false, editorId: null, editorRole: null };
    io.to(ch).emit('viewer_content_updated', { accumulatedText: editedText, editorRole });
    io.to(ch).emit('viewer_edit_state', { isEditing: false, editorRole: null });
  });

  socket.on('viewer_edit_cancel', ({ channel }) => {
    const ch = channel || socket.data.channel;
    if (channelEditStates[ch]?.editorId === socket.id) {
      channelEditStates[ch] = { isEditing: false, editorId: null, editorRole: null };
      io.to(ch).emit('viewer_edit_state', { isEditing: false, editorRole: null });
    }
  });

  socket.on('sync_response', ({ channel, role, currentAccumulated, lastDisplayed }) => {
    const ch = channel || socket.data.channel;
    console.log(`[${ch}] Sync response from ${role}`);
  });

  // -------- 연결 해제 --------
  socket.on('disconnect', () => {
    const ch = socket.data.channel;
    const role = socket.data.role;
    console.log(`[${new Date().toISOString()}] Socket disconnected: ${socket.id}`);

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

        // 활성자 일관성 보정 및 방송 (1인 남았을 때 자동 활성화)
        broadcastActiveRole(io, ch);

        // 채널 비면 정리
        if (stenoChannels[ch].length === 0) {
          delete stenoChannels[ch];
          delete channelStates[ch];
          delete channelSpeakers[ch];
          delete channelEditStates[ch];
          console.log(`[${ch}] Channel cleaned up (empty)`);
        }
      }
    } else if (ch) {
      io.to(ch).emit('user_left', { role });
      console.log(`[${ch}] Viewer left: ${socket.id}`);
    }
  });

  // -------- 디버그 --------
  socket.on('get_channel_state', ({ channel }) => {
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
  });
});

// =========================
// 종료 핸들러
// =========================
process.on('SIGTERM', () => {
  console.log('[Shutdown] SIGTERM received');
  server.close(() => {
    console.log('[Shutdown] Server closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.log('[Shutdown] Forced exit');
    process.exit(1);
  }, 10000);
});

// =========================
// 기동
// =========================
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Running on port ${PORT}`);
  console.log(`[Environment] ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Health] http://localhost:${PORT}/health`);
  console.log(`[Admin] username=admin, password=123456s`);
});
