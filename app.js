import { createStore } from './store.js';

// ---------- yardımcılar ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  : Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-6));

// Oda bu kadar süre boyunca kimse içindeyken açık değilse silinir.
const STALE_MS = 3 * 60 * 60 * 1000; // 3 saat
const HEARTBEAT_MS = 5 * 60 * 1000; // odadaki herkes 5 dakikada bir "buradayım" der
const NET_TIMEOUT_MS = 12000;

function withTimeout(promise, ms = NET_TIMEOUT_MS) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error('TIMEOUT')), ms); }),
  ]).finally(() => clearTimeout(t));
}
function errText(err) {
  if (err?.message === 'TIMEOUT') return 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene (gerekirse sayfayı yenile).';
  if (/permission/i.test(err?.message || '')) return 'Sunucu isteği reddetti. Sayfayı yenileyip tekrar dene.';
  return 'Bir hata oldu: ' + (err?.message || err);
}
const CODE_CHARS = 'ABCDEFGHJKLMNPRSTUVYZ';
const hue = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.codePointAt(0)) % 360; return h; };
const initial = (s) => (s.trim()[0] || '?').toLocaleUpperCase('tr');
const lower = (s) => s.trim().toLocaleLowerCase('tr');
const clean = (s) => s.trim().replace(/\s+/g, ' ');
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function ls(key, val) {
  try {
    if (val === undefined) { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
    if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(val));
  } catch { return null; }
}

const SUGGESTIONS = [
  'Mustafa Kemal Atatürk', 'Barış Manço', 'Sezen Aksu', 'Tarkan', 'Cem Yılmaz', 'Kemal Sunal', 'Zeki Müren',
  'Müslüm Gürses', 'Ajda Pekkan', 'Nasreddin Hoca', 'Mimar Sinan', 'Fatih Sultan Mehmet', 'Kanuni Sultan Süleyman',
  'Mevlana', 'Yunus Emre', 'Nazım Hikmet', 'Orhan Pamuk', 'Aziz Sancar', 'Sabiha Gökçen', 'Naim Süleymanoğlu',
  'Arda Güler', 'Hidayet Türkoğlu', 'Acun Ilıcalı', 'Kıvanç Tatlıtuğ', 'Albert Einstein', 'Isaac Newton',
  'Nikola Tesla', 'Marie Curie', 'Galileo Galilei', 'Leonardo da Vinci', 'Pablo Picasso', 'Vincent van Gogh',
  'Mozart', 'Beethoven', 'William Shakespeare', 'Napolyon', 'Kleopatra', 'Mahatma Gandhi', 'Charlie Chaplin',
  'Michael Jackson', 'Taylor Swift', 'Shakira', 'Beyoncé', 'Lionel Messi', 'Cristiano Ronaldo', 'Michael Jordan',
  'Usain Bolt', 'Muhammed Ali', 'Elon Musk', 'Steve Jobs', 'Bill Gates', 'Mark Zuckerberg', 'Kristof Kolomb',
];

// ---------- durum ----------
const app = $('#app');
const modal = $('#modal');
const modalBox = $('#modalBox');
const toastEl = $('#toast');
let store;
const S = { code: null, me: null, room: null, unsub: null, unsubConn: null, prevFound: null, leaving: false, stageKey: null, entryKey: null, editing: false, beat: null, homeConn: null };

const players = () => Object.entries(S.room?.players || {})
  .map(([id, p]) => ({ id, ...p }))
  .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
const isHost = () => S.room?.meta?.host === S.me;
const phase = () => S.room?.meta?.phase || 'lobby';
const round = () => S.room?.meta?.round || 0;
const roomPath = (p = '') => `rooms/${S.code}${p ? '/' + p : ''}`;
const roomUrl = () => `${location.origin}${location.pathname}?oda=${S.code}`;
const siteHost = () => location.host + location.pathname.replace(/index\.html$/, '').replace(/\/$/, '');

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => toastEl.classList.remove('show'), 2800);
}

let pendingAsk = null;
function openModal(html) {
  if (pendingAsk) { const r = pendingAsk; pendingAsk = null; r(false); }
  modalBox.innerHTML = html;
  modal.hidden = false;
}
function closeModal() {
  modal.hidden = true; modalBox.innerHTML = '';
  if (pendingAsk) { const r = pendingAsk; pendingAsk = null; r(false); }
}
// Tarayıcının confirm() penceresi yerine (bazı uygulama içi tarayıcılar onu engelliyor).
function ask(text, okLabel = 'Evet') {
  return new Promise((resolve) => {
    openModal(`
      <p class="ask-text">${esc(text).replace(/\n/g, '<br>')}</p>
      <div class="row-btns"><span class="spacer"></span>
        <button class="btn ghost" data-ans="0">Vazgeç</button>
        <button class="btn primary" data-ans="1">${esc(okLabel)}</button>
      </div>`);
    pendingAsk = resolve;
    modalBox.querySelectorAll('[data-ans]').forEach((b) => b.addEventListener('click', () => {
      pendingAsk = null;
      closeModal();
      resolve(b.dataset.ans === '1');
    }));
  });
}
modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Bağlantı kopyalandı 📋'); }
  catch {
    openModal(`<h2>Davet bağlantısı</h2><input readonly value="${esc(text)}" onclick="this.select()">
      <div class="row-btns"><span class="spacer"></span><button class="btn primary" data-close>Tamam</button></div>`);
  }
}

const demoBanner = () => store.mode === 'local'
  ? `<div class="demo">🧪 <b>Demo modu:</b> Firebase ayarlanmadığı için veriler sadece bu tarayıcıdaki sekmeler arasında paylaşılıyor.</div>`
  : '';

function avatar(name) {
  return `<span class="avatar" style="--h:${hue(name)}">${esc(initial(name))}</span>`;
}

// ---------- giriş ekranı ----------
function renderHome(prefillCode = '') {
  cleanupRoom();
  const lastName = ls('kimim:name') || '';
  app.innerHTML = `
  <div class="home">
    <div class="hero">
      <div class="logo">🎭</div>
      <h1>Ben Kimim?</h1>
      <p>Herkes bir isim yazar, isimler rastgele dağıtılır. Sen herkesin karakterini görürsün ama kendininkini göremezsin. Soru sorarak bul!</p>
    </div>
    ${demoBanner()}
    <div class="notice warn" id="homeConn" hidden>📡 Sunucuya bağlanılamıyor. İnternet bağlantını kontrol et. Okul/kurum ağı engelliyorsa mobil veriyle dene.</div>
    <form class="panel" id="homeForm" autocomplete="off">
      <label class="field"><span>Adın</span>
        <input id="nameIn" maxlength="24" value="${esc(lastName)}" placeholder="Örn: Mert">
      </label>
      <label class="field"><span>Oda kodu</span>
        <input id="codeIn" class="code-input" maxlength="6" value="${esc(prefillCode)}" placeholder="ABCD">
      </label>
      <button type="submit" class="btn primary big">Odaya katıl</button>
      <div class="or"><span>ya da</span></div>
      <button type="button" id="createBtn" class="btn big">✨ Yeni oda kur</button>
    </form>
    <ol class="howto">
      <li><b>Lobi:</b> Biri oda kurar, herkes oda koduyla katılır.</li>
      <li><b>İsim yazma:</b> Herkes bir insan ismi yazar, sistem isimleri rastgele dağıtır.</li>
      <li><b>Oyun:</b> Birbirinize soru sorun, cevapları <b>Notlarım</b>'a yazın.</li>
      <li>Karakterini bilince <b>Buldum!</b>'a bas.</li>
    </ol>
  </div>`;

  // Sunucuya gerçekten ulaşılabiliyor mu? (ulaşılamazsa uyarı göster, bağlanınca gizle)
  let alive = true;
  withTimeout(store.get('rooms/_ping'), 8000).catch((err) => {
    if (alive && err?.message === 'TIMEOUT') $('#homeConn')?.removeAttribute('hidden');
  });
  const unsubConn = store.onConnection((ok) => { const el = $('#homeConn'); if (el && ok) el.hidden = true; });
  S.homeConn = () => { alive = false; unsubConn?.(); };

  const nameIn = $('#nameIn');
  const codeIn = $('#codeIn');
  codeIn.addEventListener('input', () => { codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  (prefillCode ? nameIn : (lastName ? codeIn : nameIn)).focus();

  const getName = () => {
    const n = clean(nameIn.value);
    if (!n) { toast('Önce adını yaz'); nameIn.focus(); return null; }
    ls('kimim:name', n);
    return n;
  };
  $('#homeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = getName(); if (!n) return;
    await guard(() => joinRoom(n, codeIn.value));
  });
  $('#createBtn').addEventListener('click', async () => {
    const n = getName(); if (!n) return;
    await guard(() => createRoom(n));
  });
}

async function guard(fn) {
  const btns = app.querySelectorAll('button');
  btns.forEach((b) => (b.disabled = true));
  try { await fn(); }
  catch (err) { console.error(err); toast(errText(err)); }
  finally { btns.forEach((b) => (b.disabled = false)); }
}

async function createRoom(name) {
  let code;
  for (let i = 0; i < 12; i++) {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    if (!(await withTimeout(store.get(`rooms/${code}/meta`)))) break;
  }
  const id = uid();
  const now = Date.now();
  await withTimeout(store.set(`rooms/${code}`, {
    meta: { createdAt: now, host: id, phase: 'lobby', round: 0, lastActive: store.stamp() },
    players: { [id]: { name, joinedAt: now } },
  }));
  enterRoom(code, id);
}

async function joinRoom(name, rawCode) {
  const code = rawCode.trim().toUpperCase();
  if (!code) { toast('Oda kodunu yaz'); $('#codeIn')?.focus(); return; }
  const room = await withTimeout(store.get(`rooms/${code}`));
  if (!room?.meta) { toast('Bu kodla bir oda bulunamadı'); return; }
  const ps = room.players || {};

  const saved = ls('kimim:' + code);
  if (saved?.id && ps[saved.id]) {
    if (ps[saved.id].name !== name) await withTimeout(store.update(`rooms/${code}/players/${saved.id}`, { name }));
    return enterRoom(code, saved.id);
  }
  const same = Object.entries(ps).find(([, p]) => lower(p.name) === lower(name));
  if (same) {
    const me = await ask(`Odada "${same[1].name}" adında biri zaten var.\n\nO oyuncu sen misin? Değilsen adının sonuna bir harf ekleyip (ör. "${same[1].name} K.") tekrar dene.`, 'Evet, benim');
    if (!me) { $('#nameIn')?.focus(); return; }
    return enterRoom(code, same[0]);
  }
  const id = uid();
  await withTimeout(store.set(`rooms/${code}/players/${id}`, { name, joinedAt: Date.now() }));
  if (!room.meta.host || !ps[room.meta.host]) await withTimeout(store.update(`rooms/${code}/meta`, { host: id }));
  enterRoom(code, id);
}

function cleanupRoom() {
  S.unsub?.(); S.unsubConn?.(); S.homeConn?.();
  clearInterval(S.beat);
  S.unsub = S.unsubConn = S.homeConn = S.beat = null;
  closeModal();
}

function goHome(prefill = '') {
  cleanupRoom();
  S.code = S.me = S.room = null;
  const url = new URL(location.href);
  url.searchParams.delete('oda');
  history.replaceState(null, '', url);
  renderHome(prefill);
}

// ---------- oda ----------
function enterRoom(code, id) {
  cleanupRoom();
  Object.assign(S, { code, me: id, room: null, prevFound: null, leaving: false, stageKey: null, entryKey: null, editing: false });
  ls('kimim:' + code, { id });
  const url = new URL(location.href);
  url.searchParams.set('oda', code);
  history.replaceState(null, '', url);

  renderRoomShell();
  const touch = () => { if (!S.leaving) store.update(`rooms/${code}/meta`, { lastActive: store.stamp() }).catch(() => {}); };
  touch();
  S.beat = setInterval(touch, HEARTBEAT_MS);
  S.unsub = store.watch(roomPath(), (val) => {
    if (S.leaving) return;
    S.room = val;
    if (!val || !val.players?.[S.me]) {
      ls('kimim:' + code, null);
      toast(val ? 'Odadan çıkarıldın' : 'Oda kapatıldı');
      goHome(val ? code : '');
      return;
    }
    updateRoom();
  });
  S.unsubConn = store.onConnection((ok) => {
    const el = $('#conn');
    if (el) { el.className = 'conn ' + (ok ? 'on' : 'off'); el.title = ok ? 'Bağlı' : 'Bağlantı koptu, yeniden bağlanıyor…'; }
  });
}

function renderRoomShell() {
  app.innerHTML = `
  <header class="top">
    <div class="brand">🎭 <span>Ben Kimim?</span></div>
    <button class="code-pill" id="codePill" title="Kodu büyük göster">Oda <b>${esc(S.code)}</b></button>
    <span class="spacer"></span>
    <span id="conn" class="conn"></span>
    <div class="menu-wrap">
      <button class="icon-btn" id="menuBtn" aria-label="Menü">⋯</button>
      <div class="menu" id="menu" hidden>
        <button data-act="copy">🔗 Davet bağlantısını kopyala</button>
        <button data-act="big">📺 Kodu büyük göster</button>
        <button data-act="newGame" class="host-only" id="newGameBtn">🔄 Yeni oyun (lobiye dön)</button>
        <button data-act="leave" class="danger">🚪 Odadan çık</button>
      </div>
    </div>
  </header>
  ${demoBanner()}
  <div id="stage"></div>`;

  const menu = $('#menu');
  $('#menuBtn').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener('click', (e) => { if (!e.target.closest('.menu-wrap')) menu.hidden = true; });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    menu.hidden = true;
    handleAction(b.dataset.act);
  });
  $('#codePill').addEventListener('click', () => handleAction('big'));
  $('#stage').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    handleAction(b.dataset.act, b.dataset.id);
  });
}

const PHASE_TOAST = {
  lobby: '🔄 Yeni oyun: lobiye dönüldü',
  naming: '✍️ İsim yazma başladı!',
  playing: '🎭 Oyun başladı! Soru sormaya başlayın',
};

function updateRoom() {
  app.classList.toggle('is-host', isHost());
  $('#newGameBtn').hidden = phase() === 'lobby';

  const key = `${phase()}:${round()}`;
  if (key !== S.stageKey) {
    const hadStage = S.stageKey !== null;
    S.stageKey = key;
    S.entryKey = null; S.editing = false; S.prevFound = null;
    buildStage();
    if (hadStage) toast(PHASE_TOAST[phase()]);
  }
  if (phase() === 'lobby') updateLobby();
  else if (phase() === 'naming') updateNaming();
  else updatePlaying();
}

function buildStage() {
  const stage = $('#stage');
  const p = phase();
  if (p === 'lobby') {
    stage.innerHTML = `
    <div class="stage">
      <section class="stage-card">
        <div class="steps"><span class="on">1 · Lobi</span><span>2 · İsim yazma</span><span>3 · Oyun</span></div>
        <h2>Herkes odaya gelsin</h2>
        <p class="muted">Arkadaşların <b>${esc(siteHost())}</b> adresine girip <b class="code-inline">${esc(S.code)}</b> koduyla katılabilir.</p>
        <div class="row-btns center">
          <button class="btn small" data-act="copy">🔗 Bağlantıyı kopyala</button>
          <button class="btn small" data-act="big">📺 Kodu büyük göster</button>
        </div>
        <div class="subhead"><span>Odadakiler</span><span id="pCount"></span></div>
        <ul class="plist" id="plist"></ul>
        <div id="hostBox" class="host-box"></div>
      </section>
    </div>`;
  } else if (p === 'naming') {
    stage.innerHTML = `
    <div class="stage">
      <section class="stage-card">
        <div class="steps"><span class="done">1 · Lobi</span><span class="on">2 · İsim yazma</span><span>3 · Oyun</span></div>
        <h2>Bir insan ismi yaz</h2>
        <p class="muted">Ünlü ya da gerçek bir insan olabilir. İsimler rastgele dağıtılacak, kendi yazdığın isim sana gelmez. Kimse kimin ne yazdığını oyun başlayana kadar görmez.</p>
        <div id="myEntry"></div>
        <div class="subhead"><span>Yazanlar</span><span id="pCount"></span></div>
        <ul class="plist" id="plist"></ul>
        <div id="hostBox" class="host-box"></div>
      </section>
    </div>`;
  } else {
    stage.innerHTML = `
    <div class="progress"><div class="bar"><i id="bar"></i></div><span id="progressText"></span></div>
    <nav class="tabs">
      <button data-tab="players" class="active">👥 Oyuncular</button>
      <button data-tab="notes">📝 Notlarım <span id="noteCount" class="count"></span></button>
    </nav>
    <main class="room" id="room">
      <section class="pane players-pane">
        <div id="meCard"></div>
        <div id="grid" class="grid"></div>
      </section>
      <aside class="pane notes-pane">
        <div class="notes-card">
          <div class="notes-head"><h2>Sorularım</h2><span id="qStats" class="muted small"></span></div>
          <form id="qForm" class="q-form" autocomplete="off">
            <input id="qInput" maxlength="120" placeholder="Örn: Gerçek biri miyim? Şarkıcı mıyım?">
            <div class="ans">
              <button type="button" data-a="yes" class="a-yes">👍 Evet</button>
              <button type="button" data-a="no" class="a-no">👎 Hayır</button>
              <button type="button" data-a="maybe" class="a-maybe">🤷 Belki</button>
            </div>
          </form>
          <ul id="qList" class="q-list"></ul>
          <div class="notes-head"><h2>Tahminlerim</h2></div>
          <textarea id="freeNotes" rows="5" placeholder="Aklına gelen isimler, ipuçları…"></textarea>
          <button class="btn ghost small" id="clearNotes">🧹 Notları temizle</button>
        </div>
      </aside>
    </main>`;
    stage.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
      stage.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
      $('#room').classList.toggle('show-notes', b.dataset.tab === 'notes');
    }));
    setupNotes();
  }
}

function playerRow(p, right = '') {
  const host = isHost();
  return `
    <li class="prow">
      ${avatar(p.name)}
      <span class="pname">${esc(p.name)}${p.id === S.me ? ' <span class="muted small">(sen)</span>' : ''}${S.room.meta?.host === p.id ? ' <span class="chip">kurucu</span>' : ''}</span>
      ${right}
      ${host && p.id !== S.me ? `<button class="icon-btn kick" data-act="kick" data-id="${p.id}" title="Odadan çıkar">×</button>` : ''}
    </li>`;
}

function hostName() { return S.room.players[S.room.meta?.host]?.name || 'Kurucu'; }

// --- 1. lobi
function updateLobby() {
  const ps = players();
  $('#pCount').textContent = `${ps.length} kişi`;
  $('#plist').innerHTML = ps.map((p) => playerRow(p)).join('');
  $('#hostBox').innerHTML = isHost()
    ? `<button class="btn primary big" data-act="startNaming" ${ps.length < 2 ? 'disabled' : ''}>▶️ Başlat: İsim yazmaya geç</button>
       <p class="muted small center">${ps.length < 2 ? 'Başlatmak için en az 2 kişi gerekli.' : 'Herkes geldiyse başlat. Sonradan gelenler de isim yazabilir.'}</p>`
    : `<div class="wait">⏳ ${esc(hostName())} oyunu başlatınca isim yazma kısmı açılacak…</div>`;
}

// --- 2. isim yazma
function updateNaming() {
  const ps = players();
  const subs = S.room.submissions || {};
  const mine = subs[S.me]?.name || null;
  const done = ps.filter((p) => subs[p.id]).length;

  const entryKey = S.editing || !mine ? `form:${S.editing}` : `done:${mine}`;
  if (entryKey !== S.entryKey) {
    S.entryKey = entryKey;
    renderMyEntry(mine);
  }

  $('#pCount').textContent = `${done}/${ps.length} kişi yazdı`;
  $('#plist').innerHTML = ps.map((p) => playerRow(p,
    subs[p.id] ? '<span class="status ok">✓ yazdı</span>' : '<span class="status wait-dots">yazıyor…</span>')).join('');

  const all = done === ps.length && ps.length >= 2;
  $('#hostBox').innerHTML = isHost()
    ? `<button class="btn primary big" data-act="startGame" ${all ? '' : 'disabled'}>🎭 Oyunu başlat</button>
       <p class="muted small center">${all ? 'Herkes yazdı! Başlatınca isimler rastgele dağıtılacak.' : `Herkesin yazması bekleniyor (${done}/${ps.length}). Yazmayan birini × ile çıkarabilirsin.`}</p>`
    : `<div class="wait">${all ? `✅ Herkes yazdı, ${esc(hostName())} oyunu başlatacak…` : `⏳ Herkesin yazması bekleniyor (${done}/${ps.length})`}</div>`;
}

function renderMyEntry(mine) {
  const box = $('#myEntry');
  if (mine && !S.editing) {
    box.innerHTML = `
      <div class="entry-done">
        <div>✅ Gönderdin: <b>${esc(mine)}</b></div>
        <button class="btn ghost small" data-act="editEntry">✏️ Değiştir</button>
      </div>`;
    return;
  }
  box.innerHTML = `
    <form id="entryForm" class="entry-form" autocomplete="off">
      <input id="entryIn" maxlength="40" value="${esc(mine || '')}" placeholder="Örn: Barış Manço">
      <div class="row-btns">
        <button type="button" class="btn ghost" id="randBtn">🎲 Öner</button>
        <span class="spacer"></span>
        ${S.editing ? '<button type="button" class="btn ghost" data-act="cancelEdit">Vazgeç</button>' : ''}
        <button type="submit" class="btn primary">Gönder</button>
      </div>
    </form>`;
  const input = $('#entryIn');
  input.focus();
  $('#randBtn').addEventListener('click', () => {
    const pool = SUGGESTIONS.filter((s) => s !== input.value);
    input.value = pool[Math.floor(Math.random() * pool.length)];
    input.focus();
  });
  $('#entryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = clean(input.value);
    if (!name) { input.focus(); toast('Bir isim yaz'); return; }
    S.editing = false;
    try { await store.set(roomPath('submissions/' + S.me), { name, at: Date.now() }); }
    catch (err) { console.error(err); toast(errText(err)); }
  });
}

// --- 3. oyun
function updatePlaying() {
  const ps = players();
  const inGame = ps.filter((p) => p.character);
  const found = inGame.filter((p) => p.found).length;
  $('#bar').style.width = inGame.length ? `${(found / inGame.length) * 100}%` : '0';
  $('#progressText').textContent = inGame.length > 1 && found === inGame.length
    ? '🎉 Herkes buldu!'
    : `${found}/${inGame.length} kişi buldu`;

  if (S.prevFound) {
    for (const p of ps) if (p.found && !S.prevFound[p.id] && p.id !== S.me) toast(`🎉 ${p.name} karakterini buldu!`);
  }
  S.prevFound = Object.fromEntries(ps.map((p) => [p.id, !!p.found]));

  renderMe(S.room.players[S.me]);
  renderGrid(ps);
}

function renderMe(me) {
  const c = me.character;
  let body;
  if (!c) {
    body = `<p class="muted">Bu tur sen katılmadan başladı. Kurucu yeni oyun başlatınca sen de oynayabilirsin. Bu arada diğerlerinin karakterlerini görebilirsin.</p>`;
  } else if (!me.found) {
    body = `
      <div class="secret">❓ ❓ ❓</div>
      <p class="muted">Karakterin hazır! Sorular sorarak kim olduğunu bul, bildiğinde işaretle.</p>
      <button class="btn primary big" data-act="found">✅ Buldum!</button>`;
  } else {
    body = `
      <div class="reveal">${esc(c.name)}</div>
      <p class="muted">Tebrikler, karakterini buldun! <span class="small">(${esc(c.byName)} yazmıştı)</span></p>
      <button class="btn ghost small" data-act="unfound">↩︎ Geri al</button>`;
  }
  $('#meCard').innerHTML = `
    <div class="me-card ${me.found ? 'found' : ''}">
      <div class="me-head">${avatar(me.name)}
        <div><div class="label">Sen ${isHost() ? '<span class="chip">kurucu</span>' : ''}</div><div class="pname">${esc(me.name)}</div></div>
      </div>
      ${body}
    </div>`;
}

function renderGrid(ps) {
  const host = isHost();
  $('#grid').innerHTML = ps.filter((p) => p.id !== S.me).map((p) => {
    const c = p.character;
    const charBlock = c
      ? `<div class="char">${esc(c.name)}</div>
         <div class="by">${c.by === S.me ? 'Senin yazdığın isim' : `${esc(c.byName)} yazdı`}</div>`
      : `<div class="by">Bu turda oynamıyor</div>`;
    return `
      <article class="card ${p.found ? 'found' : ''} ${c ? '' : 'empty'}">
        <div class="card-head">${avatar(p.name)}
          <div class="pname">${esc(p.name)}${S.room.meta?.host === p.id ? ' <span class="chip">kurucu</span>' : ''}</div>
          ${p.found ? '<span class="badge">✓ Buldu</span>' : ''}
          ${host ? `<button class="icon-btn kick" data-act="kick" data-id="${p.id}" title="Odadan çıkar">×</button>` : ''}
        </div>
        ${charBlock}
      </article>`;
  }).join('');
}

// ---------- aksiyonlar ----------
async function handleAction(act, id) {
  try {
    switch (act) {
      case 'copy': return copy(roomUrl());
      case 'big': return openModal(`
        <div class="bigcode-wrap">
          <p class="muted">Bu adrese girip kodu yazın</p>
          <div class="bigurl">${esc(siteHost())}</div>
          <div class="bigcode">${esc(S.code)}</div>
          <button class="btn primary" data-close>Kapat</button>
        </div>`);

      case 'startNaming':
        if (!isHost()) return;
        return store.update(roomPath(), { 'meta/phase': 'naming', submissions: null });

      case 'editEntry': S.editing = true; return updateNaming();
      case 'cancelEdit': S.editing = false; return updateNaming();

      case 'startGame': return startGame();

      case 'found':
        if (!(await ask('Karakterini bildin mi? İşaretleyince karakterin sana da gösterilecek.', 'Evet, buldum'))) return;
        return store.update(roomPath('players/' + S.me), { found: true, foundAt: Date.now() });
      case 'unfound':
        return store.update(roomPath('players/' + S.me), { found: null, foundAt: null });

      case 'kick': {
        const p = S.room.players[id];
        if (!p || !(await ask(`${p.name} odadan çıkarılsın mı?`, 'Çıkar'))) return;
        return store.update(roomPath(), { [`players/${id}`]: null, [`submissions/${id}`]: null });
      }
      case 'newGame': {
        if (!isHost()) return;
        if (!(await ask('Yeni oyun: Karakterler ve yazılan isimler silinip lobiye dönülecek. Emin misin?', 'Yeni oyun'))) return;
        const upd = { 'meta/phase': 'lobby', submissions: null };
        for (const p of players()) {
          upd[`players/${p.id}/character`] = null;
          upd[`players/${p.id}/found`] = null;
          upd[`players/${p.id}/foundAt`] = null;
        }
        return store.update(roomPath(), upd);
      }
      case 'leave': {
        if (!(await ask('Odadan çıkmak istiyor musun?', 'Çık'))) return;
        const rest = players().filter((p) => p.id !== S.me);
        const upd = { [`players/${S.me}`]: null, [`submissions/${S.me}`]: null };
        if (isHost()) upd['meta/host'] = rest[0]?.id || null;
        S.leaving = true;
        const code = S.code;
        await store.update(roomPath(), upd);
        ls('kimim:' + code, null);
        return goHome();
      }
    }
  } catch (err) {
    console.error(err);
    toast(errText(err));
  }
}

async function startGame() {
  if (!isHost()) return;
  const ps = players();
  const subs = S.room.submissions || {};
  const missing = ps.filter((p) => !subs[p.id]);
  if (ps.length < 2) return toast('En az 2 kişi gerekli');
  if (missing.length) return toast(`Henüz yazmayanlar: ${missing.map((p) => p.name).join(', ')}`);

  // Rastgele sırala, herkes bir sonrakine verir: kimse kendi yazdığını almaz.
  const order = shuffle(ps.map((p) => p.id));
  const upd = { 'meta/phase': 'playing', 'meta/round': round() + 1 };
  order.forEach((giver, i) => {
    const target = order[(i + 1) % order.length];
    upd[`players/${target}/character`] = { name: subs[giver].name, by: giver, byName: S.room.players[giver].name };
    upd[`players/${target}/found`] = null;
    upd[`players/${target}/foundAt`] = null;
  });
  await store.update(roomPath(), upd);
}

// ---------- notlar (sadece bu cihazda, her tur ayrı) ----------
const LABEL = { yes: '👍 Evet', no: '👎 Hayır', maybe: '🤷 Belki' };
const CYCLE = { yes: 'no', no: 'maybe', maybe: 'yes' };

function setupNotes() {
  const key = `kimim:notes:${S.code}:${S.me}:${round()}`;
  const notes = ls(key) || { qs: [], free: '' };
  const save = () => ls(key, notes);
  const list = $('#qList');
  const input = $('#qInput');
  const free = $('#freeNotes');
  free.value = notes.free || '';

  const draw = () => {
    list.innerHTML = notes.qs.length
      ? notes.qs.map((q, i) => `
        <li class="q ${q.a}">
          <button class="tag" data-cycle="${i}" title="Cevabı değiştir">${LABEL[q.a]}</button>
          <span class="qt">${esc(q.t)}</span>
          <button class="x" data-del="${i}" aria-label="Sil">×</button>
        </li>`).join('')
      : '<li class="empty">Sorduğun soruları ve aldığın cevapları buraya ekle.</li>';
    const n = (a) => notes.qs.filter((q) => q.a === a).length;
    $('#qStats').textContent = notes.qs.length ? `${n('yes')} evet · ${n('no')} hayır · ${n('maybe')} belki` : '';
    $('#noteCount').textContent = notes.qs.length || '';
  };
  draw();

  $('#qForm').addEventListener('submit', (e) => e.preventDefault());
  $('#qForm').addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const t = input.value.trim();
    if (!t) { input.focus(); toast('Önce soruyu yaz, sonra cevabı seç'); return; }
    notes.qs.unshift({ t, a: b.dataset.a });
    input.value = '';
    save(); draw(); input.focus();
  });
  list.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    const cyc = e.target.closest('[data-cycle]');
    if (del) notes.qs.splice(+del.dataset.del, 1);
    else if (cyc) { const q = notes.qs[+cyc.dataset.cycle]; q.a = CYCLE[q.a]; }
    else return;
    save(); draw();
  });
  free.addEventListener('input', () => { notes.free = free.value; save(); });
  $('#clearNotes').addEventListener('click', async () => {
    if (!(await ask('Tüm soruların ve notların silinsin mi?', 'Sil'))) return;
    notes.qs = []; notes.free = ''; free.value = '';
    save(); draw();
  });
}

// ---------- eski odaları silme ----------
// Sunucu tarafı kod olmadığı için temizliği siteyi açan herkes yapar:
// 3 saattir kimsenin içinde olmadığı odalar silinir (her açılışta en fazla 50).
async function cleanupStaleRooms() {
  try {
    const cutoff = store.serverNow() - STALE_MS - 60 * 1000;
    const keys = await withTimeout(store.staleRooms(cutoff, 50), 20000);
    await Promise.all(keys.filter((k) => k !== S.code).map((k) => store.remove(`rooms/${k}`)));
    if (keys.length) console.info(`Ben Kimim: ${keys.length} eski oda silindi`);
  } catch (err) {
    console.warn('Eski odalar temizlenemedi (Firebase kurallarını güncelledin mi?)', err?.message || err);
  }
}

// ---------- başlat ----------
async function init() {
  try {
    store = await createStore();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="home"><div class="notice warn">Veritabanına bağlanılamadı. firebase-config.js ayarlarını kontrol et.<br><small>${esc(err.message)}</small></div></div>`;
    return;
  }
  const code = (new URLSearchParams(location.search).get('oda') || '').toUpperCase();
  if (code) {
    const saved = ls('kimim:' + code);
    if (saved?.id) {
      try {
        if (await withTimeout(store.get(`rooms/${code}/players/${saved.id}`))) return enterRoom(code, saved.id);
      } catch (err) { console.error(err); }
    }
  }
  renderHome(code);
}

init().then(() => setTimeout(cleanupStaleRooms, 3000));
