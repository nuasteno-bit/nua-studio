// db/db_app.js - SQLite 영속화 모듈
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// DB 파일 경로
const DB_PATH = process.env.CHANNELS_DB_PATH || path.join(__dirname, '..', 'nuastudio.db');

// DB 디렉토리가 없으면 생성
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  try {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`[DB] 디렉토리 생성: ${dbDir}`);
  } catch (error) {
    console.error(`[DB] 디렉토리 생성 실패: ${error.message}`);
  }
}

console.log(`[DB] SQLite 파일 경로: ${DB_PATH}`);

// DB 연결
let db;
try {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL'); // 성능 최적화
  db.pragma('foreign_keys = ON');   // 외래키 제약 활성화
  console.log('[DB] SQLite 연결 성공');
} catch (error) {
  console.error('[DB] SQLite 연결 실패:', error);
  throw new Error('Database initialization failed');
}

// 테이블 생성
try {
  db.exec(`
    -- channels: 채널 메타
    CREATE TABLE IF NOT EXISTS channels (
      code           TEXT PRIMARY KEY,
      type           TEXT DEFAULT 'public',
      passkey        TEXT,
      eventName      TEXT,
      eventDateTime  TEXT,
      createdAt      INTEGER NOT NULL,
      autoDelete     INTEGER DEFAULT 1,   -- 0 or 1
      expiresAt      INTEGER,             -- nullable (epoch ms)
      lastActivity   INTEGER              -- 마지막 활동 시간
    );

    -- viewer_texts: 최종 자막 라인/블록 로그
    CREATE TABLE IF NOT EXISTS viewer_texts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      channelCode  TEXT NOT NULL,
      content      TEXT NOT NULL,
      createdAt    INTEGER NOT NULL,
      FOREIGN KEY (channelCode) REFERENCES channels(code) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_viewer_texts_channel_time
      ON viewer_texts (channelCode, createdAt);
    
    CREATE INDEX IF NOT EXISTS idx_channels_expires
      ON channels (expiresAt) WHERE expiresAt IS NOT NULL;
  `);
  console.log('[DB] 테이블 생성/확인 완료');
} catch (error) {
  console.error('[DB] 테이블 생성 실패:', error);
  throw error;
}

// =========================
// 채널 관련 함수
// =========================

/**
 * 채널 저장 (upsert)
 * @param {Object} ch - 채널 정보
 */
function saveChannel(ch) {
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO channels 
      (code, type, passkey, eventName, eventDateTime, createdAt, autoDelete, expiresAt, lastActivity)
      VALUES (@code, @type, @passkey, @eventName, @eventDateTime, @createdAt, @autoDelete, @expiresAt, @lastActivity)
    `);
    
    const result = stmt.run({
      code: ch.code,
      type: ch.type || 'public',
      passkey: ch.passkey || null,
      eventName: ch.eventName || '',
      eventDateTime: ch.eventDateTime || null,
      createdAt: ch.createdAt || Date.now(),
      autoDelete: ch.autoDelete === false ? 0 : 1,
      expiresAt: ch.expiresAt || null,
      lastActivity: ch.lastActivity || Date.now()
    });
    
    return result.changes > 0;
  } catch (error) {
    console.error('[DB] saveChannel error:', error);
    return false;
  }
}

/**
 * 채널 단건 조회
 * @param {string} code - 채널 코드
 * @returns {Object|null} 채널 정보
 */
function loadChannel(code) {
  const stmt = db.prepare('SELECT * FROM channels WHERE code = ?');
  const row = stmt.get(code);
  
  if (!row) return null;
  
  return {
    code: row.code,
    type: row.type,
    passkey: row.passkey,
    eventName: row.eventName,
    eventDateTime: row.eventDateTime,
    createdAt: row.createdAt,
    autoDelete: row.autoDelete === 1,
    expiresAt: row.expiresAt
  };
}

/**
 * 모든 채널 조회
 * @returns {Array} 채널 배열
 */
function loadAllChannels() {
  try {
    const stmt = db.prepare('SELECT * FROM channels');
    const rows = stmt.all();
    
    return rows.map(row => ({
      code: row.code,
      type: row.type,
      passkey: row.passkey,
      eventName: row.eventName,
      eventDateTime: row.eventDateTime,
      createdAt: row.createdAt,
      autoDelete: row.autoDelete === 1,
      expiresAt: row.expiresAt
    }));
  } catch (error) {
    console.error('[DB] loadAllChannels error:', error);
    return [];  // 에러 시 빈 배열 반환
  }
}

/**
 * 채널 삭제
 * @param {string} code - 채널 코드
 */
function deleteChannel(code) {
  try {
    // viewer_texts도 함께 삭제 (CASCADE)
    const deleteTexts = db.prepare('DELETE FROM viewer_texts WHERE channelCode = ?');
    const deleteChannel = db.prepare('DELETE FROM channels WHERE code = ?');
    
    const transaction = db.transaction(() => {
      deleteTexts.run(code);
      deleteChannel.run(code);
    });
    
    transaction();
    return true;
  } catch (error) {
    console.error('[DB] deleteChannel error:', error);
    return false;
  }
}

// =========================
// 뷰어 텍스트 관련 함수
// =========================

/**
 * 뷰어 텍스트 추가
 * @param {string} channelCode - 채널 코드
 * @param {string} content - 텍스트 내용
 * @param {number} createdAt - 생성 시각 (기본: 현재)
 */
function appendViewerText(channelCode, content, createdAt = Date.now()) {
  try {
    // 빈 컨텐츠는 저장하지 않음
    if (!content || !content.trim()) {
      return false;
    }
    
    const stmt = db.prepare(`
      INSERT INTO viewer_texts (channelCode, content, createdAt)
      VALUES (?, ?, ?)
    `);
    
    const result = stmt.run(channelCode, content.trim(), createdAt);
    return result.changes > 0;
  } catch (error) {
    console.error('[DB] appendViewerText error:', error);
    return false;
  }
}

/**
 * 최근 뷰어 텍스트 조회 (오래된 순서로 반환)
 * @param {string} channelCode - 채널 코드
 * @param {number} limit - 조회 개수 (기본: 200)
 * @returns {Array} 텍스트 배열
 */
function loadRecentViewerTexts(channelCode, limit = 200) {
  const stmt = db.prepare(`
    SELECT * FROM viewer_texts
    WHERE channelCode = ?
    ORDER BY createdAt DESC
    LIMIT ?
  `);
  
  const rows = stmt.all(channelCode, limit);
  
  // 오래된 순서로 반환 (역순)
  return rows.reverse();
}

/**
 * 특정 시점 이후 뷰어 텍스트 조회
 * @param {string} channelCode - 채널 코드
 * @param {number} sinceMs - 시점 (epoch ms)
 * @param {number} limit - 최대 개수 (기본: 1000)
 * @returns {Array} 텍스트 배열
 */
function loadViewerTextsSince(channelCode, sinceMs, limit = 1000) {
  const stmt = db.prepare(`
    SELECT * FROM viewer_texts
    WHERE channelCode = ? AND createdAt > ?
    ORDER BY createdAt ASC
    LIMIT ?
  `);
  
  return stmt.all(channelCode, sinceMs, limit);
}

/**
 * 오래된 뷰어 텍스트 삭제
 * @param {string} channelCode - 채널 코드
 * @param {number} beforeMs - 이 시점 이전 삭제 (epoch ms)
 */
function purgeOldViewerTexts(channelCode, beforeMs) {
  try {
    const stmt = db.prepare(`
      DELETE FROM viewer_texts
      WHERE channelCode = ? AND createdAt < ?
    `);
    
    const result = stmt.run(channelCode, beforeMs);
    if (result.changes > 0) {
      console.log(`[DB] ${channelCode} 채널: ${result.changes}개 오래된 텍스트 삭제`);
    }
    return result.changes;
  } catch (error) {
    console.error('[DB] purgeOldViewerTexts error:', error);
    return 0;
  }
}

/**
 * DB 연결 종료
 */
function closeDB() {
  try {
    if (db) {
      db.close();
      console.log('[DB] SQLite 연결 종료');
    }
  } catch (error) {
    console.error('[DB] 연결 종료 실패:', error);
  }
}

// 프로세스 종료 시 DB 정리
process.on('SIGINT', () => {
  closeDB();
});
process.on('SIGTERM', () => {
  closeDB();
});
process.on('exit', () => {
  closeDB();
});

// =========================
// 모듈 내보내기
// =========================
module.exports = {
  DB_PATH,
  saveChannel,
  loadChannel,
  loadAllChannels,
  deleteChannel,
  appendViewerText,
  loadRecentViewerTexts,
  loadViewerTextsSince,
  purgeOldViewerTexts,
  closeDB
};
