# IPTV Player - Lokal Test Kılavuzu

## 🚀 Başlangıç Adımları

### 1. TMDB API Key Almak

1. **TMDB'ye kaydolun (ücretsiz):**
   - https://www.themoviedb.org/settings/api adresine git
   - Ücretsiz API key iste
   - API key'ni kopyala

2. **`.env` dosyasını düzenle:**
   ```bash
   cp .env.example .env
   # Metin editörüyle aç ve TMDB_API_KEY'i doldur
   ```

### 2. Backend'i Başlat

```bash
cd server

# Bağımlılıkları yükle
npm install

# TypeScript'i derle
npm run build

# Development modunda başla (otomatik metadata enrichment başlayacak)
npm run start:dev
```

**Beklenen çıktı:**
```
[Nest] 12345 - 08/04/2026, 23:10:00 - LOG [CatalogService] Starting background metadata enrichment...
[Nest] 12345 - 08/04/2026, 23:10:00 - LOG [CatalogService] Found 150 movies, enriching metadata...
[Nest] 12345 - 08/04/2026, 23:10:05 - DEBUG [CatalogService] ✓ Enriched movie: Movie Title (2023)
```

### 3. Frontend'i Başlat (Farklı Terminal Penceresinde)

```bash
cd ../client

# Bağımlılıkları yükle
npm install

# Development sunucusu başlat
npm run dev
```

---

## 🧪 API Test Etme

### 1. Basit Arama

```bash
# Tüm filmler
curl "http://localhost:3001/api/movies"

# İsme göre ara
curl "http://localhost:3001/api/movies?query=Avatar"

# Sayfala
curl "http://localhost:3001/api/movies?offset=0&limit=20"
```

### 2. Metadata Filtrelemesi

```bash
# Belirli yıldaki filmler
curl "http://localhost:3001/api/movies?year=2023"

# Türe göre filtrele
curl "http://localhost:3001/api/movies?genre=Action"

# Oyuncu adına göre filtrele
curl "http://localhost:3001/api/movies?actor=Tom%20Hanks"

# Yönetmene göre filtrele
curl "http://localhost:3001/api/movies?director=Steven%20Spielberg"

# TMDB rating'e göre (5.0 - 8.5 arası)
curl "http://localhost:3001/api/movies?minRating=5.0&maxRating=8.5"

# IMDB score'a göre (7.5 - 10 arası)
curl "http://localhost:3001/api/movies?minImdbScore=7.5&maxImdbScore=10"
```

### 3. Kombinasyon Filtereleri

```bash
# Yönetmen + IMDB skoru kombinasyonu
curl "http://localhost:3001/api/movies?director=Steven%20Spielberg&minImdbScore=8.0"

# Oyuncu + Yıl + TMDB Rating kombinasyonu
curl "http://localhost:3001/api/movies?actor=Tom%20Hanks&year=2023&minRating=7.0"

# Tür + IMDB score
curl "http://localhost:3001/api/movies?genre=Drama&minImdbScore=8.5"
```

### 4. Filter Options Endpoint'i (Dropdown Verileri)

```bash
# Mevcut tüm filmeler için filtre seçeneklerini al
curl "http://localhost:3001/api/movies/filter-options"

# Çıktı örneği:
{
  "years": [2024, 2023, 2022, 2021],
  "genres": ["Action", "Comedy", "Drama", "Horror"],
  "actors": ["Actor Name 1", "Actor Name 2", ...],
  "directors": ["Director Name 1", ...],
  "ratingRange": { "min": 5.2, "max": 9.8 },
  "imdbScoreRange": { "min": 6.5, "max": 9.9 }
}
```

### 5. Film/Series Detail'i

```bash
# Film metadata'sını al
curl "http://localhost:3001/api/movies/{movieId}"

# Series metadata'sını al (oyuncular, yönetmenler, vs)
curl "http://localhost:3001/api/series/{seriesId}"
```

---

## 🗄️ Database'i İncelemek

### SQLite Database'ini Sorgulamak

```bash
# Metadata database'ine erişim
sqlite3 ./data/metadata.db

# Veya alternatif olarak (Visual Studio Code extension)
# Extension: SQLite
```

### Yararlı SQL Sorguları

```sql
-- Film metadatası tablosunu kontrol et
SELECT id, movieId, title, year, rating, imdbScore FROM movie_metadata LIMIT 10;

-- IMDB score'u olan filmler
SELECT title, rating, imdbScore FROM movie_metadata WHERE imdbScore IS NOT NULL LIMIT 10;

-- Yıllanmış filmler
SELECT title, year FROM movie_metadata WHERE year IS NOT NULL ORDER BY year DESC;

-- Oyuncu listesi
SELECT DISTINCT actorName FROM movie_cast ORDER BY actorName LIMIT 20;

-- Yönetmen listesi
SELECT DISTINCT personName FROM movie_crew WHERE role = 'Director' ORDER BY personName LIMIT 20;

-- Tür listesi
SELECT DISTINCT genreName FROM movie_genre ORDER BY genreName;

-- En yüksek IMDB score'a sahip filmler
SELECT title, imdbScore FROM movie_metadata ORDER BY imdbScore DESC LIMIT 10;
```

---

## 📊 Postman ile Test Etme

### Koleksiyon İçeri Aktar

1. **Postman'ı aç**
2. **Import > Link** seç
3. Bu URLi yapıştır:
   ```
   http://localhost:3001/api
   ```

### Örnek Request'ler

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `/movies` | Tüm filmler |
| GET | `/movies?query=Avatar` | Başlık araması |
| GET | `/movies?actor=Tom%20Hanks` | Oyuncu filtrelemesi |
| GET | `/movies?director=Spielberg&minImdbScore=8` | Kombinasyon filtrelemesi |
| GET | `/movies/filter-options` | Mevcut filtre seçenekleri |
| GET | `/movies/{id}` | Film detayı + metadata |

---

## 🐛 Sorun Giderme

### Backend başlamıyor
```bash
# Bağımlılıkları temizle ve yeniden yükle
rm -rf node_modules package-lock.json
npm install

# Build'i temizle ve yeniden derle
rm -rf dist
npm run build
```

### Database'de veri yok
```bash
# Backend log'larını kontrol et - metadata enrichment başlayıp başlamadığını gör
# Log'larda "Starting background metadata enrichment..." yazısı olmalı

# Database dosyasının var olup olmadığını kontrol et
ls -la ./data/metadata.db

# Zorunlu türde TMDB API key'i koy
echo "TMDB_API_KEY=your_key" >> .env
```

### TMDB API hatası
```
Error: TMDB API not configured
# Çözüm: .env dosyasında TMDB_API_KEY'i düzenle ve backend'i yeniden başlat
```

### Rate limiting sorunu
- Backend otomatik olarak TMDB rate limiting'i yönetiyor (25 req/sec)
- Her request arasında 200ms bekliyor
- İlk startup'ta metadata enrichment 5-30 dakika sürebilir (film sayısına bağlı)

---

## ⚙️ Advanced Yapılandırma

### Backend Portunu Değiştir
```bash
# .env dosyasında
PORT=4000

# Veya CLI'dan
PORT=4000 npm run start:dev
```

### Database Yolunu Değiştir
```bash
# .env dosyasında
DATABASE_URL=/var/lib/iptv/metadata.db
```

### Development Modunda Debug Loglama
```bash
# Maksimum detay
DEBUG=* npm run start:dev

# Sadece metadata service'i
DEBUG=*metadata* npm run start:dev
```

---

## 🎯 Test Senaryoları

### Senaryo 1: İlk Startup
1. `.env` ile TMDB key'i yapılandır
2. Backend'i başlat
3. Log'larda enrichment başlayıp başlamadığını kontrol et
4. 30 saniye bekle
5. `http://localhost:3001/api/movies` açarak metadata yüklü filmler gör

### Senaryo 2: Filtreleme
1. `http://localhost:3001/api/movies/filter-options` çağır
2. Dönen oyuncu listesinden birini seç
3. `http://localhost:3001/api/movies?actor=SelectedActor` çağır
4. Sonuçları doğrula

### Senaryo 3: Combined Filtering
1. `/filter-options` endpoint'ini kontrol et
2. Year + Genre + minImdbScore kombinasyonu test et:
   ```bash
   curl "http://localhost:3001/api/movies?year=2023&genre=Action&minImdbScore=8"
   ```

### Senaryo 4: Detail Sayfası
1. Bir film ID'si al
2. `/movies/{id}` endpoint'ini çağır
3. Metadata'da cast, crew, genres, IMDB score var mı kontrol et

---

## 📝 Notlar

- **TMDB API Key**: Ücretsiz ve hızlı kaydolabilir
- **İlk Enrichment**: Filmlerin sayısına bağlı olarak 5-30 dakika sürebilir
- **Database**: `./data/metadata.db` SQLite database'i otomatik oluşturulur
- **Memory**: Pi 3'te çalışmak için optimize edildi
- **Rate Limiting**: TMDB'nin limitini aşmayacak şekilde otomatik yönetiliyor

---

## 🚀 Başarılı Test Göstergeleri

✅ Backend başladığında enrichment başlıyor
✅ `/api/movies` endpoint'i metadata döndürüyor
✅ Filter endpoint'leri çalışıyor
✅ Database'de tablo ve veri oluştu
✅ IMDB score'ları veritabanında kaydedildi

---

## 📞 Destek

Sorun yaşanırsa:
1. Backend log'larını kontrol et
2. `.env` dosyasında TMDB key'i doğrula
3. Database dosyasının varış ve boyutunu kontrol et:
   ```bash
   ls -lh ./data/metadata.db
   ```
4. Network bağlantısını kontrol et (TMDB API'ya ulaşılabilir mi)
