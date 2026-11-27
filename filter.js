// Mert Şimşekçakan'a hakaret içeren isimleri yakalar.
// Türkçe karakterler, sayı/simge ile yazma (m3rt, $ik), tekrar eden harfler (meeert)
// ve boşluk/nokta ile bölme (m e r t) normalleştirilerek kontrol edilir.

const LEET = { 0: 'o', 1: 'i', 2: 'z', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', 9: 'g', '@': 'a', '$': 's', '!': 'i', '|': 'i', '€': 'e', '£': 'l' };

// Soyadının herhangi bir değiştirilmiş hali hakaret sayılır (ör. "topalçakan").
const SURNAME_STEMS = ['cakan', 'simsek', 'smsk', 'cakn', 'simsk'];
const SURNAME_ALLOWED = ['simsekcakan', 'mertsimsekcakan', 'simsekcakanmert', 'msimsekcakan'];

// "Mert" ile birlikte geçince hakaret sayılan kelimeler (içinde geçmesi yeterli).
const BAD_PARTS = [
  'sik', 'amk', 'amq', 'amc', 'amin', 'orospu', 'oruspu', 'orsp', 'yarak', 'yarrak', 'dalyarak', 'pust', 'ibne',
  'gavat', 'kahpe', 'pezevenk', 'gerizekali', 'salak', 'aptal', 'ahmak', 'dangalak', 'embesil', 'mongol',
  'topal', 'sakat', 'ezik', 'cuce', 'sisko', 'domuz', 'kopek', 'esek', 'hayvan', 'cirkin', 'kokar', 'kokus',
  'osur', 'zirt', 'kaka', 'bok', 'gotlek', 'gotver', 'gotu', 'pislik', 'serefsiz', 'oglanci', 'keko', 'lavuk',
  'hiyar', 'angut', 'eben', 'anan', 'anesi', 'anen', 'bacin', 'sokuk', 'sapik', 'sapkin', 'tasak', 'tassak', 'yavsak',
  'yarram', 'kodum', 'piclik', 'kaltak', 'surtuk', 'fahise', 'penis', 'vajina', 'seks', 'sex',
  'dumbass', 'stupid', 'idiot', 'fuck', 'shit', 'bitch', 'loser', 'ucube', 'beyinsiz', 'kafasiz', 'mankafa',
  'odun', 'avanak', 'enayi', 'budala', 'zavalli', 'sagir', 'dilsiz', 'yamuk', 'carpik',
  'noob', 'kusmuk', 'sumuk', 'solucan', 'yengec',
];
// Kısa kelimeler sadece tek başına bir kelime olarak geçerse (ör. "Mert mal"), "Kemal" gibi isimleri yakalamamak için.
const BAD_WORDS = ['mal', 'it', 'got', 'pic', 'oc', 'dal', 'puc', 'gay', 'kro', 'kel', 'kor', 'cop', 'bit', 'pire', 'les', 'nub', 'meme', 'ane'];

function prep(text) {
  let t = String(text || '').toLocaleLowerCase('tr').replace(/ı/g, 'i');
  t = t.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  t = [...t].map((c) => LEET[c] ?? c).join('');
  const collapse = (s) => s.replace(/(.)\1+/g, '$1');
  const tokens = t.split(/[^a-z]+/).filter(Boolean);
  return { joined: collapse(tokens.join('')), tokens: tokens.map(collapse), raw: tokens.join('') };
}

export function isOffensive(text) {
  const { joined, tokens, raw } = prep(text);
  if (!joined) return false;

  // 1) Soyadı oynanmışsa
  if (SURNAME_STEMS.some((s) => joined.includes(s) || raw.includes(s)) && !SURNAME_ALLOWED.includes(joined)) return true;

  // 2) "Mert" + hakaret
  if (joined.includes('mert') || joined.includes('mrt')) {
    const rest = joined.split(/mert|mrt/).join('');
    if (BAD_PARTS.some((w) => rest.includes(w))) return true;
    const restTokens = tokens.flatMap((t) => t.split(/mert|mrt/)).filter(Boolean);
    if (restTokens.some((t) => BAD_WORDS.includes(t)) || BAD_WORDS.includes(rest)) return true;
  }
  return false;
}

const PUNISH = ['Aptalım', 'Salağım', 'Ben Bir Patatesim', 'Beynimi Evde Unuttum', 'Kafam Basmıyor', 'Ben Bir Ördeğim', 'Saksı Kafa'];

// Odada henüz kullanılmayan bir "ceza" ismi verir.
export function punishName(taken = []) {
  const used = new Set(taken.map((n) => n.toLocaleLowerCase('tr')));
  const free = PUNISH.filter((n) => !used.has(n.toLocaleLowerCase('tr')));
  if (free.length) return free[Math.floor(Math.random() * free.length)];
  const base = PUNISH[Math.floor(Math.random() * PUNISH.length)];
  let i = 2;
  while (used.has(`${base} ${i}`.toLocaleLowerCase('tr'))) i++;
  return `${base} ${i}`;
}
