# 🚀 IPTV Player - Hızlı Başlangıç

## 📋 Ön Koşullar

- Node.js 16+ 
- npm veya yarn
- TMDB API Key (ücretsiz): https://www.themoviedb.org/settings/api

## ⚡ 2 Dakika Setup

### 1. TMDB API Key Al
```bash
# https://www.themoviedb.org/settings/api adresine git
# "Create" butonuna tıkla
# API key'i kopyala
```

### 2. .env Dosyasını Düzenle
```bash
cd /path/to/iptv-player
cp .env.example .env

# Düzenle (VS Code, nano, vim vs.)
nano .env
# TMDB_API_KEY=your_key_here

# Kaydet ve çık
```

### 3. Backend'i Başlat
```bash
./test-local.sh
```

Bu komut otomatik olarak:
- ✅ Bağımlılıkları kontrol eder
- ✅ TypeScript'i derler  
- ✅ Backend'i açar
- ✅ Metadata enrichment'i başlatır

---

## 🧪 API Test Etme

### Terminal 1: Backend Çalışıyor

### Terminal 2: API Test Yap

```bash
# 1. Filter seçenekleri (dropdown veri)
curl "http://localhost:3001/api/movies/filter-options" | jq

# 2. Oyuncu araması
curl "http://localhost:3001/api/movies?actor=Tom%20Hanks" | jq

# 3. IMDB score filtrelemesi (7.5+ yüksek puanlı filmler)
curl "http://localhost:3001/api/movies?minImdbScore=7.5" | jq

# 4. Yönetmen + IMDB score
curl "http://localhost:3001/api/movies?director=Spielberg&minImdbScore=8" | jq

# 5. Tür + yıl + IMDB score
curl "http://localhost:3001/api/movies?genre=Drama&year=2023&minImdbScore=7.5" | jq
```

---

## 📊 Database İncelemek

### Terminal 3: SQLite Sorgusu

```bash
cd /path/to/iptv-player

# Database'e bağlan
sqlite3 data/metadata.db

# Oyuncuları listele
> SELECT DISTINCT actorName FROM movie_cast LIMIT 20;

# IMDB score'a göre sırala
> SELECT title, imdbScore FROM movie_metadata WHERE imdbScore IS NOT NULL ORDER BY imdbScore DESC LIMIT 10;

# Yönetmen listesi
> SELECT DISTINCT personName FROM movie_crew WHERE role='Director' LIMIT 10;

# Çıkış
> .quit
```

---

## 🎯 Başarılı Test İşaretleri

✅ Backend başladığında metadata enrichment başlıyor
✅ Log'larda "Found X movies, enriching metadata..." yazısı çıkıyor
✅ `/api/movies/filter-options` JSON döndürüyor
✅ Filmler `imdbScore` ve `rating` bilgisiyle döndürülüyor
✅ Database'de veri biriktiyor (`ls -lh data/metadata.db`)

---

## 🐛 Sorun Giderme

**Backend başlamıyor?**
```bash
# Bağımlılıkları yeniden yükle
cd server
rm -rf node_modules package-lock.json
npm install
npm run build
```

**TMDB key hatalı?**
```bash
# .env dosyasında değişimi yap
nano .env
# Kaydet ve backend'i yeniden başlat
```

**Database boş?**
```bash
# Backend log'larında enrichment devam ediyor mu kontrol et
# Filmlerin sayısına bağlı olarak 5-30 dakika sürebilir

# Database dosyasının boyutunu kontrol et
ls -lh data/metadata.db
```

---

## 📚 Detaylı Rehber

Daha fazla bilgi için bak: `LOCAL_TESTING.md`

---

## 🚀 Frontend (İsteğe Bağlı)

Backend'i başlattıktan sonra farklı bir terminal'de:

```bash
cd client
npm install
npm run dev
# http://localhost:5173 (veya gösterilen port)
```

---

## 🔗 Endpoints Özeti

| Endpoint | Açıklama |
|----------|----------|
| `GET /api/movies` | Tüm filmler (metadata ile) |
| `GET /api/movies?query=Avatar` | İsme göre ara |
| `GET /api/movies?actor=Name` | Oyuncu filtrelemesi |
| `GET /api/movies?director=Name` | Yönetmen filtrelemesi |
| `GET /api/movies?genre=Action` | Tür filtrelemesi |
| `GET /api/movies?year=2023` | Yıl filtrelemesi |
| `GET /api/movies?minImdbScore=8` | IMDB score filtrelemesi |
| `GET /api/movies/filter-options` | Mevcut filtre seçenekleri |
| `GET /api/movies/{id}` | Film detayı + metadata |

---

## ✨ İpuçları

- IMDB score'u TMDB'den otomatik olarak çekilir
- Backend ilk çalıştığında tüm filmler enrichment'e alınır
- Filtreleme API'lar real-time çalışır
- Database Pi 3'te çalışmak için optimize edildi

