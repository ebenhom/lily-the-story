const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
require('dotenv').config();
const { Pool } = require('pg');

// ===================== NEON CONNECTION =====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10
});

pool.query('SELECT NOW()')
  .then(() => console.log('✅ Đã kết nối Neon PostgreSQL'))
  .catch(err => console.error('❌ Lỗi kết nối Neon:', err.message));

// ===================== CONFIG =====================
const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const UPLOADS = path.join(PUBLIC, 'uploads');

if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });

const sessions = new Map();

const GENRES = [
  'Ngôn tình (BG)', 'Đam mỹ (BL)', 'Bách hợp (GL)', '1x1', 'NP', 'Vô CP',
  'Thanh mai trúc mã', 'Gương vỡ lại lành', 'Cưới trước yêu sau',
  'Hiện đại', 'Đô thị', 'Cổ đại', 'Học đường', 'Thanh xuân vườn trường',
  'Hào môn thế gia', 'Giới giải trí (Showbiz)', 'Mạt thế',
  'Tiên hiệp', 'Huyền huyễn', 'Kiếm hiệp', 'Khoa học viễn tưởng', 'Tinh tế',
  'ABO', 'Điền văn', 'Vô hạn lưu', 'Dân quốc',
  'Xuyên không', 'Xuyên sách', 'Trùng sinh', 'Xuyên nhanh', 'Hệ thống',
  'Cung đấu', 'Trạch đấu', 'Vả mặt', 'Sảng văn', 'Chữa lành',
  'Livestream', 'Esport', 'Đoản văn',
  'Nam cường', 'Nữ cường', 'Tổng tài', 'Bệnh kiều', 'Sủng', 'Ngọt', 'Ngược',
  'Hài hước', 'Linh dị', 'Kinh dị', 'Trinh thám',
  'HE', 'BE', 'OE', 'SE'
];

// ===================== HELPERS =====================
function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function getAuth(req) {
  const token = req.headers['x-auth-token'];
  if (!token) return null;
  return sessions.get(token) || null;
}

function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-auth-token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
    '.json': 'application/json', '.pdf': 'application/pdf'
  };
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 50e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { resolve({}); }
    });
  });
}

function saveBase64Image(dataUrl, prefix) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl || '';
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return '';
  const ext = match[1].includes('png') ? 'png' : match[1].includes('webp') ? 'webp' : match[1].includes('gif') ? 'gif' : 'jpg';
  const filename = prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
  const filepath = path.join(UPLOADS, filename);
  fs.writeFileSync(filepath, Buffer.from(match[2], 'base64'));
  return '/uploads/' + filename;
}

// ===================== DB HELPERS =====================
async function getUserById(id) {
  const r = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return r.rows[0] || null;
}

async function requireUser(req, res) {
  const auth = getAuth(req);
  if (!auth) { sendJSON(res, 401, { error: 'Vui lòng đăng nhập' }); return null; }
  const user = await getUserById(auth.id);
  if (!user || user.blocked) { sendJSON(res, 403, { error: 'Tài khoản bị khóa' }); return null; }
  return user;
}

async function requireAdmin(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (user.role !== 'admin') { sendJSON(res, 403, { error: 'Cần quyền admin' }); return null; }
  return user;
}

async function getSettings() {
  const r = await pool.query('SELECT value FROM settings WHERE key = $1', ['global']);
  if (r.rows.length === 0) return { globalCommentsDisabled: false };
  return r.rows[0].value;
}

async function saveSettings(data) {
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ('global', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [JSON.stringify(data)]
  );
}

// ===================== SERVER =====================
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, x-auth-token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    });
    res.end();
    return;
  }

  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method;

  try {
    // ===== API =====
    if (pathname.startsWith('/api/')) {

      // GENRES
      if (pathname === '/api/genres' && method === 'GET') {
        return sendJSON(res, 200, GENRES);
      }

      // REGISTER
      if (pathname === '/api/register' && method === 'POST') {
        const body = await parseBody(req);
        if (!body.email || !body.password || !body.name) {
          return sendJSON(res, 400, { error: 'Thiếu email, mật khẩu hoặc tên' });
        }
        const exists = await pool.query('SELECT id FROM users WHERE email = $1', [body.email]);
        if (exists.rows.length > 0) {
          return sendJSON(res, 400, { error: 'Email đã tồn tại' });
        }
        const id = uuid();
        await pool.query(
          `INSERT INTO users (id, email, password, name, role, blocked, favorites, history, created_at)
           VALUES ($1,$2,$3,$4,'user',false,'[]','[]',$5)`,
          [id, body.email, body.password, body.name, new Date().toISOString().slice(0, 10)]
        );
        const token = uuid();
        sessions.set(token, { id, email: body.email, name: body.name, role: 'user' });
        return sendJSON(res, 200, {
          token,
          user: { id, email: body.email, name: body.name, role: 'user' }
        });
      }

      // LOGIN
      if (pathname === '/api/login' && method === 'POST') {
        const body = await parseBody(req);
        const r = await pool.query(
          'SELECT * FROM users WHERE email = $1 AND password = $2',
          [body.email, body.password]
        );
        if (r.rows.length === 0) return sendJSON(res, 401, { error: 'Email hoặc mật khẩu không đúng' });
        const user = r.rows[0];
        if (user.blocked) return sendJSON(res, 403, { error: 'Tài khoản đã bị khóa' });
        const token = uuid();
        sessions.set(token, { id: user.id, email: user.email, name: user.name, role: user.role });
        return sendJSON(res, 200, {
          token,
          user: { id: user.id, email: user.email, name: user.name, role: user.role }
        });
      }

      if (pathname === '/api/logout' && method === 'POST') {
        const token = req.headers['x-auth-token'];
        if (token) sessions.delete(token);
        return sendJSON(res, 200, { ok: true });
      }

      if (pathname === '/api/me' && method === 'GET') {
        const user = await requireUser(req, res);
        if (!user) return;
        return sendJSON(res, 200, {
          user: {
            id: user.id, email: user.email, name: user.name, role: user.role,
            favorites: user.favorites || [], history: user.history || []
          }
        });
      }

      // STORIES LIST
      if (pathname === '/api/stories' && method === 'GET') {
        let sql = `SELECT * FROM stories WHERE hidden = false`;
        const params = [];
        let i = 1;
        const { type, genre, q, sort } = parsed.query;

        if (type) {
          sql += ` AND type = $${i++}`;
          params.push(type);
        }
        if (genre) {
          sql += ` AND genres::text ILIKE $${i++}`;
          params.push(`%${genre}%`);
        }
        if (q) {
          sql += ` AND (title ILIKE $${i} OR author ILIKE $${i} OR description ILIKE $${i})`;
          params.push(`%${q}%`);
          i++;
        }

        if (sort === 'views') sql += ' ORDER BY views DESC';
        else if (sort === 'rating') sql += ' ORDER BY rating DESC';
        else sql += ' ORDER BY created_at DESC';

        const r = await pool.query(sql, params);
        const list = r.rows.map(s => ({
          id: s.id, title: s.title, author: s.author, type: s.type,
          genres: s.genres || [], cover: s.cover, description: s.description,
          status: s.status, views: s.views, rating: s.rating, createdAt: s.created_at,
          chapterCount: (s.chapters || []).length,
          hidden: !!s.hidden, commentsDisabled: !!s.comments_disabled
        }));
        return sendJSON(res, 200, list);
      }

      // STORY DETAIL
      const storyMatch = pathname.match(/^\/api\/stories\/([^/]+)$/);
      if (storyMatch && method === 'GET') {
        const r = await pool.query('SELECT * FROM stories WHERE id = $1', [storyMatch[1]]);
        if (r.rows.length === 0) return sendJSON(res, 404, { error: 'Không tìm thấy truyện' });
        const story = r.rows[0];
        const auth = getAuth(req);
        const isAdmin = auth && auth.role === 'admin';
        if (story.hidden && !isAdmin) return sendJSON(res, 404, { error: 'Không tìm thấy truyện' });

        await pool.query('UPDATE stories SET views = views + 1 WHERE id = $1', [story.id]);

        return sendJSON(res, 200, {
          id: story.id,
          title: story.title,
          author: story.author,
          type: story.type,
          genres: story.genres || [],
          cover: story.cover,
          description: story.description,
          status: story.status,
          views: (story.views || 0) + 1,
          rating: story.rating,
          createdAt: story.created_at,
          chapters: story.chapters || [],
          hidden: !!story.hidden,
          commentsDisabled: !!story.comments_disabled
        });
      }

      // CHAPTER
      const chMatch = pathname.match(/^\/api\/stories\/([^/]+)\/chapters\/([^/]+)$/);
      if (chMatch && method === 'GET') {
        const r = await pool.query('SELECT * FROM stories WHERE id = $1', [chMatch[1]]);
        if (r.rows.length === 0) return sendJSON(res, 404, { error: 'Không tìm thấy truyện' });
        const story = r.rows[0];
        const chapters = story.chapters || [];
        const idx = chapters.findIndex(c => c.id === chMatch[2]);
        if (idx === -1) return sendJSON(res, 404, { error: 'Không tìm thấy chương' });
        const chapter = chapters[idx];
        return sendJSON(res, 200, {
          story: { id: story.id, title: story.title, type: story.type },
          chapter,
          prevChapter: idx > 0 ? chapters[idx - 1] : null,
          nextChapter: idx < chapters.length - 1 ? chapters[idx + 1] : null,
          chapters: chapters.map(c => ({ id: c.id, title: c.title, order: c.order }))
        });
      }

      // FAVORITES
      if (pathname === '/api/favorites' && method === 'GET') {
        const user = await requireUser(req, res);
        if (!user) return;
        const favIds = user.favorites || [];
        if (favIds.length === 0) return sendJSON(res, 200, []);
        const r = await pool.query(
          'SELECT * FROM stories WHERE id = ANY($1::text[])',
          [favIds]
        );
        const list = r.rows.map(s => ({
          id: s.id, title: s.title, author: s.author, type: s.type,
          cover: s.cover, genres: s.genres, chapterCount: (s.chapters || []).length
        }));
        return sendJSON(res, 200, list);
      }

      if (pathname === '/api/favorites/toggle' && method === 'POST') {
        const user = await requireUser(req, res);
        if (!user) return;
        const body = await parseBody(req);
        let favs = user.favorites || [];
        const idx = favs.indexOf(body.storyId);
        if (idx >= 0) favs.splice(idx, 1);
        else favs.push(body.storyId);
        await pool.query('UPDATE users SET favorites = $1 WHERE id = $2', [JSON.stringify(favs), user.id]);
        return sendJSON(res, 200, { favorites: favs });
      }

      // HISTORY
      if (pathname === '/api/history' && method === 'GET') {
        const user = await requireUser(req, res);
        if (!user) return;
        const history = user.history || [];
        if (history.length === 0) return sendJSON(res, 200, []);
        const storyIds = history.map(h => h.storyId);
        const r = await pool.query('SELECT * FROM stories WHERE id = ANY($1::text[])', [storyIds]);
        const storiesMap = {};
        r.rows.forEach(s => storiesMap[s.id] = s);
        const result = history.map(h => {
          const s = storiesMap[h.storyId];
          if (!s) return null;
          return {
            storyId: h.storyId, chapterId: h.chapterId, title: s.title,
            chapterTitle: h.chapterTitle, cover: s.cover, type: s.type, readAt: h.readAt
          };
        }).filter(Boolean);
        return sendJSON(res, 200, result);
      }

      if (pathname === '/api/history' && method === 'POST') {
        const user = await requireUser(req, res);
        if (!user) return;
        const body = await parseBody(req);
        let history = user.history || [];
        history = history.filter(h => h.storyId !== body.storyId);
        history.unshift({
          storyId: body.storyId,
          chapterId: body.chapterId,
          chapterTitle: body.chapterTitle || '',
          readAt: new Date().toISOString()
        });
        if (history.length > 50) history = history.slice(0, 50);
        await pool.query('UPDATE users SET history = $1 WHERE id = $2', [JSON.stringify(history), user.id]);
        return sendJSON(res, 200, { ok: true });
      }

      // COMMENTS
      if (pathname.match(/^\/api\/stories\/[^/]+\/comments$/) && method === 'GET') {
        const storyId = pathname.split('/')[3];
        const settings = await getSettings();
        const storyR = await pool.query('SELECT comments_disabled FROM stories WHERE id = $1', [storyId]);
        if (settings.globalCommentsDisabled || (storyR.rows[0] && storyR.rows[0].comments_disabled)) {
          return sendJSON(res, 200, { disabled: true, comments: [] });
        }
        const r = await pool.query(
          'SELECT * FROM comments WHERE story_id = $1 AND hidden = false ORDER BY created_at DESC',
          [storyId]
        );
        return sendJSON(res, 200, { disabled: false, comments: r.rows });
      }

      if (pathname.match(/^\/api\/stories\/[^/]+\/comments$/) && method === 'POST') {
        const user = await requireUser(req, res);
        if (!user) return;
        if (user.ban_comment) return sendJSON(res, 403, { error: 'Bạn đã bị cấm bình luận' });
        const storyId = pathname.split('/')[3];
        const settings = await getSettings();
        if (settings.globalCommentsDisabled) return sendJSON(res, 403, { error: 'Bình luận đang bị tắt trên toàn site' });
        const storyR = await pool.query('SELECT comments_disabled FROM stories WHERE id = $1', [storyId]);
        if (storyR.rows[0] && storyR.rows[0].comments_disabled) {
          return sendJSON(res, 403, { error: 'Truyện này đã tắt bình luận' });
        }
        const body = await parseBody(req);
        if (!body.content || !body.content.trim()) return sendJSON(res, 400, { error: 'Nội dung trống' });
        const id = uuid();
        const createdAt = new Date().toISOString();
        await pool.query(
          `INSERT INTO comments (id, story_id, user_id, user_name, content, chapter_id, created_at, hidden, likes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,false,'[]')`,
          [id, storyId, user.id, user.name, body.content.trim(), body.chapterId || null, createdAt]
        );
        return sendJSON(res, 200, {
          id, storyId, userId: user.id, userName: user.name,
          content: body.content.trim(), chapterId: body.chapterId || null,
          createdAt, hidden: false, likes: []
        });
      }

      // LIKE COMMENT
      if (pathname.match(/^\/api\/comments\/[^/]+\/like$/) && method === 'POST') {
        const user = await requireUser(req, res);
        if (!user) return;
        const cmtId = pathname.split('/')[3];
        const r = await pool.query('SELECT * FROM comments WHERE id = $1', [cmtId]);
        if (r.rows.length === 0) return sendJSON(res, 404, { error: 'Không tìm thấy bình luận' });
        let likes = r.rows[0].likes || [];
        const idx = likes.indexOf(user.id);
        if (idx >= 0) likes.splice(idx, 1);
        else likes.push(user.id);
        await pool.query('UPDATE comments SET likes = $1 WHERE id = $2', [JSON.stringify(likes), cmtId]);
        return sendJSON(res, 200, { likes: likes.length, liked: likes.includes(user.id) });
      }

      // SETTINGS
      if (pathname === '/api/settings' && method === 'GET') {
        return sendJSON(res, 200, await getSettings());
      }
      if (pathname === '/api/admin/settings' && method === 'PUT') {
        if (!(await requireAdmin(req, res))) return;
        const body = await parseBody(req);
        const settings = await getSettings();
        if (body.globalCommentsDisabled !== undefined) settings.globalCommentsDisabled = !!body.globalCommentsDisabled;
        await saveSettings(settings);
        return sendJSON(res, 200, settings);
      }

      // ===== ADMIN STORIES =====
      if (pathname === '/api/admin/stories' && method === 'GET') {
        if (!(await requireAdmin(req, res))) return;
        const r = await pool.query('SELECT * FROM stories ORDER BY created_at DESC');
        return sendJSON(res, 200, r.rows.map(s => ({
          ...s,
          createdAt: s.created_at,
          commentsDisabled: s.comments_disabled
        })));
      }

      if (pathname === '/api/admin/stories' && method === 'POST') {
        if (!(await requireAdmin(req, res))) return;
        const body = await parseBody(req);
        if (!body.title || !body.type) return sendJSON(res, 400, { error: 'Thiếu tiêu đề hoặc loại' });
        let cover = body.cover || '';
        if (cover.startsWith('data:')) cover = saveBase64Image(cover, 'cover');
        const id = uuid();
        const createdAt = new Date().toISOString().slice(0, 10);
        await pool.query(
          `INSERT INTO stories (id, title, author, type, genres, cover, description, status, views, rating, created_at, chapters, hidden, comments_disabled)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,0,$9,'[]',$10,$11)`,
          [
            id, body.title, body.author || 'Ẩn danh', body.type,
            JSON.stringify(body.genres || []), cover, body.description || '',
            body.status || 'Đang ra', createdAt, !!body.hidden, !!body.commentsDisabled
          ]
        );
        return sendJSON(res, 200, {
          id, title: body.title, author: body.author || 'Ẩn danh', type: body.type,
          genres: body.genres || [], cover, description: body.description || '',
          status: body.status || 'Đang ra', views: 0, rating: 0, createdAt,
          chapters: [], hidden: !!body.hidden, commentsDisabled: !!body.commentsDisabled
        });
      }

      const adminStoryMatch = pathname.match(/^\/api\/admin\/stories\/([^/]+)$/);
      if (adminStoryMatch && method === 'PUT') {
        if (!(await requireAdmin(req, res))) return;
        const r = await pool.query('SELECT * FROM stories WHERE id = $1', [adminStoryMatch[1]]);
        if (r.rows.length === 0) return sendJSON(res, 404, { error: 'Không tìm thấy' });
        const body = await parseBody(req);
        const s = r.rows[0];
        const title = body.title !== undefined ? body.title : s.title;
        const author = body.author !== undefined ? body.author : s.author;
        const type = body.type !== undefined ? body.type : s.type;
        const description = body.description !== undefined ? body.description : s.description;
        const status = body.status !== undefined ? body.status : s.status;
        const rating = body.rating !== undefined ? body.rating : s.rating;
        const genres = body.genres !== undefined ? body.genres : s.genres;
        const hidden = body.hidden !== undefined ? !!body.hidden : s.hidden;
        const commentsDisabled = body.commentsDisabled !== undefined ? !!body.commentsDisabled : s.comments_disabled;
        let cover = s.cover;
        if (body.cover !== undefined) {
          cover = body.cover.startsWith('data:') ? saveBase64Image(body.cover, 'cover') : body.cover;
        }
        await pool.query(
          `UPDATE stories SET title=$1, author=$2, type=$3, description=$4, status=$5, rating=$6,
           genres=$7, hidden=$8, comments_disabled=$9, cover=$10 WHERE id=$11`,
          [title, author, type, description, status, rating, JSON.stringify(genres), hidden, commentsDisabled, cover, adminStoryMatch[1]]
        );
        return sendJSON(res, 200, {
          id: adminStoryMatch[1], title, author, type, description, status, rating,
          genres, hidden, commentsDisabled, cover, chapters: s.chapters
        });
      }

      if (adminStoryMatch && method === 'DELETE') {
        if (!(await requireAdmin(req, res))) return;
        await pool.query('DELETE FROM stories WHERE id = $1', [adminStoryMatch[1]]);
        return sendJSON(res, 200, { ok: true });
      }

      // ADMIN CHAPTERS
      const addChMatch = pathname.match(/^\/api\/admin\/stories\/([^/]+)\/chapters$/);
      if (addChMatch && method === 'POST') {
        if (!(await requireAdmin(req, res))) return;
        const r = await pool.query('SELECT * FROM stories WHERE id = $1', [addChMatch[1]]);
        if (r.rows.length === 0) return sendJSON(res, 404, { error: 'Không tìm thấy truyện' });
        const story = r.rows[0];
        const body = await parseBody(req);
        const chapters = story.chapters || [];
        const order = chapters.length + 1;
        const chapter = { id: story.id + '-' + order, title: body.title || 'Chương ' + order, order };
        if (story.type === 'novel') {
          chapter.content = body.content || '';
          chapter.styles = body.styles || {};
        } else {
          let pages = body.pages || [];
          chapter.pages = pages.map((p, i) => p.startsWith('data:') ? saveBase64Image(p, 'page-' + order + '-' + i) : p);
        }
        chapters.push(chapter);
        await pool.query('UPDATE stories SET chapters = $1 WHERE id = $2', [JSON.stringify(chapters), story.id]);
        return sendJSON(res, 200, chapter);
      }

      const adminChMatch = pathname.match(/^\/api\/admin\/stories\/([^/]+)\/chapters\/([^/]+)$/);
      if (adminChMatch) {
        if (!(await requireAdmin(req, res))) return;
        const r = await pool.query('SELECT * FROM stories WHERE id = $1', [adminChMatch[1]]);
        if (r.rows.length === 0) return sendJSON(res, 404, { error: 'Không tìm thấy' });
        const story = r.rows[0];
        let chapters = story.chapters || [];

        if (method === 'PUT') {
          const ch = chapters.find(c => c.id === adminChMatch[2]);
          if (!ch) return sendJSON(res, 404, { error: 'Không tìm thấy chương' });
          const body = await parseBody(req);
          if (body.title) ch.title = body.title;
          if (body.content !== undefined) ch.content = body.content;
          if (body.styles) ch.styles = body.styles;
          if (body.pages) {
            ch.pages = body.pages.map((p, i) => p.startsWith('data:') ? saveBase64Image(p, 'page-' + i) : p);
          }
          await pool.query('UPDATE stories SET chapters = $1 WHERE id = $2', [JSON.stringify(chapters), story.id]);
          return sendJSON(res, 200, ch);
        }
        if (method === 'DELETE') {
          chapters = chapters.filter(c => c.id !== adminChMatch[2]);
          await pool.query('UPDATE stories SET chapters = $1 WHERE id = $2', [JSON.stringify(chapters), story.id]);
          return sendJSON(res, 200, { ok: true });
        }
      }

      // ADMIN USERS
      if (pathname === '/api/admin/users' && method === 'GET') {
        if (!(await requireAdmin(req, res))) return;
        const r = await pool.query(
          'SELECT id, email, name, role, blocked, ban_comment, created_at FROM users ORDER BY created_at DESC'
        );
        return sendJSON(res, 200, r.rows.map(u => ({
          id: u.id, email: u.email, name: u.name, role: u.role,
          blocked: !!u.blocked, banComment: !!u.ban_comment, createdAt: u.created_at
        })));
      }

      if (pathname === '/api/admin/users' && method === 'POST') {
        if (!(await requireAdmin(req, res))) return;
        const body = await parseBody(req);
        if (!body.email || !body.password) return sendJSON(res, 400, { error: 'Thiếu email hoặc mật khẩu' });
        if (body.masterPassword !== 'phanhnguyen666') {
          return sendJSON(res, 403, { error: 'Mật khẩu xác nhận quyền admin không đúng' });
        }
        const exists = await pool.query('SELECT * FROM users WHERE email = $1', [body.email]);
        if (exists.rows.length > 0) {
          await pool.query(
            'UPDATE users SET role = $1, password = $2, name = COALESCE($3, name) WHERE email = $4',
            ['admin', body.password, body.name || null, body.email]
          );
          const u = exists.rows[0];
          return sendJSON(res, 200, { id: u.id, email: u.email, name: body.name || u.name, role: 'admin' });
        } else {
          const id = uuid();
          const name = body.name || body.email.split('@')[0];
          await pool.query(
            `INSERT INTO users (id, email, password, name, role, blocked, favorites, history, created_at)
             VALUES ($1,$2,$3,$4,'admin',false,'[]','[]',$5)`,
            [id, body.email, body.password, name, new Date().toISOString().slice(0, 10)]
          );
          return sendJSON(res, 200, { id, email: body.email, name, role: 'admin' });
        }
      }

      const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
      if (adminUserMatch && method === 'PUT') {
        if (!(await requireAdmin(req, res))) return;
        const r = await pool.query('SELECT * FROM users WHERE id = $1', [adminUserMatch[1]]);
        if (r.rows.length === 0) return sendJSON(res, 404, { error: 'Không tìm thấy user' });
        const body = await parseBody(req);
        const u = r.rows[0];
        const blocked = body.blocked !== undefined ? !!body.blocked : u.blocked;
        const banComment = body.banComment !== undefined ? !!body.banComment : u.ban_comment;
        const role = body.role || u.role;
        await pool.query(
          'UPDATE users SET blocked = $1, ban_comment = $2, role = $3 WHERE id = $4',
          [blocked, banComment, role, adminUserMatch[1]]
        );
        return sendJSON(res, 200, {
          id: u.id, email: u.email, name: u.name, role, blocked, banComment
        });
      }

      if (adminUserMatch && method === 'DELETE') {
        if (!(await requireAdmin(req, res))) return;
        const r = await pool.query('SELECT email FROM users WHERE id = $1', [adminUserMatch[1]]);
        if (r.rows[0] && r.rows[0].email === 'phanhnguyen342@gmail.com') {
          return sendJSON(res, 403, { error: 'Không thể xóa admin chính' });
        }
        await pool.query('DELETE FROM users WHERE id = $1', [adminUserMatch[1]]);
        return sendJSON(res, 200, { ok: true });
      }

      // ADMIN COMMENTS
      if (pathname === '/api/admin/comments' && method === 'GET') {
        if (!(await requireAdmin(req, res))) return;
        const r = await pool.query('SELECT * FROM comments ORDER BY created_at DESC');
        return sendJSON(res, 200, r.rows);
      }

      const adminCmtMatch = pathname.match(/^\/api\/admin\/comments\/([^/]+)$/);
      if (adminCmtMatch && method === 'PUT') {
        if (!(await requireAdmin(req, res))) return;
        const body = await parseBody(req);
        if (body.hidden !== undefined) {
          await pool.query('UPDATE comments SET hidden = $1 WHERE id = $2', [!!body.hidden, adminCmtMatch[1]]);
        }
        const r = await pool.query('SELECT * FROM comments WHERE id = $1', [adminCmtMatch[1]]);
        return sendJSON(res, 200, r.rows[0] || {});
      }

      if (adminCmtMatch && method === 'DELETE') {
        if (!(await requireAdmin(req, res))) return;
        await pool.query('DELETE FROM comments WHERE id = $1', [adminCmtMatch[1]]);
        return sendJSON(res, 200, { ok: true });
      }

      return sendJSON(res, 404, { error: 'API không tồn tại' });
    }

    // Static files
    let filePath = path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname);
    if (!filePath.startsWith(PUBLIC)) { res.writeHead(403); res.end('Forbidden'); return; }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(PUBLIC, 'index.html');
    }
    sendFile(res, filePath);

  } catch (err) {
    console.error('Server error:', err);
    sendJSON(res, 500, { error: 'Lỗi server', detail: err.message });
  }
});

server.listen(PORT, () => {
  console.log('🌸 Lily the Story đang chạy tại http://localhost:' + PORT);
  console.log('   Admin: phanhnguyen342@gmail.com / phanhnguyen666');
});