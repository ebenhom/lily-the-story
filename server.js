const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DATA = path.join(__dirname, 'data');
const UPLOADS = path.join(PUBLIC, 'uploads');
const STORIES_FILE = path.join(DATA, 'stories.json');
const USERS_FILE = path.join(DATA, 'users.json');
const COMMENTS_FILE = path.join(DATA, 'comments.json');

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

const SETTINGS_FILE = path.join(DATA, 'settings.json');

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); }
  catch { return { globalCommentsDisabled: false }; }
}
function writeSettings(data) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return []; }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
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

function requireUser(req, res) {
  const user = getAuth(req);
  if (!user) { sendJSON(res, 401, { error: 'Vui lòng đăng nhập' }); return null; }
  const users = readJSON(USERS_FILE);
  const full = users.find(u => u.id === user.id);
  if (!full || full.blocked) { sendJSON(res, 403, { error: 'Tài khoản bị khóa' }); return null; }
  return full;
}

function requireAdmin(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (user.role !== 'admin') { sendJSON(res, 403, { error: 'Cần quyền admin' }); return null; }
  return user;
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
      const users = readJSON(USERS_FILE);
      if (users.find(u => u.email === body.email)) {
        return sendJSON(res, 400, { error: 'Email đã tồn tại' });
      }
      const newUser = {
        id: uuid(), email: body.email, password: body.password,
        name: body.name, role: 'user', blocked: false,
        favorites: [], history: [], createdAt: new Date().toISOString().slice(0, 10)
      };
      users.push(newUser);
      writeJSON(USERS_FILE, users);
      const token = uuid();
      sessions.set(token, { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role });
      return sendJSON(res, 200, {
        token,
        user: { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role }
      });
    }

    // LOGIN
    if (pathname === '/api/login' && method === 'POST') {
      const body = await parseBody(req);
      const users = readJSON(USERS_FILE);
      const user = users.find(u => u.email === body.email && u.password === body.password);
      if (!user) return sendJSON(res, 401, { error: 'Email hoặc mật khẩu không đúng' });
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
      const user = requireUser(req, res);
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
      let stories = readJSON(STORIES_FILE).filter(s => !s.hidden);
      const { type, genre, q, sort } = parsed.query;
      if (type) stories = stories.filter(s => s.type === type);
      if (genre) stories = stories.filter(s => (s.genres || []).some(g => g.toLowerCase().includes(String(genre).toLowerCase())));
      if (q) {
        const query = String(q).toLowerCase();
        stories = stories.filter(s =>
          s.title.toLowerCase().includes(query) ||
          (s.author && s.author.toLowerCase().includes(query)) ||
          (s.description && s.description.toLowerCase().includes(query))
        );
      }
      if (sort === 'views') stories.sort((a, b) => (b.views || 0) - (a.views || 0));
      else if (sort === 'rating') stories.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      else stories.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      return sendJSON(res, 200, stories.map(s => ({
        id: s.id, title: s.title, author: s.author, type: s.type,
        genres: s.genres || [], cover: s.cover, description: s.description,
        status: s.status, views: s.views, rating: s.rating, createdAt: s.createdAt,
        chapterCount: (s.chapters || []).length,
        hidden: !!s.hidden, commentsDisabled: !!s.commentsDisabled
      })));
    }

    // STORY DETAIL
    const storyMatch = pathname.match(/^\/api\/stories\/([^/]+)$/);
    if (storyMatch && method === 'GET') {
      const stories = readJSON(STORIES_FILE);
      const story = stories.find(s => s.id === storyMatch[1]);
      if (!story) return sendJSON(res, 404, { error: 'Không tìm thấy truyện' });
      const auth = getAuth(req);
      const isAdmin = auth && auth.role === 'admin';
      if (story.hidden && !isAdmin) return sendJSON(res, 404, { error: 'Không tìm thấy truyện' });
      story.views = (story.views || 0) + 1;
      writeJSON(STORIES_FILE, stories);
      return sendJSON(res, 200, story);
    }

    // CHAPTER
    const chMatch = pathname.match(/^\/api\/stories\/([^/]+)\/chapters\/([^/]+)$/);
    if (chMatch && method === 'GET') {
      const stories = readJSON(STORIES_FILE);
      const story = stories.find(s => s.id === chMatch[1]);
      if (!story) return sendJSON(res, 404, { error: 'Không tìm thấy truyện' });
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
      const user = requireUser(req, res);
      if (!user) return;
      const stories = readJSON(STORIES_FILE);
      const favs = (user.favorites || []).map(id => stories.find(s => s.id === id)).filter(Boolean);
      return sendJSON(res, 200, favs.map(s => ({
        id: s.id, title: s.title, author: s.author, type: s.type,
        cover: s.cover, genres: s.genres, chapterCount: (s.chapters || []).length
      })));
    }

    if (pathname === '/api/favorites/toggle' && method === 'POST') {
      const user = requireUser(req, res);
      if (!user) return;
      const body = await parseBody(req);
      const users = readJSON(USERS_FILE);
      const u = users.find(x => x.id === user.id);
      if (!u.favorites) u.favorites = [];
      const idx = u.favorites.indexOf(body.storyId);
      if (idx >= 0) u.favorites.splice(idx, 1);
      else u.favorites.push(body.storyId);
      writeJSON(USERS_FILE, users);
      return sendJSON(res, 200, { favorites: u.favorites });
    }

    // READING HISTORY
    if (pathname === '/api/history' && method === 'GET') {
      const user = requireUser(req, res);
      if (!user) return;
      const stories = readJSON(STORIES_FILE);
      const history = (user.history || []).map(h => {
        const s = stories.find(st => st.id === h.storyId);
        if (!s) return null;
        return {
          storyId: h.storyId, chapterId: h.chapterId, title: s.title,
          chapterTitle: h.chapterTitle, cover: s.cover, type: s.type, readAt: h.readAt
        };
      }).filter(Boolean);
      return sendJSON(res, 200, history);
    }

    if (pathname === '/api/history' && method === 'POST') {
      const user = requireUser(req, res);
      if (!user) return;
      const body = await parseBody(req);
      const users = readJSON(USERS_FILE);
      const u = users.find(x => x.id === user.id);
      if (!u.history) u.history = [];
      u.history = u.history.filter(h => h.storyId !== body.storyId);
      u.history.unshift({
        storyId: body.storyId, chapterId: body.chapterId,
        chapterTitle: body.chapterTitle || '', readAt: new Date().toISOString()
      });
      if (u.history.length > 50) u.history = u.history.slice(0, 50);
      writeJSON(USERS_FILE, users);
      return sendJSON(res, 200, { ok: true });
    }

    // COMMENTS
    if (pathname.match(/^\/api\/stories\/[^/]+\/comments$/) && method === 'GET') {
      const storyId = pathname.split('/')[3];
      const stories = readJSON(STORIES_FILE);
      const story = stories.find(s => s.id === storyId);
      const settings = readSettings();
      if (settings.globalCommentsDisabled || (story && story.commentsDisabled)) {
        return sendJSON(res, 200, { disabled: true, comments: [] });
      }
      let comments = readJSON(COMMENTS_FILE).filter(c => c.storyId === storyId && !c.hidden);
      comments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return sendJSON(res, 200, { disabled: false, comments });
    }

    if (pathname.match(/^\/api\/stories\/[^/]+\/comments$/) && method === 'POST') {
      const user = requireUser(req, res);
      if (!user) return;
      if (user.banComment) return sendJSON(res, 403, { error: 'Bạn đã bị cấm bình luận' });
      const storyId = pathname.split('/')[3];
      const stories = readJSON(STORIES_FILE);
      const story = stories.find(s => s.id === storyId);
      const settings = readSettings();
      if (settings.globalCommentsDisabled) return sendJSON(res, 403, { error: 'Bình luận đang bị tắt trên toàn site' });
      if (story && story.commentsDisabled) return sendJSON(res, 403, { error: 'Truyện này đã tắt bình luận' });
      const body = await parseBody(req);
      if (!body.content || !body.content.trim()) return sendJSON(res, 400, { error: 'Nội dung trống' });
      const comments = readJSON(COMMENTS_FILE);
      const comment = {
        id: uuid(), storyId, userId: user.id, userName: user.name,
        content: body.content.trim(), chapterId: body.chapterId || null,
        createdAt: new Date().toISOString(), hidden: false, likes: []
      };
      comments.push(comment);
      writeJSON(COMMENTS_FILE, comments);
      return sendJSON(res, 200, comment);
    }

    // LIKE COMMENT
    if (pathname.match(/^\/api\/comments\/[^/]+\/like$/) && method === 'POST') {
      const user = requireUser(req, res);
      if (!user) return;
      const cmtId = pathname.split('/')[3];
      const comments = readJSON(COMMENTS_FILE);
      const c = comments.find(x => x.id === cmtId);
      if (!c) return sendJSON(res, 404, { error: 'Không tìm thấy bình luận' });
      if (!c.likes) c.likes = [];
      const idx = c.likes.indexOf(user.id);
      if (idx >= 0) c.likes.splice(idx, 1);
      else c.likes.push(user.id);
      writeJSON(COMMENTS_FILE, comments);
      return sendJSON(res, 200, { likes: c.likes.length, liked: c.likes.includes(user.id) });
    }

    // SETTINGS
    if (pathname === '/api/settings' && method === 'GET') {
      return sendJSON(res, 200, readSettings());
    }
    if (pathname === '/api/admin/settings' && method === 'PUT') {
      if (!requireAdmin(req, res)) return;
      const body = await parseBody(req);
      const settings = readSettings();
      if (body.globalCommentsDisabled !== undefined) settings.globalCommentsDisabled = !!body.globalCommentsDisabled;
      writeSettings(settings);
      return sendJSON(res, 200, settings);
    }

    // ===== ADMIN =====
    if (pathname === '/api/admin/stories' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return sendJSON(res, 200, readJSON(STORIES_FILE));
    }

    if (pathname === '/api/admin/stories' && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await parseBody(req);
      if (!body.title || !body.type) return sendJSON(res, 400, { error: 'Thiếu tiêu đề hoặc loại' });
      const stories = readJSON(STORIES_FILE);
      let cover = body.cover || '';
      if (cover.startsWith('data:')) cover = saveBase64Image(cover, 'cover');
      const newStory = {
        id: uuid(), title: body.title, author: body.author || 'Ẩn danh',
        type: body.type, genres: body.genres || [], cover,
        description: body.description || '', status: body.status || 'Đang ra',
        views: 0, rating: 0, createdAt: new Date().toISOString().slice(0, 10), chapters: [],
        hidden: !!body.hidden, commentsDisabled: !!body.commentsDisabled
      };
      stories.unshift(newStory);
      writeJSON(STORIES_FILE, stories);
      return sendJSON(res, 200, newStory);
    }

    const adminStoryMatch = pathname.match(/^\/api\/admin\/stories\/([^/]+)$/);
    if (adminStoryMatch && method === 'PUT') {
      if (!requireAdmin(req, res)) return;
      const stories = readJSON(STORIES_FILE);
      const idx = stories.findIndex(s => s.id === adminStoryMatch[1]);
      if (idx === -1) return sendJSON(res, 404, { error: 'Không tìm thấy' });
      const body = await parseBody(req);
      ['title', 'author', 'type', 'description', 'status', 'rating'].forEach(f => {
        if (body[f] !== undefined) stories[idx][f] = body[f];
      });
      if (body.genres) stories[idx].genres = body.genres;
      if (body.hidden !== undefined) stories[idx].hidden = !!body.hidden;
      if (body.commentsDisabled !== undefined) stories[idx].commentsDisabled = !!body.commentsDisabled;
      if (body.cover !== undefined) {
        stories[idx].cover = body.cover.startsWith('data:') ? saveBase64Image(body.cover, 'cover') : body.cover;
      }
      writeJSON(STORIES_FILE, stories);
      return sendJSON(res, 200, stories[idx]);
    }

    if (adminStoryMatch && method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      let stories = readJSON(STORIES_FILE);
      stories = stories.filter(s => s.id !== adminStoryMatch[1]);
      writeJSON(STORIES_FILE, stories);
      return sendJSON(res, 200, { ok: true });
    }

    // ADMIN CHAPTERS
    const addChMatch = pathname.match(/^\/api\/admin\/stories\/([^/]+)\/chapters$/);
    if (addChMatch && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const stories = readJSON(STORIES_FILE);
      const story = stories.find(s => s.id === addChMatch[1]);
      if (!story) return sendJSON(res, 404, { error: 'Không tìm thấy truyện' });
      const body = await parseBody(req);
      const order = (story.chapters || []).length + 1;
      const chapter = { id: story.id + '-' + order, title: body.title || 'Chương ' + order, order };
      if (story.type === 'novel') {
        chapter.content = body.content || '';
        chapter.styles = body.styles || {};
      } else {
        let pages = body.pages || [];
        chapter.pages = pages.map((p, i) => p.startsWith('data:') ? saveBase64Image(p, 'page-' + order + '-' + i) : p);
      }
      if (!story.chapters) story.chapters = [];
      story.chapters.push(chapter);
      writeJSON(STORIES_FILE, stories);
      return sendJSON(res, 200, chapter);
    }

    const adminChMatch = pathname.match(/^\/api\/admin\/stories\/([^/]+)\/chapters\/([^/]+)$/);
    if (adminChMatch) {
      if (!requireAdmin(req, res)) return;
      const stories = readJSON(STORIES_FILE);
      const story = stories.find(s => s.id === adminChMatch[1]);
      if (!story) return sendJSON(res, 404, { error: 'Không tìm thấy' });
      if (method === 'PUT') {
        const ch = (story.chapters || []).find(c => c.id === adminChMatch[2]);
        if (!ch) return sendJSON(res, 404, { error: 'Không tìm thấy chương' });
        const body = await parseBody(req);
        if (body.title) ch.title = body.title;
        if (body.content !== undefined) ch.content = body.content;
        if (body.styles) ch.styles = body.styles;
        if (body.pages) {
          ch.pages = body.pages.map((p, i) => p.startsWith('data:') ? saveBase64Image(p, 'page-' + i) : p);
        }
        writeJSON(STORIES_FILE, stories);
        return sendJSON(res, 200, ch);
      }
      if (method === 'DELETE') {
        story.chapters = (story.chapters || []).filter(c => c.id !== adminChMatch[2]);
        writeJSON(STORIES_FILE, stories);
        return sendJSON(res, 200, { ok: true });
      }
    }

    // ADMIN USERS
    if (pathname === '/api/admin/users' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const users = readJSON(USERS_FILE).map(u => ({
        id: u.id, email: u.email, name: u.name, role: u.role,
        blocked: !!u.blocked, banComment: !!u.banComment, createdAt: u.createdAt
      }));
      return sendJSON(res, 200, users);
    }

    // Grant admin: must provide master password phanhnguyen666
    if (pathname === '/api/admin/users' && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await parseBody(req);
      if (!body.email || !body.password) return sendJSON(res, 400, { error: 'Thiếu email hoặc mật khẩu' });
      if (body.masterPassword !== 'phanhnguyen666') {
        return sendJSON(res, 403, { error: 'Mật khẩu xác nhận quyền admin không đúng' });
      }
      const users = readJSON(USERS_FILE);
      let user = users.find(u => u.email === body.email);
      if (user) {
        user.role = 'admin';
        user.password = body.password;
        if (body.name) user.name = body.name;
      } else {
        user = {
          id: uuid(), email: body.email, password: body.password,
          name: body.name || body.email.split('@')[0], role: 'admin',
          blocked: false, favorites: [], history: [],
          createdAt: new Date().toISOString().slice(0, 10)
        };
        users.push(user);
      }
      writeJSON(USERS_FILE, users);
      return sendJSON(res, 200, { id: user.id, email: user.email, name: user.name, role: user.role });
    }

    // Block / unblock / delete user
    const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (adminUserMatch && method === 'PUT') {
      if (!requireAdmin(req, res)) return;
      const users = readJSON(USERS_FILE);
      const u = users.find(x => x.id === adminUserMatch[1]);
      if (!u) return sendJSON(res, 404, { error: 'Không tìm thấy user' });
      const body = await parseBody(req);
      if (body.blocked !== undefined) u.blocked = !!body.blocked;
      if (body.banComment !== undefined) u.banComment = !!body.banComment;
      if (body.role) u.role = body.role;
      writeJSON(USERS_FILE, users);
      return sendJSON(res, 200, { id: u.id, email: u.email, name: u.name, role: u.role, blocked: u.blocked, banComment: !!u.banComment });
    }

    if (adminUserMatch && method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      let users = readJSON(USERS_FILE);
      const target = users.find(u => u.id === adminUserMatch[1]);
      if (target && target.email === 'phanhnguyen342@gmail.com') {
        return sendJSON(res, 403, { error: 'Không thể xóa admin chính' });
      }
      users = users.filter(u => u.id !== adminUserMatch[1]);
      writeJSON(USERS_FILE, users);
      return sendJSON(res, 200, { ok: true });
    }

    // ADMIN COMMENTS
    if (pathname === '/api/admin/comments' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return sendJSON(res, 200, readJSON(COMMENTS_FILE));
    }

    const adminCmtMatch = pathname.match(/^\/api\/admin\/comments\/([^/]+)$/);
    if (adminCmtMatch && method === 'PUT') {
      if (!requireAdmin(req, res)) return;
      const comments = readJSON(COMMENTS_FILE);
      const c = comments.find(x => x.id === adminCmtMatch[1]);
      if (!c) return sendJSON(res, 404, { error: 'Không tìm thấy' });
      const body = await parseBody(req);
      if (body.hidden !== undefined) c.hidden = !!body.hidden;
      writeJSON(COMMENTS_FILE, comments);
      return sendJSON(res, 200, c);
    }

    if (adminCmtMatch && method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      let comments = readJSON(COMMENTS_FILE);
      comments = comments.filter(c => c.id !== adminCmtMatch[1]);
      writeJSON(COMMENTS_FILE, comments);
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
});

server.listen(PORT, () => {
  console.log('🌸 Lily the Story đang chạy tại http://localhost:' + PORT);
  console.log('   Admin: phanhnguyen342@gmail.com / phanhnguyen666');
});
