import { createStore } from './store.js';

// ---------- yardımcılar ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const CODE_CHARS = 'ABCDEFGHJKLMNPRSTUVYZ';
const hue = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.codePointAt(0)) % 360; return h; };
const initial = (s) => (s.trim()[0] || '?').toLocaleUpperCase('tr');
const lower = (s) => s.trim().toLocaleLowerCase('tr');

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
const S = { code: null, me: null, room: null, unsub: null, unsubConn: null, prevFound: null, leaving: false };

const players = () => Object.entries(S.room?.players || {})
  .map(([id, p]) => ({ id, ...p }))
  .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
const isHost = () => S.room?.meta?.host === S.me;
const roomPath = (p = '') => `rooms/${S.code}${p ? '/' + p : ''}`;
const roomUrl = () => `${location.origin}${location.pathname}?oda=${S.code}`;

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => toastEl.classList.remove('show'), 2800);
}

function openModal(html) {
  modalBox.innerHTML = html;
  modal.hidden = false;
  const f = modalBox.querySelector('input, textarea');
  if (f) setTimeout(() => { f.focus(); f.select?.(); }, 30);
}
function closeModal() { modal.hidden = true; modalBox.innerHTML = ''; }
modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Bağlantı kopyalandı 📋'); }
  catch { prompt('Bağlantıyı kopyala:', text); }
}

const demoBanner = () => store.mode === 'local'
  ? `<div class="demo">🧪 <b>Demo modu:</b> Firebase ayarlanmadığı için veriler sadece bu tarayıcıdaki sekmeler arasında paylaşılıyor. Sınıfta oynamak için README'deki Firebase adımlarını uygula.</div>`
  : '';

// ---------- giriş ekranı ----------
function renderHome(prefillCode = '') {
  cleanupRoom();
  const lastName = ls('kimim:name') || '';
  app.innerHTML = `
  <div class="home">
    <div class="hero">
      <div class="logo">🎭</div>
      <h1>Ben Kimim?</h1>
      <p>Herkes bir arkadaşına ünlü bir isim verir. Sen herkesin karakterini görürsün, ama kendininkini göremezsin. Soru sorarak bul!</p>
    </div>
    ${demoBanner()}
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
      <li>Biri oda kurar, diğerleri oda koduyla katılır.</li>
      <li>Herkes kendisi dışında birine bir insan ismi verir.</li>
      <li>Sırayla soru sorun, cevapları <b>Notlarım</b>'a yazın.</li>
      <li>Karakterini bilince <b>Buldum!</b>'a bas.</li>
    </ol>
  </div>`;

  const nameIn = $('#nameIn');
  const codeIn = $('#codeIn');
  codeIn.addEventListener('input', () => { codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  (prefillCode ? nameIn : (lastName ? codeIn : nameIn)).focus();

  const getName = () => {
    const n = nameIn.value.trim().replace(/\s+/g, ' ');
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
  catch (err) { console.error(err); toast('Bir hata oldu: ' + (err.message || err)); }
  finally { btns.forEach((b) => (b.disabled = false)); }
}

async function createRoom(name) {
  let code;
  for (let i = 0; i < 12; i++) {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    if (!(await store.get(`rooms/${code}/meta`))) break;
  }
  const id = uid();
  const now = Date.now();
  await store.set(`rooms/${code}`, { meta: { createdAt: now, host: id }, players: { [id]: { name, joinedAt: now } } });
  enterRoom(code, id);
}

async function joinRoom(name, rawCode) {
  const code = rawCode.trim().toUpperCase();
  if (!code) { toast('Oda kodunu yaz'); $('#codeIn')?.focus(); return; }
  const room = await store.get(`rooms/${code}`);
  if (!room?.meta) { toast('Bu kodla bir oda bulunamadı'); return; }
  const ps = room.players || {};

  const saved = ls('kimim:' + code);
  if (saved?.id && ps[saved.id]) {
    if (ps[saved.id].name !== name) await store.update(`rooms/${code}/players/${saved.id}`, { name });
    return enterRoom(code, saved.id);
  }
  const same = Object.entries(ps).find(([, p]) => lower(p.name) === lower(name));
  if (same) {
    if (!confirm(`Odada "${same[1].name}" adında biri zaten var.\n\nO oyuncu sen misin? (Tamam = o oyuncu olarak devam et)`)) return;
    return enterRoom(code, same[0]);
  }
  const id = uid();
  await store.set(`rooms/${code}/players/${id}`, { name, joinedAt: Date.now() });
  if (!room.meta.host || !ps[room.meta.host]) await store.update(`rooms/${code}/meta`, { host: id });
  enterRoom(code, id);
}

function cleanupRoom() {
  S.unsub?.(); S.unsubConn?.();
  S.unsub = S.unsubConn = null;
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
  Object.assign(S, { code, me: id, room: null, prevFound: null, leaving: false });
  ls('kimim:' + code, { id });
  const url = new URL(location.href);
  url.searchParams.set('oda', code);
  history.replaceState(null, '', url);

  renderRoomShell();
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
        <button data-act="reset" class="host-only">🔄 Yeni oyun (karakterleri sil)</button>
        <button data-act="leave" class="danger">🚪 Odadan çık</button>
      </div>
    </div>
  </header>
  ${demoBanner()}
  <div class="progress"><div class="bar"><i id="bar"></i></div><span id="progressText"></span></div>
  <nav class="tabs">
    <button data-tab="players" class="active">👥 Oyuncular</button>
    <button data-tab="notes">📝 Notlarım <span id="noteCount" class="count"></span></button>
  </nav>
  <main class="room" id="room">
    <section class="pane players-pane" id="playersPane">
      <div id="meCard"></div>
      <div id="waiting"></div>
      <div id="grid" class="grid"></div>
    </section>
    <aside class="pane notes-pane" id="notesPane">
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

  // sekmeler (mobil)
  app.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    app.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
    $('#room').classList.toggle('show-notes', b.dataset.tab === 'notes');
  }));

  // menü
  const menu = $('#menu');
  $('#menuBtn').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener('click', (e) => { if (!e.target.closest('.menu-wrap')) menu.hidden = true; });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    menu.hidden = true;
    handleAction(b.dataset.act);
  });
  $('#codePill').addEventListener('click', () => handleAction('big'));
  $('#playersPane').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    handleAction(b.dataset.act, b.dataset.id);
  });

  setupNotes();
}

function updateRoom() {
  const ps = players();
  const me = S.room.players[S.me];
  app.classList.toggle('is-host', isHost());

  const found = ps.filter((p) => p.found).length;
  $('#bar').style.width = ps.length ? `${(found / ps.length) * 100}%` : '0';
  $('#progressText').textContent = ps.length > 1 && found === ps.length
    ? '🎉 Herkes buldu!'
    : `${found}/${ps.length} kişi buldu`;

  if (S.prevFound) {
    for (const p of ps) if (p.found && !S.prevFound[p.id] && p.id !== S.me) toast(`🎉 ${p.name} karakterini buldu!`);
  }
  S.prevFound = Object.fromEntries(ps.map((p) => [p.id, !!p.found]));

  renderMe(me);
  renderWaiting(ps);
  renderGrid(ps);
}

function avatar(name) {
  return `<span class="avatar" style="--h:${hue(name)}">${esc(initial(name))}</span>`;
}

function renderMe(me) {
  const c = me.character;
  let body;
  if (!c) {
    body = `<p class="muted">Henüz kimse sana bir karakter vermedi. Biraz bekle…</p>`;
  } else if (!me.found) {
    body = `
      <div class="secret">❓ ❓ ❓</div>
      <p class="muted">Karakterin hazır! Sorular sorarak kim olduğunu bul, bildiğinde işaretle.</p>
      <button class="btn primary big" data-act="found">✅ Buldum!</button>`;
  } else {
    body = `
      <div class="reveal">${esc(c.name)}</div>
      <p class="muted">Tebrikler, karakterini buldun! <span class="small">(${esc(c.byName)} vermişti)</span></p>
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

function renderWaiting(ps) {
  const others = ps.filter((p) => p.id !== S.me);
  const waiting = others.filter((p) => !p.character);
  const iGave = ps.some((p) => p.character?.by === S.me);
  let html = '';
  if (!others.length) {
    html = `<div class="notice">👋 Odada şimdilik sadece sen varsın. Arkadaşların <b>${esc(location.host)}</b> adresine girip <b>${esc(S.code)}</b> koduyla katılabilir.
      <button class="btn small" data-act="copy">🔗 Bağlantıyı kopyala</button></div>`;
  } else if (waiting.length && !iGave) {
    html = `<div class="notice warn">✍️ <b>Henüz kimseye isim vermedin!</b> Karakter bekleyenler: ${waiting.map((p) => esc(p.name)).join(', ')}</div>`;
  } else if (waiting.length) {
    html = `<div class="notice">⏳ Karakter bekleyenler: ${waiting.map((p) => esc(p.name)).join(', ')}</div>`;
  }
  $('#waiting').innerHTML = html;
}

function renderGrid(ps) {
  const host = isHost();
  const others = ps.filter((p) => p.id !== S.me);
  $('#grid').innerHTML = others.map((p) => {
    const c = p.character;
    const mine = c?.by === S.me;
    const canEdit = c && (mine || host);
    const charBlock = c
      ? `<div class="char">${esc(c.name)}</div>
         <div class="by">${mine ? 'Sen verdin' : `${esc(c.byName)} verdi`}
           ${canEdit ? `<button class="link" data-act="assign" data-id="${p.id}">değiştir</button>` : ''}</div>`
      : `<button class="btn assign" data-act="assign" data-id="${p.id}">✍️ İsim ver</button>`;
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
          <div class="bigurl">${esc(location.host + location.pathname.replace(/index\.html$/, ''))}</div>
          <div class="bigcode">${esc(S.code)}</div>
          <button class="btn primary" data-close>Kapat</button>
        </div>`);
      case 'assign': return openAssign(id);
      case 'found':
        if (!confirm('Karakterini bildin mi? İşaretleyince karakterin sana da gösterilecek.')) return;
        return store.update(roomPath('players/' + S.me), { found: true, foundAt: Date.now() });
      case 'unfound':
        return store.update(roomPath('players/' + S.me), { found: null, foundAt: null });
      case 'kick': {
        const p = S.room.players[id];
        if (!p || !confirm(`${p.name} odadan çıkarılsın mı?`)) return;
        return store.remove(roomPath('players/' + id));
      }
      case 'reset': {
        if (!confirm('Yeni oyun: Herkesin karakteri ve "buldu" işaretleri silinecek. Emin misin?')) return;
        const upd = {};
        for (const p of players()) { upd[`${p.id}/character`] = null; upd[`${p.id}/found`] = null; upd[`${p.id}/foundAt`] = null; }
        await store.update(roomPath('players'), upd);
        return toast('Yeni oyun başladı, herkes yeniden isim verebilir');
      }
      case 'leave': {
        if (!confirm('Odadan çıkmak istiyor musun?')) return;
        const rest = players().filter((p) => p.id !== S.me);
        const upd = { [`players/${S.me}`]: null };
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
    toast('Bir hata oldu: ' + (err.message || err));
  }
}

function openAssign(pid) {
  const p = S.room.players[pid];
  if (!p) return;
  const c = p.character;
  if (c && c.by !== S.me && !isHost()) return toast(`${p.name} için ${c.byName} zaten isim verdi`);
  openModal(`
    <h2>${avatar(p.name)} ${esc(p.name)} kim olsun?</h2>
    <p class="muted">Gerçek ya da ünlü bir insan ismi yaz. <b>${esc(p.name)}</b> bu ismi göremeyecek, diğer herkes görecek.</p>
    <form id="assignForm" autocomplete="off">
      <input id="charIn" maxlength="40" value="${esc(c?.name || '')}" placeholder="Örn: Barış Manço">
      <div class="row-btns">
        <button type="button" class="btn ghost" id="randBtn">🎲 Öner</button>
        ${c ? '<button type="button" class="btn ghost danger-text" id="clearChar">Kaldır</button>' : ''}
        <span class="spacer"></span>
        <button type="button" class="btn ghost" data-close>Vazgeç</button>
        <button type="submit" class="btn primary">Kaydet</button>
      </div>
    </form>`);

  const input = $('#charIn');
  $('#randBtn').addEventListener('click', () => {
    const used = new Set(players().map((x) => lower(x.character?.name || '')));
    const pool = SUGGESTIONS.filter((s) => !used.has(lower(s)) && s !== input.value);
    input.value = pool[Math.floor(Math.random() * pool.length)] || SUGGESTIONS[0];
    input.focus();
  });
  $('#clearChar')?.addEventListener('click', async () => {
    await store.update(roomPath('players/' + pid), { character: null, found: null, foundAt: null });
    closeModal();
  });
  $('#assignForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (!name) { input.focus(); return; }
    const myName = S.room.players[S.me]?.name || '?';
    const host = isHost();
    const ok = await store.transaction(roomPath('players/' + pid), (cur) => {
      if (!cur) return undefined;
      if (cur.character && cur.character.by !== S.me && !host) return undefined;
      return { ...cur, character: { name, by: S.me, byName: myName, at: Date.now() }, found: null, foundAt: null };
    });
    if (!ok) toast(`${p.name} için az önce başka biri isim verdi`);
    else toast(`${p.name} artık "${name}" 🎭`);
    closeModal();
  });
}

// ---------- notlar (sadece bu cihazda) ----------
const LABEL = { yes: '👍 Evet', no: '👎 Hayır', maybe: '🤷 Belki' };
const CYCLE = { yes: 'no', no: 'maybe', maybe: 'yes' };

function setupNotes() {
  const key = `kimim:notes:${S.code}:${S.me}`;
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
  $('#clearNotes').addEventListener('click', () => {
    if (!confirm('Tüm soruların ve notların silinsin mi?')) return;
    notes.qs = []; notes.free = ''; free.value = '';
    save(); draw();
  });
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
        if (await store.get(`rooms/${code}/players/${saved.id}`)) return enterRoom(code, saved.id);
      } catch (err) { console.error(err); }
    }
  }
  renderHome(code);
}

init();
