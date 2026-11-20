// Lily the Story - Frontend (full features)
const API = '';
let state = {
  user: null,
  token: localStorage.getItem('lily_token') || null,
  page: 'home',
  stories: [],
  currentStory: null,
  currentChapter: null,
  adminTab: 'stories',
  search: '',
  filterType: '',
  filterGenre: '',
  sort: 'newest',
  genres: []
};

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers['x-auth-token'] = state.token;
  const res = await fetch(API + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Lỗi kết nối');
  return data;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function checkAuth() {
  if (!state.token) return;
  try {
    const { user } = await api('/api/me');
    state.user = user;
  } catch {
    state.token = null;
    localStorage.removeItem('lily_token');
  }
}

async function doLogin(email, password) {
  const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('lily_token', data.token);
}

async function doRegister(name, email, password) {
  const data = await api('/api/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('lily_token', data.token);
}

function logout() {
  if (state.token) api('/api/logout', { method: 'POST' }).catch(() => {});
  state.token = null;
  state.user = null;
  localStorage.removeItem('lily_token');
  navigate('home');
}

function navigate(page, params = {}) {
  state.page = page;
  Object.assign(state, params);
  window.scrollTo(0, 0);
  render();
  const urls = {
    home: '/', story: state.currentStory ? '/story/' + state.currentStory : '/',
    read: state.currentStory && state.currentChapter ? '/read/' + state.currentStory + '/' + state.currentChapter : '/',
    login: '/login', register: '/register', admin: '/admin',
    favorites: '/favorites', history: '/history'
  };
  history.pushState(null, '', urls[page] || '/');
}

window.addEventListener('popstate', () => { parseRoute(); render(); });

function parseRoute() {
  const path = location.pathname;
  if (path === '/login') state.page = 'login';
  else if (path === '/register') state.page = 'register';
  else if (path === '/admin' || path.startsWith('/admin')) state.page = 'admin';
  else if (path === '/favorites') state.page = 'favorites';
  else if (path === '/history') state.page = 'history';
  else if (path.startsWith('/story/')) { state.page = 'story'; state.currentStory = path.split('/')[2]; }
  else if (path.startsWith('/read/')) {
    state.page = 'read';
    const p = path.split('/');
    state.currentStory = p[2];
    state.currentChapter = p[3];
  } else state.page = 'home';
}

function render() {
  const app = document.getElementById('app');
  if (state.page === 'login') { app.innerHTML = renderLogin(); return; }
  if (state.page === 'register') { app.innerHTML = renderRegister(); return; }
  if (state.page === 'admin') {
    if (!state.user || state.user.role !== 'admin') { navigate('login'); return; }
    app.innerHTML = renderHeader() + renderAdmin();
    afterRender();
    return;
  }
  app.innerHTML = renderHeader() + '<main class="container">' + renderPage() + '</main>' + renderFooter();
  afterRender();
}

function afterRender() {
  if (state.page === 'home') setTimeout(loadStories, 20);
  if (state.page === 'story') setTimeout(loadStoryDetail, 20);
  if (state.page === 'read') setTimeout(loadReader, 20);
  if (state.page === 'favorites') setTimeout(loadFavorites, 20);
  if (state.page === 'history') setTimeout(loadHistory, 20);
  if (state.page === 'admin') {
    if (state.adminTab === 'stories') setTimeout(loadAdminStories, 20);
    if (state.adminTab === 'users') setTimeout(loadAdminUsers, 20);
    if (state.adminTab === 'comments') setTimeout(loadAdminComments, 20);
    if (state.adminTab === 'settings') setTimeout(loadAdminSettings, 20);
  }
}

function renderHeader() {
  const isAdmin = state.user && state.user.role === 'admin';
  const isUser = !!state.user;
  return `<header class="header">
    <div class="logo-area" onclick="navigate('home')">
      <img src="/images/logo.png" alt="Lily" />
      <div class="logo-text">Lily <span>the story</span></div>
    </div>
    <nav class="nav">
      <a href="#" onclick="navigate('home');return false;">Trang chủ</a>
      <a href="#" onclick="state.filterType='novel';navigate('home');return false;">Tiểu thuyết</a>
      <a href="#" onclick="state.filterType='comic';navigate('home');return false;">Truyện tranh</a>
      ${isUser ? `
        <a href="#" onclick="navigate('favorites');return false;">Yêu thích</a>
        <a href="#" onclick="navigate('history');return false;">Lịch sử</a>
        ${isAdmin ? `<a href="#" onclick="navigate('admin');return false;">Admin</a>` : ''}
        <button onclick="logout()">Đăng xuất (${escapeHtml(state.user.name)})</button>
      ` : `
        <a href="#" onclick="navigate('login');return false;">Đăng nhập</a>
        <a href="#" onclick="navigate('register');return false;">Đăng ký</a>
      `}
    </nav>
    <button class="menu-toggle" onclick="document.querySelector('.nav').classList.toggle('open')" aria-label="Menu">☰</button>
  </header>`;
}

function renderFooter() {
  return `<footer class="footer">© 2026 Lily the Story · Đoá linh lan và những câu chuyện</footer>`;
}

function renderPage() {
  if (state.page === 'story') return '<div id="storyDetail"><div class="empty-state">Đang tải...</div></div>';
  if (state.page === 'read') return '<div id="readerArea"><div class="empty-state">Đang tải chương...</div></div>';
  if (state.page === 'favorites') return '<div id="favArea"><div class="empty-state">Đang tải...</div></div>';
  if (state.page === 'history') return '<div id="histArea"><div class="empty-state">Đang tải...</div></div>';
  return renderHome();
}

function renderHome() {
  return `<section class="hero">
    <h1>Lily the Story</h1>
    <p>Hãy để đoá linh lan kể bạn nghe một câu chuyện</p>
    <div class="search-bar">
      <input type="text" id="searchInput" placeholder="Tìm truyện, tác giả..." value="${escapeHtml(state.search)}"
        onkeydown="if(event.key==='Enter')doSearch()" />
      <button onclick="doSearch()">Tìm</button>
    </div>
  </section>
  <div class="filters">
    <select id="filterType" onchange="applyFilters()">
      <option value="">Tất cả loại</option>
      <option value="novel" ${state.filterType==='novel'?'selected':''}>Tiểu thuyết</option>
      <option value="comic" ${state.filterType==='comic'?'selected':''}>Truyện tranh</option>
    </select>
    <select id="filterGenre" onchange="applyFilters()">
      <option value="">Tất cả thể loại</option>
      ${(state.genres||[]).map(g => `<option value="${escapeHtml(g)}" ${state.filterGenre===g?'selected':''}>${escapeHtml(g)}</option>`).join('')}
    </select>
    <select id="sort" onchange="applyFilters()">
      <option value="newest" ${state.sort==='newest'?'selected':''}>Mới nhất</option>
      <option value="views" ${state.sort==='views'?'selected':''}>Lượt xem</option>
      <option value="rating" ${state.sort==='rating'?'selected':''}>Đánh giá</option>
    </select>
  </div>
  <div id="storyList" class="story-grid"><div class="empty-state">Đang tải...</div></div>`;
}

async function loadStories() {
  try {
    if (!state.genres.length) {
      state.genres = await api('/api/genres');
      const sel = document.getElementById('filterGenre');
      if (sel && sel.options.length <= 1) {
        state.genres.forEach(g => {
          const o = document.createElement('option');
          o.value = g; o.textContent = g;
          if (state.filterGenre === g) o.selected = true;
          sel.appendChild(o);
        });
      }
    }
    const params = new URLSearchParams();
    if (state.filterType) params.set('type', state.filterType);
    if (state.filterGenre) params.set('genre', state.filterGenre);
    if (state.search) params.set('q', state.search);
    if (state.sort) params.set('sort', state.sort);
    const stories = await api('/api/stories?' + params);
    state.stories = stories;
    const el = document.getElementById('storyList');
    if (!el) return;
    if (!stories.length) { el.innerHTML = '<div class="empty-state">Không tìm thấy truyện nào</div>'; return; }
    el.innerHTML = stories.map(s => `
      <div class="story-card" onclick="openStory('${s.id}')">
        <div class="cover">
          <span class="badge">${s.type === 'comic' ? 'Truyện tranh' : 'Tiểu thuyết'}</span>
          ${s.cover ? `<img src="${s.cover}" alt="" onerror="this.style.display='none'" />` : '<span class="cover-placeholder">📖</span>'}
        </div>
        <div class="info">
          <h3>${escapeHtml(s.title)}</h3>
          <div class="meta">
            <span>${escapeHtml(s.author || '')}</span>
            <span>👁 ${s.views || 0}</span>
            <span>⭐ ${s.rating || 0}</span>
          </div>
          <div class="tags">${(s.genres||[]).slice(0,3).map(g=>`<span class="tag">${escapeHtml(g)}</span>`).join('')}</div>
        </div>
      </div>`).join('');
  } catch (e) {
    const el = document.getElementById('storyList');
    if (el) el.innerHTML = `<div class="empty-state">Lỗi: ${escapeHtml(e.message)}</div>`;
  }
}

function doSearch() {
  state.search = (document.getElementById('searchInput') || {}).value || '';
  loadStories();
}
function applyFilters() {
  state.filterType = (document.getElementById('filterType') || {}).value || '';
  state.filterGenre = (document.getElementById('filterGenre') || {}).value || '';
  state.sort = (document.getElementById('sort') || {}).value || 'newest';
  loadStories();
}
function openStory(id) { state.currentStory = id; navigate('story'); }

async function loadStoryDetail() {
  try {
    const story = await api('/api/stories/' + state.currentStory);
    const el = document.getElementById('storyDetail');
    if (!el) return;
    const isFav = state.user && (state.user.favorites || []).includes(story.id);
    const chaptersHtml = (story.chapters || []).map(c =>
      `<li onclick="openChapter('${story.id}','${c.id}')"><span>${escapeHtml(c.title)}</span><span>→</span></li>`
    ).join('') || '<li class="empty-ch">Chưa có chương</li>';

    el.innerHTML = `
      <div class="story-detail">
        <div class="cover-large">
          ${story.cover ? `<img src="${story.cover}" alt="" />` : '<span class="cover-placeholder">📖</span>'}
        </div>
        <div>
          <span class="badge-type ${story.type==='comic'?'badge-comic':'badge-novel'}">${story.type==='comic'?'Truyện tranh':'Tiểu thuyết'}</span>
          <h1>${escapeHtml(story.title)}</h1>
          <p><strong>Tác giả:</strong> ${escapeHtml(story.author || 'Ẩn danh')}</p>
          <p><strong>Thể loại:</strong> ${(story.genres||[]).map(g=>escapeHtml(g)).join(', ') || ''} · <strong>Trạng thái:</strong> ${escapeHtml(story.status||'')}</p>
          <p>👁 ${story.views||0} lượt xem · ⭐ ${story.rating||0}</p>
          <p class="mt-2 desc">${escapeHtml(story.description||'')}</p>
          <div class="story-actions mt-2">
            ${state.user ? `<button class="btn ${isFav?'btn-primary':'btn-outline'}" onclick="toggleFav('${story.id}')">${isFav?'♥ Đã yêu thích':'♡ Yêu thích'}</button>` : ''}
            ${(story.chapters||[]).length ? `<button class="btn btn-primary" onclick="openChapter('${story.id}','${story.chapters[0].id}')">Đọc ngay</button>` : ''}
          </div>
          <h3 class="mt-2">Danh sách chương (${(story.chapters||[]).length})</h3>
          <ul class="chapter-list">${chaptersHtml}</ul>
          <div class="comments-section mt-2">
            <h3>Bình luận</h3>
            <div id="commentsList"><div class="empty-state">Đang tải...</div></div>
            ${state.user ? `
              <div class="comment-form mt-1">
                <textarea id="commentInput" placeholder="Viết bình luận..." rows="3"></textarea>
                <button class="btn btn-primary btn-sm mt-1" onclick="postComment('${story.id}')">Gửi</button>
              </div>` : '<p class="hint">Đăng nhập để bình luận</p>'}
          </div>
          <div class="mt-2"><button class="btn btn-outline" onclick="navigate('home')">← Quay lại</button></div>
        </div>
      </div>`;
    loadComments(story.id);
  } catch (e) {
    const el = document.getElementById('storyDetail');
    if (el) el.innerHTML = `<div class="empty-state">Lỗi: ${escapeHtml(e.message)}</div>`;
  }
}

async function toggleFav(storyId) {
  if (!state.user) { navigate('login'); return; }
  try {
    const data = await api('/api/favorites/toggle', { method: 'POST', body: JSON.stringify({ storyId }) });
    state.user.favorites = data.favorites;
    loadStoryDetail();
  } catch (e) { alert(e.message); }
}

async function loadComments(storyId) {
  try {
    const data = await api('/api/stories/' + storyId + '/comments');
    const el = document.getElementById('commentsList');
    if (!el) return;
    if (data.disabled) {
      el.innerHTML = '<p class="hint">Bình luận đang bị tắt</p>';
      const form = document.querySelector('.comment-form');
      if (form) form.style.display = 'none';
      return;
    }
    const comments = data.comments || data || [];
    if (!comments.length) { el.innerHTML = '<p class="hint">Chưa có bình luận</p>'; return; }
    const uid = state.user ? state.user.id : null;
    el.innerHTML = comments.map(c => {
      const likes = c.likes || [];
      const liked = uid && likes.includes(uid);
      return `<div class="comment-item">
        <strong>${escapeHtml(c.userName)}</strong>
        <span class="cmt-time">${new Date(c.createdAt).toLocaleString('vi-VN')}</span>
        <p>${escapeHtml(c.content)}</p>
        <button class="btn-like ${liked?'liked':''}" onclick="likeComment('${c.id}', this)" ${!state.user?'disabled':''}>
          ♥ <span class="like-count">${likes.length}</span>
        </button>
      </div>`;
    }).join('');
  } catch { /* ignore */ }
}

async function likeComment(id, btn) {
  if (!state.user) { navigate('login'); return; }
  try {
    const data = await api('/api/comments/' + id + '/like', { method: 'POST', body: '{}' });
    const countEl = btn.querySelector('.like-count');
    if (countEl) countEl.textContent = data.likes;
    btn.classList.toggle('liked', data.liked);
  } catch (e) { alert(e.message); }
}

async function postComment(storyId) {
  const input = document.getElementById('commentInput');
  if (!input || !input.value.trim()) return;
  try {
    await api('/api/stories/' + storyId + '/comments', {
      method: 'POST', body: JSON.stringify({ content: input.value.trim() })
    });
    input.value = '';
    loadComments(storyId);
  } catch (e) { alert(e.message); }
}

function openChapter(storyId, chapterId) {
  state.currentStory = storyId;
  state.currentChapter = chapterId;
  navigate('read');
}

async function loadReader() {
  try {
    const data = await api(`/api/stories/${state.currentStory}/chapters/${state.currentChapter}`);
    const { story, chapter, prevChapter, nextChapter, chapters } = data;
    const el = document.getElementById('readerArea');
    if (!el) return;

    // Save history
    if (state.user) {
      api('/api/history', {
        method: 'POST',
        body: JSON.stringify({ storyId: story.id, chapterId: chapter.id, chapterTitle: chapter.title })
      }).catch(() => {});
    }

    let contentHtml = '';
    if (story.type === 'comic') {
      const pages = chapter.pages || [];
      contentHtml = pages.length
        ? pages.map(p => `<img src="${p}" alt="Trang" loading="lazy" class="comic-page" />`).join('')
        : '<p class="hint">Chương này chưa có trang ảnh</p>';
    } else {
      const styles = chapter.styles || {};
      const styleStr = [
        styles.fontFamily ? `font-family:${styles.fontFamily}` : '',
        styles.fontSize ? `font-size:${styles.fontSize}` : '',
        styles.color ? `color:${styles.color}` : '',
        styles.lineHeight ? `line-height:${styles.lineHeight}` : ''
      ].filter(Boolean).join(';');
      contentHtml = `<div class="reader-content" style="${styleStr}">${escapeHtml(chapter.content || '').replace(/\n/g, '<br>')}</div>`;
    }

    const chapterOptions = (chapters || []).map(c =>
      `<option value="${c.id}" ${c.id===chapter.id?'selected':''}>${escapeHtml(c.title)}</option>`
    ).join('');

    el.innerHTML = `
      <div class="reader ${story.type==='comic'?'comic':''}">
        <div class="reader-top">
          <button class="btn btn-outline btn-sm" onclick="openStory('${story.id}')">← Về truyện</button>
          <h2 class="reader-title">${escapeHtml(story.title)}</h2>
          <select class="chapter-select" onchange="openChapter('${story.id}', this.value)">
            ${chapterOptions}
          </select>
        </div>
        <h3 class="chapter-title">${escapeHtml(chapter.title)}</h3>
        ${contentHtml}
        <div class="reader-nav">
          ${prevChapter
            ? `<button class="btn btn-outline" onclick="openChapter('${story.id}','${prevChapter.id}')">← Chương trước</button>`
            : `<button class="btn btn-outline" disabled>← Chương trước</button>`}
          <button class="btn btn-outline" onclick="toggleChapterList()">Danh sách chương</button>
          ${nextChapter
            ? `<button class="btn btn-primary" onclick="openChapter('${story.id}','${nextChapter.id}')">Chương sau →</button>`
            : `<button class="btn btn-primary" disabled>Chương sau →</button>`}
        </div>
        <div id="chapterListPanel" class="chapter-list-panel hidden">
          <h4>Danh sách chương</h4>
          <ul class="chapter-list">
            ${(chapters||[]).map(c => `
              <li class="${c.id===chapter.id?'active':''}" onclick="openChapter('${story.id}','${c.id}')">
                ${escapeHtml(c.title)}
              </li>`).join('')}
          </ul>
        </div>
      </div>`;
  } catch (e) {
    const el = document.getElementById('readerArea');
    if (el) el.innerHTML = `<div class="empty-state">Lỗi: ${escapeHtml(e.message)}</div>`;
  }
}

function toggleChapterList() {
  const panel = document.getElementById('chapterListPanel');
  if (panel) panel.classList.toggle('hidden');
}

// Favorites & History
async function loadFavorites() {
  if (!state.user) { navigate('login'); return; }
  try {
    const list = await api('/api/favorites');
    const el = document.getElementById('favArea');
    if (!el) return;
    el.innerHTML = `<h2>Truyện yêu thích</h2>` + (list.length ? `<div class="story-grid">${list.map(s => `
      <div class="story-card" onclick="openStory('${s.id}')">
        <div class="cover">${s.cover?`<img src="${s.cover}" alt=""/>`:'📖'}</div>
        <div class="info"><h3>${escapeHtml(s.title)}</h3><div class="meta">${escapeHtml(s.author||'')}</div></div>
      </div>`).join('')}</div>` : '<div class="empty-state">Chưa có truyện yêu thích</div>');
  } catch (e) {
    const el = document.getElementById('favArea');
    if (el) el.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`;
  }
}

async function loadHistory() {
  if (!state.user) { navigate('login'); return; }
  try {
    const list = await api('/api/history');
    const el = document.getElementById('histArea');
    if (!el) return;
    el.innerHTML = `<h2>Lịch sử đọc</h2>` + (list.length ? `<ul class="history-list">${list.map(h => `
      <li onclick="openChapter('${h.storyId}','${h.chapterId}')">
        <strong>${escapeHtml(h.title)}</strong> · ${escapeHtml(h.chapterTitle||'')}
        <span class="cmt-time">${h.readAt ? new Date(h.readAt).toLocaleString('vi-VN') : ''}</span>
      </li>`).join('')}</ul>` : '<div class="empty-state">Chưa có lịch sử đọc</div>');
  } catch (e) {
    const el = document.getElementById('histArea');
    if (el) el.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`;
  }
}

// Auth pages
function renderLogin() {
  return `<div class="login-page"><div class="login-box">
    <img src="/images/logo.png" alt="Lily" />
    <h2>Đăng nhập</h2>
    <form onsubmit="handleLogin(event)">
      <div class="form-group"><label>Email</label><input type="email" id="loginEmail" required /></div>
      <div class="form-group"><label>Mật khẩu</label><input type="password" id="loginPassword" required /></div>
      <div id="loginError" class="error-msg"></div>
      <button type="submit" class="btn btn-primary" style="width:100%">Đăng nhập</button>
    </form>
    <p class="mt-2">Chưa có tài khoản? <a href="#" onclick="navigate('register');return false;">Đăng ký</a></p>
    <p><a href="#" onclick="navigate('home');return false;">← Về trang chủ</a></p>
  </div></div>`;
}

function renderRegister() {
  return `<div class="login-page"><div class="login-box">
    <img src="/images/logo.png" alt="Lily" />
    <h2>Đăng ký</h2>
    <form onsubmit="handleRegister(event)">
      <div class="form-group"><label>Tên hiển thị</label><input type="text" id="regName" required /></div>
      <div class="form-group"><label>Email</label><input type="email" id="regEmail" required /></div>
      <div class="form-group"><label>Mật khẩu</label><input type="password" id="regPassword" required minlength="6" /></div>
      <div id="regError" class="error-msg"></div>
      <button type="submit" class="btn btn-primary" style="width:100%">Đăng ký</button>
    </form>
    <p class="mt-2">Đã có tài khoản? <a href="#" onclick="navigate('login');return false;">Đăng nhập</a></p>
    <p><a href="#" onclick="navigate('home');return false;">← Về trang chủ</a></p>
  </div></div>`;
}

async function handleLogin(e) {
  e.preventDefault();
  const err = document.getElementById('loginError');
  try {
    await doLogin(document.getElementById('loginEmail').value, document.getElementById('loginPassword').value);
    navigate(state.user.role === 'admin' ? 'admin' : 'home');
  } catch (ex) { err.textContent = ex.message; }
}

async function handleRegister(e) {
  e.preventDefault();
  const err = document.getElementById('regError');
  try {
    await doRegister(
      document.getElementById('regName').value,
      document.getElementById('regEmail').value,
      document.getElementById('regPassword').value
    );
    navigate('home');
  } catch (ex) { err.textContent = ex.message; }
}

// ========== ADMIN ==========
function renderAdmin() {
  const tabs = [
    { id: 'stories', label: 'Quản lý truyện' },
    { id: 'addStory', label: 'Thêm truyện' },
    { id: 'users', label: 'Quản lý User' },
    { id: 'comments', label: 'Bình luận' },
    { id: 'settings', label: 'Cài đặt' }
  ];
  return `<div class="container"><div class="admin-layout">
    <aside class="admin-sidebar">
      <h3>🌸 Admin</h3>
      ${tabs.map(t => `<button class="${state.adminTab===t.id?'active':''}" onclick="state.adminTab='${t.id}';render()">${t.label}</button>`).join('')}
      <button onclick="navigate('home')">Xem dạng User</button>
      <button onclick="logout()">Đăng xuất</button>
    </aside>
    <div class="admin-content" id="adminContent">
      ${state.adminTab === 'addStory' ? renderAddStoryForm() : '<div class="empty-state">Đang tải...</div>'}
    </div>
  </div></div>`;
}

async function loadAdminStories() {
  try {
    const stories = await api('/api/admin/stories');
    const el = document.getElementById('adminContent');
    if (!el || state.adminTab !== 'stories') return;
    window._adminStories = stories;
    el.innerHTML = `<h2>Quản lý truyện (${stories.length})</h2>
      <div class="filters mb-2">
        <input type="text" id="adminStorySearch" placeholder="Tìm truyện theo tên, tác giả..." oninput="filterAdminStories()" style="flex:1;min-width:180px;padding:0.45rem 0.8rem;border:1.5px solid #ccc;border-radius:8px" />
      </div>
      <div id="adminStoryTable"></div>`;
    renderAdminStoryTable(stories);
  } catch (e) {
    const el = document.getElementById('adminContent');
    if (el) el.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`;
  }
}

function filterAdminStories() {
  const q = ((document.getElementById('adminStorySearch') || {}).value || '').toLowerCase();
  const list = (window._adminStories || []).filter(s =>
    !q || s.title.toLowerCase().includes(q) || (s.author || '').toLowerCase().includes(q)
  );
  renderAdminStoryTable(list);
}

function renderAdminStoryTable(stories) {
  const el = document.getElementById('adminStoryTable');
  if (!el) return;
  el.innerHTML = `<table><thead><tr><th>Tiêu đề</th><th>Loại</th><th>Thể loại</th><th>Chương</th><th>Ẩn</th><th>BL</th><th>Hành động</th></tr></thead>
      <tbody>${stories.map(s => `<tr>
        <td>${escapeHtml(s.title)}</td>
        <td><span class="badge-type ${s.type==='comic'?'badge-comic':'badge-novel'}">${s.type==='comic'?'Truyện tranh':'Tiểu thuyết'}</span></td>
        <td>${(s.genres||[]).slice(0,3).map(g=>escapeHtml(g)).join(', ')}</td>
        <td>${(s.chapters||[]).length}</td>
        <td>${s.hidden ? 'Ẩn' : 'Hiện'}</td>
        <td>${s.commentsDisabled ? 'Tắt' : 'Bật'}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="editStory('${s.id}')">Sửa</button>
          <button class="btn btn-sm btn-outline" onclick="manageChapters('${s.id}')">Chương</button>
          <button class="btn btn-sm btn-outline" onclick="toggleStoryHidden('${s.id}', ${!s.hidden})">${s.hidden?'Hiện':'Ẩn'}</button>
          <button class="btn btn-sm btn-outline" onclick="toggleStoryComments('${s.id}', ${!s.commentsDisabled})">${s.commentsDisabled?'Bật BL':'Tắt BL'}</button>
          <button class="btn btn-sm btn-danger" onclick="deleteStory('${s.id}')">Xóa</button>
        </td>
      </tr>`).join('')}</tbody></table>`;
}

async function toggleStoryHidden(id, hidden) {
  try {
    await api('/api/admin/stories/' + id, { method: 'PUT', body: JSON.stringify({ hidden }) });
    loadAdminStories();
  } catch (e) { alert(e.message); }
}

async function toggleStoryComments(id, commentsDisabled) {
  try {
    await api('/api/admin/stories/' + id, { method: 'PUT', body: JSON.stringify({ commentsDisabled }) });
    loadAdminStories();
  } catch (e) { alert(e.message); }
}

function renderAddStoryForm(story) {
  const isEdit = !!story;
  const selectedGenres = story ? (story.genres || []) : [];
  const allGenres = state.genres.length ? state.genres : [
    'Ngôn tình (BG)','Đam mỹ (BL)','Bách hợp (GL)','1x1','NP','Vô CP',
    'Thanh mai trúc mã','Gương vỡ lại lành','Cưới trước yêu sau',
    'Hiện đại','Đô thị','Cổ đại','Học đường','Thanh xuân vườn trường',
    'Hào môn thế gia','Giới giải trí (Showbiz)','Mạt thế',
    'Tiên hiệp','Huyền huyễn','Kiếm hiệp','Khoa học viễn tưởng','Tinh tế',
    'ABO','Điền văn','Vô hạn lưu','Dân quốc',
    'Xuyên không','Xuyên sách','Trùng sinh','Xuyên nhanh','Hệ thống',
    'Cung đấu','Trạch đấu','Vả mặt','Sảng văn','Chữa lành',
    'Livestream','Esport','Đoản văn',
    'Nam cường','Nữ cường','Tổng tài','Bệnh kiều','Sủng','Ngọt','Ngược',
    'Hài hước','Linh dị','Kinh dị','Trinh thám','HE','BE','OE','SE'
  ];
  const genreChecks = allGenres.map(g => `<label class="genre-check"><input type="checkbox" name="genres" value="${escapeHtml(g)}" ${selectedGenres.includes(g)?'checked':''}/> ${escapeHtml(g)}</label>`).join('');

  return `<h2>${isEdit ? 'Sửa truyện' : 'Thêm truyện mới'}</h2>
  <form onsubmit="saveStory(event,'${story?story.id:''}')">
    <div class="form-row">
      <div class="form-group"><label>Tiêu đề *</label><input name="title" required value="${escapeHtml(story?story.title:'')}" /></div>
      <div class="form-group"><label>Tác giả</label><input name="author" value="${escapeHtml(story?story.author:'')}" /></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Loại *</label>
        <select name="type" required>
          <option value="novel" ${story&&story.type==='novel'?'selected':''}>Tiểu thuyết</option>
          <option value="comic" ${story&&story.type==='comic'?'selected':''}>Truyện tranh</option>
        </select>
      </div>
      <div class="form-group"><label>Trạng thái</label>
        <select name="status">
          <option value="Đang ra">Đang ra</option>
          <option value="Hoàn thành">Hoàn thành</option>
          <option value="Tạm dừng">Tạm dừng</option>
        </select>
      </div>
    </div>
    <div class="form-group"><label>Thể loại (chọn nhiều)</label><div class="genre-grid">${genreChecks}</div></div>
    <div class="form-group"><label>Mô tả</label><textarea name="description">${escapeHtml(story?story.description:'')}</textarea></div>
    <div class="form-group">
      <label>Ảnh bìa (tải lên)</label>
      <input type="file" accept="image/*" id="coverFile" onchange="previewCover(this)" />
      <input type="hidden" name="cover" id="coverData" value="${escapeHtml(story?story.cover:'')}" />
      <div id="coverPreview" class="cover-preview">${story&&story.cover?`<img src="${story.cover}" style="max-height:120px"/>`:''}</div>
    </div>
    <div class="form-group">
      <label class="genre-check"><input type="checkbox" name="hidden" id="storyHidden" ${story&&story.hidden?'checked':''}/> Ẩn truyện (không hiện trên trang chủ)</label>
    </div>
    <div class="form-group">
      <label class="genre-check"><input type="checkbox" name="commentsDisabled" id="storyCommentsDisabled" ${story&&story.commentsDisabled?'checked':''}/> Tắt bình luận cho truyện này</label>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-outline" onclick="state.adminTab='stories';render()">Hủy</button>
      <button type="submit" class="btn btn-primary">${isEdit?'Cập nhật':'Thêm truyện'}</button>
    </div>
  </form>`;
}

function previewCover(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('coverData').value = e.target.result;
    document.getElementById('coverPreview').innerHTML = `<img src="${e.target.result}" style="max-height:120px;border-radius:8px"/>`;
  };
  reader.readAsDataURL(file);
}

async function saveStory(e, id) {
  e.preventDefault();
  const form = e.target;
  const genres = Array.from(form.querySelectorAll('input[name="genres"]:checked')).map(c => c.value);
  const body = {
    title: form.title.value, author: form.author.value, type: form.type.value,
    status: form.status.value, description: form.description.value,
    genres, cover: document.getElementById('coverData').value || undefined,
    hidden: !!(document.getElementById('storyHidden') || {}).checked,
    commentsDisabled: !!(document.getElementById('storyCommentsDisabled') || {}).checked
  };
  try {
    if (id) await api('/api/admin/stories/' + id, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/api/admin/stories', { method: 'POST', body: JSON.stringify(body) });
    state.adminTab = 'stories';
    render();
  } catch (err) { alert(err.message); }
}

async function editStory(id) {
  try {
    const stories = await api('/api/admin/stories');
    const story = stories.find(s => s.id === id);
    if (!story) return;
    if (!state.genres.length) state.genres = await api('/api/genres');
    state.adminTab = 'addStory';
    render();
    const el = document.getElementById('adminContent');
    if (el) el.innerHTML = renderAddStoryForm(story);
  } catch (e) { alert(e.message); }
}

async function deleteStory(id) {
  if (!confirm('Xóa truyện này?')) return;
  try { await api('/api/admin/stories/' + id, { method: 'DELETE' }); loadAdminStories(); }
  catch (e) { alert(e.message); }
}

async function manageChapters(storyId) {
  try {
    const stories = await api('/api/admin/stories');
    const story = stories.find(s => s.id === storyId);
    if (!story) return;
    const el = document.getElementById('adminContent');
    el.innerHTML = `<h2>Chương: ${escapeHtml(story.title)}</h2>
      <button class="btn btn-primary mb-2" onclick="showAddChapter('${story.id}','${story.type}')">+ Thêm chương</button>
      <table><thead><tr><th>#</th><th>Tiêu đề</th><th>Hành động</th></tr></thead>
      <tbody>${(story.chapters||[]).map(c => `<tr>
        <td>${c.order}</td><td>${escapeHtml(c.title)}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="editChapter('${story.id}','${c.id}','${story.type}')">Sửa</button>
          <button class="btn btn-sm btn-danger" onclick="deleteChapter('${story.id}','${c.id}')">Xóa</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="3">Chưa có chương</td></tr>'}</tbody></table>
      <button class="btn btn-outline mt-2" onclick="state.adminTab='stories';render()">← Quay lại</button>`;
  } catch (e) { alert(e.message); }
}

function showAddChapter(storyId, type) {
  const el = document.getElementById('adminContent');
  if (type === 'novel') {
    el.innerHTML = `<h2>Thêm chương tiểu thuyết</h2>
      <form onsubmit="saveChapter(event,'${storyId}','novel')">
        <div class="form-group"><label>Tiêu đề chương</label><input name="title" required placeholder="Chương 1: ..." /></div>
        <div class="form-group"><label>Nội dung</label>
          <div class="editor-toolbar">
            <label>Font <select id="fontFamily"><option value="">Mặc định</option><option value="Georgia,serif">Georgia</option><option value="'Times New Roman',serif">Times</option><option value="Arial,sans-serif">Arial</option><option value="'Courier New',monospace">Courier</option></select></label>
            <label>Cỡ <select id="fontSize"><option value="">Mặc định</option><option value="16px">16px</option><option value="18px">18px</option><option value="20px">20px</option><option value="22px">22px</option><option value="24px">24px</option></select></label>
            <label>Màu <input type="color" id="textColor" value="#2c3e2d" /></label>
          </div>
          <textarea name="content" required style="min-height:280px" placeholder="Nhập nội dung chương..."></textarea>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" onclick="manageChapters('${storyId}')">Hủy</button>
          <button type="submit" class="btn btn-primary">Thêm chương</button>
        </div>
      </form>`;
  } else {
    window._comicPages = [];
    el.innerHTML = `<h2>Thêm chương truyện tranh</h2>
      <form onsubmit="saveChapter(event,'${storyId}','comic')">
        <div class="form-group"><label>Tiêu đề chương</label><input name="title" required /></div>
        <div class="form-group">
          <label>Tải ảnh trang (có thể chọn nhiều ảnh)</label>
          <input type="file" accept="image/*" multiple id="pageFiles" onchange="previewPages(this)" />
          <p class="hint">Sau khi tải lên, dùng nút ↑ ↓ để sắp xếp thứ tự trang</p>
          <div id="pagesPreview" class="pages-preview sortable-pages"></div>
          <input type="hidden" id="pagesData" value="[]" />
        </div>
        <p class="hint">Hoặc dán URL ảnh (mỗi dòng 1 URL, sẽ thêm vào cuối danh sách):</p>
        <div class="form-group"><textarea name="pageUrls" rows="3" placeholder="https://..."></textarea></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" onclick="manageChapters('${storyId}')">Hủy</button>
          <button type="submit" class="btn btn-primary">Thêm chương</button>
        </div>
      </form>`;
  }
}

function previewPages(input) {
  const files = Array.from(input.files || []);
  if (!files.length) return;
  if (!window._comicPages) window._comicPages = [];
  let done = 0;
  const startLen = window._comicPages.length;
  files.forEach((file, i) => {
    const reader = new FileReader();
    reader.onload = e => {
      window._comicPages[startLen + i] = e.target.result;
      done++;
      if (done === files.length) {
        // compact
        window._comicPages = window._comicPages.filter(Boolean);
        renderPagesPreview();
      }
    };
    reader.readAsDataURL(file);
  });
}

function renderPagesPreview() {
  const pages = window._comicPages || [];
  document.getElementById('pagesData').value = JSON.stringify(pages);
  const el = document.getElementById('pagesPreview');
  if (!el) return;
  el.innerHTML = pages.map((p, i) => `
    <div class="page-item" data-idx="${i}">
      <img src="${p}" alt="Trang ${i+1}" />
      <div class="page-actions">
        <span class="page-num">#${i+1}</span>
        <button type="button" class="btn btn-sm btn-outline" onclick="movePage(${i},-1)" ${i===0?'disabled':''}>↑</button>
        <button type="button" class="btn btn-sm btn-outline" onclick="movePage(${i},1)" ${i===pages.length-1?'disabled':''}>↓</button>
        <button type="button" class="btn btn-sm btn-danger" onclick="removePage(${i})">Xóa</button>
      </div>
    </div>`).join('');
}

function movePage(idx, dir) {
  const pages = window._comicPages || [];
  const j = idx + dir;
  if (j < 0 || j >= pages.length) return;
  const t = pages[idx]; pages[idx] = pages[j]; pages[j] = t;
  renderPagesPreview();
}

function removePage(idx) {
  window._comicPages.splice(idx, 1);
  renderPagesPreview();
}

async function saveChapter(e, storyId, type) {
  e.preventDefault();
  const form = e.target;
  const body = { title: form.title.value };
  if (type === 'novel') {
    body.content = form.content.value;
    body.styles = {
      fontFamily: (document.getElementById('fontFamily') || {}).value || '',
      fontSize: (document.getElementById('fontSize') || {}).value || '',
      color: (document.getElementById('textColor') || {}).value || ''
    };
  } else {
    let pages = window._comicPages || [];
    try {
      const raw = document.getElementById('pagesData').value || '[]';
      if (!pages.length) pages = JSON.parse(raw);
    } catch {}
    const urls = (form.pageUrls && form.pageUrls.value || '').split('\n').map(s => s.trim()).filter(Boolean);
    body.pages = pages.concat(urls);
  }
  try {
    await api(`/api/admin/stories/${storyId}/chapters`, { method: 'POST', body: JSON.stringify(body) });
    manageChapters(storyId);
  } catch (err) { alert(err.message); }
}

async function editChapter(storyId, chapterId, type) {
  try {
    const data = await api(`/api/stories/${storyId}/chapters/${chapterId}`);
    const ch = data.chapter;
    const el = document.getElementById('adminContent');
    if (type === 'novel') {
      el.innerHTML = `<h2>Sửa chương</h2>
        <form onsubmit="updateChapter(event,'${storyId}','${chapterId}','novel')">
          <div class="form-group"><label>Tiêu đề</label><input name="title" required value="${escapeHtml(ch.title)}" /></div>
          <div class="form-group"><label>Nội dung</label>
            <textarea name="content" style="min-height:280px">${escapeHtml(ch.content||'')}</textarea>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" onclick="manageChapters('${storyId}')">Hủy</button>
            <button type="submit" class="btn btn-primary">Cập nhật</button>
          </div>
        </form>`;
    } else {
      el.innerHTML = `<h2>Sửa chương truyện tranh</h2>
        <form onsubmit="updateChapter(event,'${storyId}','${chapterId}','comic')">
          <div class="form-group"><label>Tiêu đề</label><input name="title" required value="${escapeHtml(ch.title)}" /></div>
          <div class="form-group"><label>URL trang (mỗi dòng 1)</label>
            <textarea name="pages" style="min-height:120px">${(ch.pages||[]).join('\n')}</textarea>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" onclick="manageChapters('${storyId}')">Hủy</button>
            <button type="submit" class="btn btn-primary">Cập nhật</button>
          </div>
        </form>`;
    }
  } catch (e) { alert(e.message); }
}

async function updateChapter(e, storyId, chapterId, type) {
  e.preventDefault();
  const form = e.target;
  const body = { title: form.title.value };
  if (type === 'novel') body.content = form.content.value;
  else body.pages = form.pages.value.split('\n').map(s => s.trim()).filter(Boolean);
  try {
    await api(`/api/admin/stories/${storyId}/chapters/${chapterId}`, { method: 'PUT', body: JSON.stringify(body) });
    manageChapters(storyId);
  } catch (err) { alert(err.message); }
}

async function deleteChapter(storyId, chapterId) {
  if (!confirm('Xóa chương này?')) return;
  try {
    await api(`/api/admin/stories/${storyId}/chapters/${chapterId}`, { method: 'DELETE' });
    manageChapters(storyId);
  } catch (e) { alert(e.message); }
}

async function loadAdminUsers() {
  try {
    const users = await api('/api/admin/users');
    const el = document.getElementById('adminContent');
    if (!el || state.adminTab !== 'users') return;
    window._adminUsers = users;
    el.innerHTML = `<h2>Quản lý User / Admin</h2>
      <button class="btn btn-primary mb-2" onclick="showAddAdmin()">+ Thêm Admin</button>
      <div class="filters mb-2">
        <input type="text" id="adminUserSearch" placeholder="Tìm user theo tên, email..." oninput="filterAdminUsers()" style="flex:1;min-width:180px;padding:0.45rem 0.8rem;border:1.5px solid #ccc;border-radius:8px" />
      </div>
      <div id="adminUserTable"></div>`;
    renderAdminUserTable(users);
  } catch (e) {
    const el = document.getElementById('adminContent');
    if (el) el.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`;
  }
}

function filterAdminUsers() {
  const q = ((document.getElementById('adminUserSearch') || {}).value || '').toLowerCase();
  const list = (window._adminUsers || []).filter(u =>
    !q || (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
  );
  renderAdminUserTable(list);
}

function renderAdminUserTable(users) {
  const el = document.getElementById('adminUserTable');
  if (!el) return;
  el.innerHTML = `<table><thead><tr><th>Tên</th><th>Email</th><th>Vai trò</th><th>Trạng thái</th><th>Bình luận</th><th>Hành động</th></tr></thead>
      <tbody>${users.map(u => `<tr>
        <td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td><td>${u.role}</td>
        <td>${u.blocked ? '<span style="color:red">Bị khóa</span>' : 'Hoạt động'}</td>
        <td>${u.banComment ? '<span style="color:red">Cấm BL</span>' : 'Cho phép'}</td>
        <td>
          ${u.email !== 'phanhnguyen342@gmail.com' ? `
            <button class="btn btn-sm btn-outline" onclick="toggleBlock('${u.id}',${!u.blocked})">${u.blocked?'Mở khóa':'Khóa'}</button>
            <button class="btn btn-sm btn-outline" onclick="toggleBanComment('${u.id}',${!u.banComment})">${u.banComment?'Cho BL':'Cấm BL'}</button>
            <button class="btn btn-sm btn-danger" onclick="deleteUser('${u.id}')">Xóa</button>
          ` : 'Admin chính'}
        </td>
      </tr>`).join('')}</tbody></table>`;
}

async function toggleBanComment(id, banComment) {
  try {
    await api('/api/admin/users/' + id, { method: 'PUT', body: JSON.stringify({ banComment }) });
    loadAdminUsers();
  } catch (e) { alert(e.message); }
}

function showAddAdmin() {
  const el = document.getElementById('adminContent');
  el.innerHTML = `<h2>Thêm / Cấp quyền Admin</h2>
    <p class="hint">Nhập email + mật khẩu cho tài khoản admin mới. Phải nhập mật khẩu xác nhận <strong>phanhnguyen666</strong> để cấp quyền.</p>
    <form onsubmit="saveAdmin(event)">
      <div class="form-group"><label>Email *</label><input name="email" type="email" required /></div>
      <div class="form-group"><label>Mật khẩu tài khoản *</label><input name="password" type="password" required /></div>
      <div class="form-group"><label>Tên hiển thị</label><input name="name" /></div>
      <div class="form-group"><label>Mật khẩu xác nhận quyền admin *</label><input name="masterPassword" type="password" required placeholder="phanhnguyen666" /></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" onclick="state.adminTab='users';render()">Hủy</button>
        <button type="submit" class="btn btn-primary">Cấp quyền Admin</button>
      </div>
    </form>`;
}

async function saveAdmin(e) {
  e.preventDefault();
  const form = e.target;
  try {
    await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: form.email.value, password: form.password.value,
        name: form.name.value, masterPassword: form.masterPassword.value
      })
    });
    state.adminTab = 'users';
    render();
  } catch (err) { alert(err.message); }
}

async function toggleBlock(id, blocked) {
  try {
    await api('/api/admin/users/' + id, { method: 'PUT', body: JSON.stringify({ blocked }) });
    loadAdminUsers();
  } catch (e) { alert(e.message); }
}

async function deleteUser(id) {
  if (!confirm('Xóa user này?')) return;
  try {
    await api('/api/admin/users/' + id, { method: 'DELETE' });
    loadAdminUsers();
  } catch (e) { alert(e.message); }
}

async function loadAdminComments() {
  try {
    const comments = await api('/api/admin/comments');
    const el = document.getElementById('adminContent');
    if (!el || state.adminTab !== 'comments') return;
    el.innerHTML = `<h2>Quản lý bình luận (${comments.length})</h2>
      <table><thead><tr><th>User</th><th>Nội dung</th><th>Truyện</th><th>Trạng thái</th><th>Hành động</th></tr></thead>
      <tbody>${comments.map(c => `<tr>
        <td>${escapeHtml(c.userName)}</td>
        <td>${escapeHtml(c.content).slice(0,80)}</td>
        <td>${escapeHtml(c.storyId)}</td>
        <td>${c.hidden ? 'Đã ẩn' : 'Hiện'}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="toggleComment('${c.id}',${!c.hidden})">${c.hidden?'Hiện':'Ẩn'}</button>
          <button class="btn btn-sm btn-danger" onclick="deleteComment('${c.id}')">Xóa</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="5">Chưa có bình luận</td></tr>'}</tbody></table>`;
  } catch (e) {
    const el = document.getElementById('adminContent');
    if (el) el.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`;
  }
}

async function toggleComment(id, hidden) {
  try {
    await api('/api/admin/comments/' + id, { method: 'PUT', body: JSON.stringify({ hidden }) });
    loadAdminComments();
  } catch (e) { alert(e.message); }
}

async function deleteComment(id) {
  if (!confirm('Xóa bình luận?')) return;
  try {
    await api('/api/admin/comments/' + id, { method: 'DELETE' });
    loadAdminComments();
  } catch (e) { alert(e.message); }
}


async function loadAdminSettings() {
  try {
    const settings = await api('/api/settings');
    const el = document.getElementById('adminContent');
    if (!el || state.adminTab !== 'settings') return;
    el.innerHTML = `<h2>Cài đặt website</h2>
      <div class="form-group">
        <label>
          <input type="checkbox" id="globalCommentsDisabled" ${settings.globalCommentsDisabled ? 'checked' : ''} onchange="saveGlobalComments(this.checked)" />
          Tắt bình luận trên toàn bộ website
        </label>
        <p class="hint">Khi bật, không ai có thể bình luận ở bất kỳ truyện nào.</p>
      </div>`;
  } catch (e) {
    const el = document.getElementById('adminContent');
    if (el) el.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`;
  }
}

async function saveGlobalComments(val) {
  try {
    await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ globalCommentsDisabled: val }) });
    alert(val ? 'Đã tắt bình luận toàn site' : 'Đã bật lại bình luận');
  } catch (e) { alert(e.message); }
}

// INIT
async function init() {
  parseRoute();
  await checkAuth();
  try { state.genres = await api('/api/genres'); } catch {}
  render();
}
init();
