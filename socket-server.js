const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Security and performance middleware
app.use(helmet({
  contentSecurityPolicy: false  // Required for Socket.IO
}));
app.use(compression());
app.use(cors({
  origin: '*',  // Production: specify actual domain
  credentials: true
}));

// Health check endpoint (CRITICAL for Render.com)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage().rss / 1024 / 1024 + ' MB'
  });
});

// Static files and JSON parsing
app.use(express.static(__dirname));
app.use(express.json());

// Initialize Socket.IO with proper CORS and transport fallback
const io = new Server(server, {
  cors: { 
    origin: '*',
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling'],  // Fallback support
  pingInterval: 25000,
  pingTimeout: 60000
});

// Channel database (in-memory)
const channelDatabase = new Map();

// Admin accounts
const ADMIN_ACCOUNTS = {
  'admin': {
    password: '123456s',
    role: 'system_admin'
  }
};

// Active sessions storage
const activeSessions = new Map();

// Token generation
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Auth middleware
function requireAuth(req, res, next) {
  const token = req.headers['authorization'];
  
  if (!token || !activeSessions.has(token)) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  req.user = activeSessions.get(token);
  next();
}

// Admin login API
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  console.log(`[Admin Login] Attempt - Username: ${username}`);
  
  const account = ADMIN_ACCOUNTS[username];
  if (account && account.password === password) {
    const token = generateToken();
    const sessionData = {
      username,
      role: account.role,
      loginTime: new Date()
    };
    
    activeSessions.set(token, sessionData);
    
    // Auto logout after 30 minutes
    setTimeout(() => {
      activeSessions.delete(token);
      console.log(`[Admin] Session expired for ${username}`);
    }, 30 * 60 * 1000);
    
    console.log(`[Admin Login] Success - Username: ${username}`);
    
    res.json({ 
      success: true, 
      token,
      role: account.role 
    });
  } else {
    console.log(`[Admin Login] Failed - Invalid credentials for: ${username}`);
    res.status(401).json({ 
      success: false, 
      error: 'Invalid credentials' 
    });
  }
});

// Logout API
app.post('/api/admin/logout', (req, res) => {
  const token = req.headers['authorization'];
  if (token && activeSessions.has(token)) {
    const session = activeSessions.get(token);
    console.log(`[Admin Logout] ${session.username}`);
    activeSessions.delete(token);
  }
  res.json({ success: true });
});

// Channel creation API
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
    activeUsers: 0
  };
  
  channelDatabase.set(code, channelInfo);
  console.log(`[API] Channel created: ${code}`);
  
  res.json({ success: true, channel: channelInfo });
});

// Channel list API
app.get('/api/channels', (req, res) => {
  const channels = Array.from(channelDatabase.values()).map(ch => ({
    ...ch,
    activeUsers: stenoChannels[ch.code] ? stenoChannels[ch.code].length : 0
  }));
  res.json(channels);
});

// Channel verification API
app.get('/api/channel/:code/verify', (req, res) => {
  const { code } = req.params;
  
  if (channelDatabase.has(code)) {
    res.json({ exists: true, channel: channelDatabase.get(code) });
  } else {
    res.status(404).json({ exists: false });
  }
});

// Channel deletion API
app.delete('/api/channel/:code', (req, res) => {
  const { code } = req.params;
  
  if (channelDatabase.has(code)) {
    channelDatabase.delete(code);
    console.log(`[API] Channel deleted: ${code}`);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Channel not found' });
  }
});

// Channel state management
const recentMessages = new Map();
const stenoChannels = {};
const channelStates = {};
const channelSpeakers = {};
const channelEditStates = {};

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`[${new Date().toISOString()}] Socket connected: ${socket.id}`);
  
  // Duplicate event prevention
  const socketEmit = socket.emit;
  socket.emit = function(...args) {
    if (args[0] === 'steno_input' && args[1]) {
      const key = `${socket.id}_${args[1].text}`;
      const now = Date.now();
      
      if (recentMessages.has(key)) {
        const lastTime = recentMessages.get(key);
        if (now - lastTime < 50) {
          return; // Ignore duplicates within 50ms
        }
      }
      
      recentMessages.set(key, now);
      setTimeout(() => recentMessages.delete(key), 100);
    }
    
    return socketEmit.apply(this, args);
  };
  
  // Join channel handler
  socket.on('join_channel', ({ channel, role, requestSync }) => {
    console.log(`[${channel}] Join request - Role: ${role}, Socket: ${socket.id}`);
    
    socket.join(channel);
    socket.data.channel = channel;

    if (role === 'steno') {
      // Initialize channel if needed
      if (!stenoChannels[channel]) {
        stenoChannels[channel] = [];
        channelStates[channel] = {
          activeStenographer: 'steno1',
          accumulatedText: '',
          lastSwitchText: ''
        };
        channelEditStates[channel] = {
          isEditing: false,
          editorId: null,
          editorRole: null
        };
      }

      // Check capacity (max 2)
      if (stenoChannels[channel].length >= 2) {
        socket.emit('join_reject', { reason: 'Channel full (max 2 stenographers)' });
        console.log(`[${channel}] Join rejected: capacity exceeded`);
        return;
      }

      // Assign role
      const myRole = stenoChannels[channel].length === 0 ? 'steno1' : 'steno2';
      stenoChannels[channel].push({ id: socket.id, role: myRole });
      socket.data.role = myRole;

      console.log(`[${channel}] Role assigned: ${myRole} to ${socket.id}`);

      // Broadcast stenographer list
      const stenos = stenoChannels[channel].map(s => s.role);
      io.to(channel).emit('steno_list', { stenos });

      // Send role assignment
      socket.emit('role_assigned', { role: myRole });

      // Send accumulated text if exists
      if (requestSync || channelStates[channel].accumulatedText) {
        socket.emit('sync_accumulated', { 
          accumulatedText: channelStates[channel].accumulatedText 
        });
        console.log(`[${channel}] Sync sent to ${myRole}`);
      }

      // Sync edit state
      if (channelEditStates[channel].isEditing) {
        socket.emit('viewer_edit_state', {
          isEditing: true,
          editorRole: channelEditStates[channel].editorRole
        });
      }

    } else {
      // Viewer role
      socket.data.role = 'viewer';
      io.to(channel).emit('user_joined', { role: 'viewer' });
      
      // Send accumulated text to viewer
      if (channelStates[channel] && channelStates[channel].accumulatedText) {
        socket.emit('sync_accumulated', { 
          accumulatedText: channelStates[channel].accumulatedText 
        });
        console.log(`[${channel}] Sync sent to viewer`);
      }
      console.log(`[${channel}] Viewer joined: ${socket.id}`);
    }
  });
  
  // Stenographer input handler
  socket.on('steno_input', ({ channel, role, text }) => {
    const now = Date.now();
    const msgKey = `${socket.id}_${text}`;
    
    if (!socket.lastMessages) socket.lastMessages = new Map();
    
    if (socket.lastMessages.has(msgKey)) {
      const lastTime = socket.lastMessages.get(msgKey);
      if (now - lastTime < 50) {
        console.log('[Server] Duplicate input blocked');
        return;
      }
    }
    
    socket.lastMessages.set(msgKey, now);
    
    // Cleanup after 1 second
    setTimeout(() => {
      socket.lastMessages.delete(msgKey);
    }, 1000);
    
    console.log(`[${channel}] Input from ${role}: "${text}"`);
    
    // Broadcast to all clients
    io.to(channel).emit('steno_input', { role, text });
  });
  
  // Role switch handler
  socket.on('switch_role', ({ channel, newActive, matchedText, manual, reason, matchStartIndex, matchWordCount }) => {
    console.log(`[${channel}] Role switch request - New active: ${newActive}`);
    
    if (!channelStates[channel]) {
      channelStates[channel] = {
        activeStenographer: 'steno1',
        accumulatedText: '',
        lastSwitchText: ''
      };
    }

    // Check if already active
    const currentActive = channelStates[channel].activeStenographer;
    if (currentActive === newActive) {
      console.log(`[${channel}] Switch aborted - ${newActive} already active`);
      return;
    }

    // Perform role switch
    const previousActive = channelStates[channel].activeStenographer;
    channelStates[channel].activeStenographer = newActive;
    
    // Handle manual vs automatic switch
    if (manual && matchedText && matchedText.trim()) {
      // Manual switch (F6/F7): append to accumulated text
      const beforeLength = channelStates[channel].accumulatedText.length;
      channelStates[channel].accumulatedText += matchedText;
      const afterLength = channelStates[channel].accumulatedText.length;
      
      console.log(`[${channel}] Manual switch - Text accumulated: ${beforeLength} -> ${afterLength} chars`);
      
    } else if (!manual && matchedText && matchedText.trim()) {
      // Automatic matching: replace up to match point
      channelStates[channel].accumulatedText = matchedText;
      channelStates[channel].lastSwitchText = matchedText;
      
      console.log(`[${channel}] Auto match - Text confirmed: "${matchedText}"`);
    }

    // Broadcast role switch
    io.to(channel).emit('switch_role', { 
      newActive, 
      matchedText,
      accumulatedText: channelStates[channel].accumulatedText,
      previousActive,
      manual: manual || false,
      matchStartIndex: matchStartIndex, 
      matchWordCount: matchWordCount     
    });

    const switchType = manual ? 'Manual' : 'Auto';
    console.log(`[${channel}] ${switchType} switch complete: ${previousActive} -> ${newActive}`);
  });
  
  // Text sent handler
  socket.on('text_sent', ({ channel, accumulatedText, sender }) => {
    console.log(`[${channel}] Text sent by ${sender}`);
    
    // Update channel state
    if (channelStates[channel]) {
      channelStates[channel].accumulatedText = accumulatedText;
    }
    
    // Broadcast to other clients
    socket.broadcast.to(channel).emit('text_sent', { 
      accumulatedText, 
      sender 
    });
  });
  
  // Speaker update handler
  socket.on('speaker_update', ({ channel, action, speaker, speakerId }) => {
    console.log(`[${channel}] Speaker update - Action: ${action}`);
    
    // Initialize speaker array
    if (!channelSpeakers[channel]) {
      channelSpeakers[channel] = [];
    }
    
    switch (action) {
      case 'add':
        channelSpeakers[channel].push(speaker);
        socket.broadcast.to(channel).emit('speaker_update', { 
          action: 'add', 
          speaker 
        });
        break;
        
      case 'edit':
        const editIndex = channelSpeakers[channel].findIndex(s => s.id === speaker.id);
        if (editIndex !== -1) {
          channelSpeakers[channel][editIndex] = speaker;
        }
        socket.broadcast.to(channel).emit('speaker_update', { 
          action: 'edit', 
          speaker 
        });
        break;
        
      case 'delete':
        channelSpeakers[channel] = channelSpeakers[channel].filter(s => s.id !== speakerId);
        socket.broadcast.to(channel).emit('speaker_update', { 
          action: 'delete', 
          speakerId 
        });
        break;
    }
  });

  // Speaker sync request
  socket.on('speaker_sync_request', ({ channel }) => {
    console.log(`[${channel}] Speaker sync requested`);
    
    if (channelSpeakers[channel] && channelSpeakers[channel].length > 0) {
      socket.emit('speaker_update', { 
        action: 'sync', 
        speakers: channelSpeakers[channel] 
      });
    }
  });

  // Speaker drag handlers
  socket.on('speaker_drag_start', (data) => {
    socket.broadcast.to(data.channel).emit('speaker_drag_start', data);
  });

  socket.on('speaker_dragging', (data) => {
    socket.broadcast.to(data.channel).emit('speaker_dragging', data);
  });

  socket.on('speaker_drag_end', ({ channel, speaker }) => {
    const speakers = channelSpeakers[channel];
    if (speakers) {
      const speakerIndex = speakers.findIndex(s => s.id === speaker.id);
      if (speakerIndex !== -1) {
        speakers[speakerIndex] = speaker;
      }
    }
    socket.broadcast.to(channel).emit('speaker_drag_end', { speaker });
  });

  // Correction request handler
  socket.on('correction_request', ({ channel, active, requester, requesterRole }) => {
    console.log(`[${channel}] Correction request from ${requester}`);
    
    socket.broadcast.to(channel).emit('correction_request', { 
      active, 
      requester,
      requesterRole 
    });
  });

  // Viewer edit handlers
  socket.on('viewer_edit_start', ({ channel, editorRole }) => {
    console.log(`[${channel}] Viewer edit started by ${editorRole}`);
    
    if (!channelEditStates[channel]) {
      channelEditStates[channel] = { isEditing: false, editorId: null, editorRole: null };
    }
    
    // Check if someone is already editing
    if (channelEditStates[channel].isEditing) {
      socket.emit('viewer_edit_denied', { 
        reason: `${channelEditStates[channel].editorRole} is already editing` 
      });
      return;
    }
    
    // Set edit state
    channelEditStates[channel].isEditing = true;
    channelEditStates[channel].editorId = socket.id;
    channelEditStates[channel].editorRole = editorRole;
    
    // Broadcast edit state
    io.to(channel).emit('viewer_edit_state', {
      isEditing: true,
      editorRole: editorRole
    });
  });

  socket.on('viewer_edit_complete', ({ channel, editedText, editorRole }) => {
    console.log(`[${channel}] Viewer edit completed`);
    
    if (!channelEditStates[channel]) {
      channelEditStates[channel] = { isEditing: false, editorId: null, editorRole: null };
    }
    
    // Verify editor permission
    if (channelEditStates[channel].editorId !== socket.id) {
      console.log(`[${channel}] Edit complete denied - not current editor`);
      return;
    }
    
    // Update accumulated text
    if (channelStates[channel]) {
      channelStates[channel].accumulatedText = editedText;
      console.log(`[${channel}] Text updated to ${editedText.length} chars`);
    }
    
    // Clear edit state
    channelEditStates[channel].isEditing = false;
    channelEditStates[channel].editorId = null;
    channelEditStates[channel].editorRole = null;
    
    // Broadcast updated content
    io.to(channel).emit('viewer_content_updated', {
      accumulatedText: editedText,
      editorRole: editorRole
    });
    
    // Broadcast edit state cleared
    io.to(channel).emit('viewer_edit_state', {
      isEditing: false,
      editorRole: null
    });
  });

  socket.on('viewer_edit_cancel', ({ channel }) => {
    console.log(`[${channel}] Viewer edit cancelled`);
    
    if (channelEditStates[channel] && channelEditStates[channel].editorId === socket.id) {
      // Clear edit state
      channelEditStates[channel].isEditing = false;
      channelEditStates[channel].editorId = null;
      channelEditStates[channel].editorRole = null;
      
      // Broadcast cancellation
      io.to(channel).emit('viewer_edit_state', {
        isEditing: false,
        editorRole: null
      });
    }
  });

  // Sync response handler
  socket.on('sync_response', ({ channel, role, currentAccumulated, lastDisplayed }) => {
    console.log(`[${channel}] Sync response from ${role}`);
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    const { channel, role } = socket.data;
    console.log(`[${new Date().toISOString()}] Socket disconnected: ${socket.id}`);
    
    if (channel && role && (role === 'steno1' || role === 'steno2')) {
      if (stenoChannels[channel]) {
        // Remove from stenographer list
        stenoChannels[channel] = stenoChannels[channel].filter(s => s.id !== socket.id);
        const stenos = stenoChannels[channel].map(s => s.role);
        
        // Notify remaining stenographers
        io.to(channel).emit('steno_list', { stenos });
        
        console.log(`[${channel}] Stenographer ${role} left`);
        
        // Clear edit state if editor disconnected
        if (channelEditStates[channel] && channelEditStates[channel].editorId === socket.id) {
          channelEditStates[channel].isEditing = false;
          channelEditStates[channel].editorId = null;
          channelEditStates[channel].editorRole = null;
          
          io.to(channel).emit('viewer_edit_state', {
            isEditing: false,
            editorRole: null
          });
        }
        
        // Cleanup empty channel
        if (stenoChannels[channel].length === 0) {
          delete stenoChannels[channel];
          delete channelStates[channel];
          delete channelSpeakers[channel];
          delete channelEditStates[channel];
          console.log(`[${channel}] Channel cleaned up (empty)`);
        }
      }
    } else if (channel) {
      // Viewer left
      io.to(channel).emit('user_left', { role });
      console.log(`[${channel}] Viewer left: ${socket.id}`);
    }
  });

  // Channel state query (debugging)
  socket.on('get_channel_state', ({ channel }) => {
    if (channelStates[channel]) {
      socket.emit('channel_state', {
        channel,
        state: channelStates[channel],
        stenographers: stenoChannels[channel] || [],
        speakers: channelSpeakers[channel] || [],
        editState: channelEditStates[channel] || { isEditing: false }
      });
    }
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Shutdown] SIGTERM received');
  server.close(() => {
    console.log('[Shutdown] Server closed');
    process.exit(0);
  });
  // Force exit after 10 seconds
  setTimeout(() => {
    console.log('[Shutdown] Forced exit');
    process.exit(1);
  }, 10000);
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Running on port ${PORT}`);
  console.log(`[Environment] ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Health] http://localhost:${PORT}/health`);
  console.log(`[Admin] username=admin, password=123456s`);
});