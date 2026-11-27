// Veri katmanı: Firebase Realtime Database (canlı) ya da localStorage (demo).
import { firebaseConfig } from './firebase-config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2';

export async function createStore() {
  if (firebaseConfig && firebaseConfig.databaseURL) return createFirebaseStore();
  return createLocalStore();
}

async function createFirebaseStore() {
  const { initializeApp } = await import(`${FB}/firebase-app.js`);
  const db = await import(`${FB}/firebase-database.js`);
  const app = initializeApp(firebaseConfig);
  const database = db.getDatabase(app);
  const r = (p) => db.ref(database, p);
  return {
    mode: 'firebase',
    watch(path, cb) { return db.onValue(r(path), (s) => cb(s.val())); },
    async get(path) { return (await db.get(r(path))).val(); },
    set(path, val) { return db.set(r(path), val); },
    update(path, obj) { return db.update(r(path), obj); },
    remove(path) { return db.remove(r(path)); },
    async transaction(path, fn) { return (await db.runTransaction(r(path), fn)).committed; },
    onConnection(cb) { return db.onValue(r('.info/connected'), (s) => cb(!!s.val())); },
  };
}

function createLocalStore() {
  const KEY = 'kimim-demo-db';
  const listeners = new Set();
  const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));
  const parts = (p) => p.split('/').filter(Boolean);
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const getAt = (d, p) => parts(p).reduce((o, k) => (o == null ? null : (o[k] ?? null)), d);
  const setAt = (d, p, v) => {
    const ks = parts(p);
    let o = d;
    for (let i = 0; i < ks.length - 1; i++) {
      if (typeof o[ks[i]] !== 'object' || o[ks[i]] === null) o[ks[i]] = {};
      o = o[ks[i]];
    }
    const last = ks[ks.length - 1];
    if (v == null) delete o[last]; else o[last] = clone(v);
  };
  const notify = () => {
    const d = read();
    listeners.forEach((l) => l.cb(clone(getAt(d, l.path))));
  };
  const write = (d) => { localStorage.setItem(KEY, JSON.stringify(d)); setTimeout(notify, 0); };
  window.addEventListener('storage', (e) => { if (e.key === KEY) notify(); });

  return {
    mode: 'local',
    watch(path, cb) {
      const l = { path, cb };
      listeners.add(l);
      setTimeout(() => cb(clone(getAt(read(), path))), 0);
      return () => listeners.delete(l);
    },
    async get(path) { return clone(getAt(read(), path)); },
    async set(path, val) { const d = read(); setAt(d, path, val); write(d); },
    async update(path, obj) {
      const d = read();
      for (const [k, v] of Object.entries(obj)) setAt(d, `${path}/${k}`, v);
      write(d);
    },
    async remove(path) { const d = read(); setAt(d, path, null); write(d); },
    async transaction(path, fn) {
      const d = read();
      const res = fn(clone(getAt(d, path)));
      if (res === undefined) return false;
      setAt(d, path, res);
      write(d);
      return true;
    },
    onConnection(cb) { cb(true); return () => {}; },
  };
}
