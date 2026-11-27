// Mert Şimşekçakan'a hakaret içeren isimleri yakalar.
//
// Mantık "izin listesi" üzerine kurulu: İçinde "Mert" (ya da M.Ş. baş harfleri) geçen bir
// isim, ancak geri kalan her parçası gerçek bir ad/soyad ya da tek harflik baş harf ise
// kabul edilir. "mertsken", "mrtskn", "Mert XYZ" gibi listede olmayan her ek reddedilir.
// Soyadı (Şimşekçakan) da sadece doğru yazımıyla kabul edilir.
// Yazım hileleri normalleştirilir: Türkçe karakterler, büyük/küçük harf, sayı/simgeler (m3rt, $ik),
// Kiril benzeri harfler (е, о, а…), tekrar eden harfler (meeert), harf aralarına boşluk/nokta
// koyma (m.e.r.t), "rn" → "m" ve ters yazım (trem).

const LEET = {
  0: 'o', 1: 'i', 2: 'z', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', 9: 'g',
  '@': 'a', '$': 's', '!': 'i', '|': 'i', '€': 'e', '£': 'l', '+': 't', '¢': 'c', '¥': 'y', '#': 'h',
};
// Latin harflere benzeyen Kiril / Yunan harfleri
const HOMO = {
  'а': 'a', 'в': 'b', 'е': 'e', 'ё': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c',
  'т': 't', 'у': 'y', 'х': 'x', 'і': 'i', 'ї': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ӏ': 'l', 'ɡ': 'g',
  'α': 'a', 'β': 'b', 'ε': 'e', 'η': 'n', 'ι': 'i', 'κ': 'k', 'μ': 'm', 'ν': 'v', 'ο': 'o', 'ρ': 'p',
  'τ': 't', 'υ': 'u', 'χ': 'x', 'ѵ': 'v', 'ь': 'b', 'п': 'n', 'г': 'r', 'и': 'u', 'д': 'd', 'л': 'l',
};

// "Mert" geçen isimlerde, Mert'in yanında durabilecek gerçek ad ve soyadlar.
const NAMES = new Set(`
  simsekcakan can kan han cem ali efe emir ege arda kaan deniz eren berk baris burak emre enes kerem
  yusuf omer umut onur ozan alp alper batu bora cagan cagri doruk eray erdem ertugrul furkan hakan
  halil ibrahim ismail kemal kaya mehmet ahmet mustafa murat oguz oguzhan orhan osman salih selim serkan
  sinan tolga tuna tunahan ufuk ugur volkan yigit yasin yunus zafer taha hamza harun hasan huseyin
  ilker kadir kagan koray levent mete metin necati nihat oktay recep riza sahin sefa semih serdar
  sami taylan tayfun tunc turgut umit yavuz yilmaz demir celik yildiz yildirim ozturk aydin ozdemir
  arslan aslan dogan kilic cetin kara koc kurt ozkan polat ozcan korkmaz cakir erdogan acar sen
  akin aksoy aktas aydogan bulut ceylan cinar coskun duman durmaz erdem gunes guler gunduz isik kaplan
  karaca karakus kartal keskin kocak kose kucuk ozer ozgur ozyurt pekmez sari savas seker simsir
  tas tekin toprak tuncer turan tutar uysal uzun yalcin yaman yazici yesil yuksel zengin akbas akdag
  akgul akyol altun altin atalay avci baysal bayram bozkurt budak cakmak catal ciftci colak dag
  demirci dinc duru eker ekinci erol ersoy gok gul gurbuz guven inan kahraman kalkan karaman kocabas
  kutlu metin ocak oral ozbek ozen ozkaya ozkul ozmen parlak sezer soylu sonmez tan tasdemir temel
  tok turk ucar unal unlu yagiz yasar yener yurt yurdakul gunok muldur firat yazicioglu yandas
  ramazan aras atlas ayaz cinar ekin kuzey mirac poyraz rüzgar ruzgar ozgun eymen miran demirhan
  baran bartu batuhan berkay berkan bilal bugra caner cengiz emin erkan ersin fatih gokhan gokay
  hakki halit ilhan kaan kerim mahir mert nazim nuri onder ozgur rasit resat sadik sarp sedat
  selcuk sercan sertac tamer tarik teoman tevfik yalin yekta yusuf zeki ahmetcan alican aliemir
  efecan emircan erencan kaancan mertcan mertkan merthan mertali mertefe
  keles kilinc gunay gunes kalayci karadag karatas bilgin bilgic tekin sonmez ozdag ozkok cicek ekici
  erbas erkol eser ozsoy sari sarac sezgin taskin tatli tekeli ulusoy yaldiz yazar yucel yuce zorlu
  akkaya akman alkan altay arikan aslanoglu bas basaran bektas bostan bozdag cevik cinar dagdelen
  demirtas dikmen dogru ergun erkoc gok gokce gulec gumus guzel hacioglu ince kocaman koksal kurtulus
  oz ozel ozkan ozturkmen sahan sener simsek soylu sahin turkmen tuzun uslu yalin yanik yildizhan
`.trim().split(/\s+/));

const SURNAME_ALLOWED = new Set(['simsekcakan', 'mertsimsekcakan', 'simsekcakanmert', 'msimsekcakan', 'mscakan']);
const SURNAME_STEMS = ['cakan', 'simsek', 'smsk', 'cakn', 'ckan', 'simsk', 'smsek', 'semsek', 'simsak', 'sumsek', 'ckn'];
const MERT_STEMS = /mert|mret|mrt|emrt|mertt/;
const INITIAL_TOKENS = new Set(['ms', 'msc', 'mc', 'mşc']); // M.Ş., M.Ş.Ç.

// Mert geçmese bile her yerde yasak ağır küfürler.
const PROFANITY_ANYWHERE = [
  'orospu', 'oruspu', 'orosbu', 'amcik', 'amina', 'yarrak', 'yarak', 'pezevenk', 'kahpe', 'gavat',
  'siktir', 'sikis', 'sikik', 'sikim', 'sikem', 'sikiy', 'gotveren', 'piclik', 'yavsak', 'kaltak',
  'fahise', 'fuck', 'bitch', 'ibne', 'serefsiz', 'pust', 'dalyarak', 'tasak', 'amk', 'amq',
];
const PROFANITY_TOKENS = new Set(['sik', 'sk', 'skm', 'skrm', 'skim', 'mk', 'aq', 'oc', 'sg', 'got', 'pic', 'amk']);

function collapse(s) { return s.replace(/(.)\1+/g, '$1'); }

function prep(text, rnToM = false) {
  let t = String(text || '').toLocaleLowerCase('tr');
  t = [...t].map((c) => HOMO[c] ?? c).join('').replace(/ı/g, 'i');
  t = t.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  t = [...t].map((c) => LEET[c] ?? c).join('');
  if (rnToM) t = t.replace(/rn/g, 'm').replace(/nn/g, 'm');
  let tokens = t.split(/[^a-z]+/).filter(Boolean);
  // "m e r t" / "m.e.r.t" gibi tek harflik parçaları birleştir
  const merged = [];
  let buf = '';
  for (const tok of tokens) {
    if (tok.length === 1) { buf += tok; continue; }
    if (buf) { merged.push(buf); buf = ''; }
    merged.push(tok);
  }
  if (buf) merged.push(buf);
  tokens = merged.map(collapse);
  return { tokens, joined: collapse(tokens.join('')) };
}

function hasProfanity({ tokens, joined }) {
  if (PROFANITY_ANYWHERE.some((w) => joined.includes(w))) return true;
  return tokens.some((t) => PROFANITY_TOKENS.has(t) || /^s[iy]?k[iy]?(m|s|t|e|i)/.test(t) && !NAMES.has(t));
}

function isSurnameAbuse({ tokens, joined }) {
  const all = [joined, ...tokens];
  const touches = all.some((s) => SURNAME_STEMS.some((st) => s.includes(st)));
  if (!touches) return false;
  // Sadece doğru yazılmış soyad (ve isteğe bağlı "Mert") kabul edilir
  const rest = tokens.filter((t) => t !== 'mert' && t !== 'm');
  return !(rest.length === 1 && SURNAME_ALLOWED.has(rest[0])) && !SURNAME_ALLOWED.has(joined);
}

function isMertAbuse({ tokens, joined }) {
  const mertTokens = tokens.filter((t) => MERT_STEMS.test(t) || INITIAL_TOKENS.has(t));
  if (mertTokens.length) {
    for (const t of tokens) {
      if (INITIAL_TOKENS.has(t)) continue;
      if (MERT_STEMS.test(t)) {
        // "mertcan" gibi bitişik ekler sadece listedeyse geçer
        if (NAMES.has(t)) continue;
        const pieces = t.split(MERT_STEMS).filter(Boolean);
        if (pieces.some((p) => !NAMES.has(p))) return true;
        continue;
      }
      if (t.length === 1) continue;           // baş harf: "Mert S."
      if (t === 'sc') continue;               // "Mert Ş.Ç."
      if (!NAMES.has(t)) return true;         // listede olmayan her kelime
    }
    return false;
  }
  // "Mert" sadece kelimeler birleşince çıkıyorsa ("mer tsken"), tüm kelimeler gerçek isim olmalı (ör. "Ömer Tekin")
  if (MERT_STEMS.test(joined)) return tokens.some((t) => !NAMES.has(t) && t.length > 1 && !COMMON_FIRST.has(t));
  return false;
}

// "Ömer Tekin", "Emre Tunç" gibi birleşince "mert" içeren normal isimler için ek ilk adlar
const COMMON_FIRST = new Set(`
  omer emre kemer ahmet mehmet ayse fatma zeynep elif merve ece ebru esra seda selin melis melike
  irem ipek buse busra damla derya gizem gamze hilal kubra nur sena sevgi sude tugba yagmur ozge
  emine hatice tunc tunca tekin tan tarkan
`.trim().split(/\s+/));

function reversedAbuse({ joined }) {
  const r = [...joined].reverse().join('');
  return !joined.includes('mert') && (r.includes('mert') || r.includes('cakan') || r.includes('simsek'));
}

export function isOffensive(text) {
  for (const rn of [false, true]) {
    const p = prep(text, rn);
    if (!p.joined) continue;
    if (hasProfanity(p) || isSurnameAbuse(p) || isMertAbuse(p) || reversedAbuse(p)) return true;
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
