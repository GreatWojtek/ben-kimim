# 🎭 Mert Şimşekçakan'ın Oyunu — Sınıf oyunu

Herkes bir insan ismi yazar, sistem isimleri rastgele dağıtır (kimse kendi yazdığını almaz). Herkes başkalarının karakterlerini görür ama kendininkini göremez. Sorular sorulur, notlar alınır, bilen **Buldum!**'a basar.

Oyun 3 aşamadan oluşur ve aşamaları oda kurucusu ilerletir:
1. **Lobi** — herkes oda koduyla katılır, kurucu **Başlat**'a basar.
2. **İsim yazma** — herkes bir isim yazar. Herkes yazınca kurucu **Oyunu başlat**'a basar, isimler rastgele dağıtılır.
3. **Oyun** — tur sistemi yok, canlı soru sorulur. Notlar (sorular + Evet/Hayır/Belki) her öğrencinin kendi cihazında, her oyun için ayrı saklanır.

Kurucu oyuncu çıkarabilir ve menüden **Yeni oyun** ile lobiye dönebilir.

Site tamamen statik (HTML/CSS/JS). Canlı senkronizasyon için **Firebase Realtime Database** (ücretsiz Spark planı), yayın için **Netlify** (ücretsiz) kullanılır.

---

## 1) Firebase kurulumu (bir kere, ~5 dk)

1. https://console.firebase.google.com → **Proje ekle** → bir isim ver (ör. `ben-kimim`). Google Analytics'i kapatabilirsin.
2. Sol menü → **Databases and storage → Realtime Database** (eski arayüzde **Build** altında) → **Veritabanı oluştur** → konum: `europe-west1` → **Kilitli modda başlat**.
3. Açılan sayfada **Kurallar (Rules)** sekmesine geç, içeriği silip `database.rules.json` dosyasındakini yapıştır → **Yayınla**.
4. Proje ayarları (sol üstteki ⚙️) → **Genel** → en altta **Uygulamalarınız** → `</>` (Web) simgesi → bir takma ad ver → **Kaydet**. Hosting kutusunu işaretleme.
5. Gösterilen `firebaseConfig = { ... }` nesnesini kopyala ve `firebase-config.js` dosyasında `export const firebaseConfig = null;` satırını şuna çevir:

   ```js
   export const firebaseConfig = {
     apiKey: "...",
     authDomain: "...",
     databaseURL: "https://....firebasedatabase.app",
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
   };
   ```

   `databaseURL` satırı olmalı. Yoksa Realtime Database sayfasının üstündeki adresi (`https://...firebasedatabase.app`) elle ekle.

> Bu anahtarlar gizli değildir, web sitelerinde herkese açık olmaları normaldir. Erişimi kurallar dosyası sınırlar.

## 2) Netlify'da yayınlama (ücretsiz)

**En kolayı (sürükle-bırak):**
1. https://app.netlify.com/drop adresine git (ücretsiz hesapla giriş yap).
2. `ben-kimim` klasörünün tamamını sayfaya sürükle.
3. Netlify sana `https://rastgele-isim.netlify.app` gibi bir adres verir. **Site configuration → Change site name** ile ör. `ben-kimim-9a` yapabilirsin.

Güncelleme yapınca: Site → **Deploys** → klasörü yeniden sürükle.

**Alternatif:** Klasörü bir GitHub deposuna koyup Netlify'da "Import from Git" seçersen her push'ta otomatik yayınlanır (build komutu boş, publish directory `.`).

## 3) Sınıfta oynama

1. Öğretmen/bir öğrenci siteyi açar, adını yazıp **Yeni oda kur**'a basar.
2. Üstteki oda koduna tıklayınca kod tahtaya yansıtılacak kadar büyük görünür. Diğerleri siteye girip adını ve kodu yazarak katılır.
3. Herkes gelince kurucu **Başlat: İsim yazmaya geç**'e basar.
4. Herkes bir isim yazıp **Gönder**'e basar (🎲 ile öneri alınabilir). Kimin ne yazdığı oyun başlayana kadar görünmez.
5. Herkes yazınca kurucu **Oyunu başlat**'a basar. Yazmayan biri varsa kurucu onu × ile çıkarabilir.
6. Sorular sorulur, cevaplar **Notlarım**'a eklenir. Bilen **Buldum!**'a basar, karakteri ona da açılır, herkeste "✓ Buldu" görünür.
7. Yeni oyun için kurucu menüden **Yeni oyun (lobiye dön)**'ü seçer.

Sayfa yenilense ya da telefon kilitlense bile aynı cihazdan aynı odaya geri dönülür. Farklı cihazdan aynı isimle girince "o oyuncu sen misin?" diye sorar.

## Yerelde deneme

`firebase-config.js` `null` iken site **demo modunda** çalışır: veriler sadece aynı tarayıcının sekmeleri arasında paylaşılır.

```bash
python3 -m http.server 8000
```
Sonra http://localhost:8000 adresini aç. Dosyayı çift tıklayıp açmak çalışmaz, çünkü JS modülleri bir sunucu ister.

## Notlar
- Firebase ücretsiz planı aynı anda 100 bağlantı ve 1 GB veri sağlar. Bir sınıf için fazlasıyla yeterli.
- Teknik bilgisi olan biri tarayıcı geliştirici araçlarıyla kendi karakterini görebilir. Sınıf oyunu için bu kabul edilebilir.
