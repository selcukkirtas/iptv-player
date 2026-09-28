# Metadata Enrichment Feature

Bu özellik, IPTV kütüphanesindeki filmler ve dizileri **TMDB (The Movie Database)** aracılığıyla zenginleştirerek oyuncu, yönetmen, tür, yıl gibi bilgileri ekler.

## Kurulum

### 1. TMDB API Anahtarı Alın

https://www.themoviedb.org/settings/api adresinden ücretsiz bir TMDB hesabı oluşturup API anahtarınızı alın.

### 2. Docker Ortamında

`docker-compose.yml`'de `TMDB_API_KEY` ortam değişkenini ayarlayın:

```yaml
services:
  server:
    environment:
      - TMDB_API_KEY=your_api_key_here
```

Ya da `.env` dosyasında:

```
TMDB_API_KEY=your_api_key_here
```

### 3. Yerel Geliştirmede

Sunucuyu çalıştırmadan önce ortam değişkenini ayarlayın:

```bash
export TMDB_API_KEY=your_api_key_here
cd server
npm run start:dev
```

## API Endpoints

### Film Metadata'sı

#### Metadata Al
```http
GET /api/metadata/movies/{movieId}
```

Yanıt:
```json
{
  "id": 1,
  "movieId": "123",
  "title": "The Matrix",
  "plot": "A hacker is offered...",
  "year": 1999,
  "rating": 8.7,
  "runtime": 136,
  "posterUrl": "https://image.tmdb.org/t/p/w200/...",
  "cast": [
    { "actorName": "Keanu Reeves", "character": "Neo" },
    { "actorName": "Laurence Fishburne", "character": "Morpheus" }
  ],
  "crew": [
    { "personName": "Lana Wachowski", "role": "Director" },
    { "personName": "Lilly Wachowski", "role": "Director" }
  ],
  "genres": [
    { "genreName": "Action" },
    { "genreName": "Sci-Fi" }
  ]
}
```

#### Metadata Enrich Et (On-Demand)
```http
POST /api/metadata/movies/{movieId}/enrich
Content-Type: application/json

{
  "title": "The Matrix",
  "year": 1999
}
```

### Dizi Metadata'sı

#### Metadata Al
```http
GET /api/metadata/series/{seriesId}
```

#### Metadata Enrich Et
```http
POST /api/metadata/series/{seriesId}/enrich
Content-Type: application/json

{
  "title": "Breaking Bad",
  "year": 2008
}
```

### Arama Endpoints

#### Oyuncu ile Film Arama
```http
GET /api/metadata/search/movies/actor?name=Keanu%20Reeves
```

#### Yönetmen ile Film Arama
```http
GET /api/metadata/search/movies/director?name=Lana%20Wachowski
```

#### Tür ile Film Arama
```http
GET /api/metadata/search/movies/genre?name=Action
```

#### Oyuncu ile Dizi Arama
```http
GET /api/metadata/search/series/actor?name=Bryan%20Cranston
```

#### Yönetmen ile Dizi Arama
```http
GET /api/metadata/search/series/director?name=Vince%20Gilligan
```

#### Tür ile Dizi Arama
```http
GET /api/metadata/search/series/genre?name=Drama
```

## Film/Dizi Detaylarında Metadata Gösterme

Film/dizi ayrıntılarını getirirken metadata otomatik olarak eklenir:

```bash
GET /api/movies/123
```

Yanıt artık metadata içerir:

```json
{
  "id": "123",
  "name": "The Matrix",
  "url": "...",
  "ext": "mkv",
  "group": "Action",
  "metadata": {
    "plot": "A hacker is offered...",
    "year": 1999,
    "rating": 8.7,
    "runtime": 136,
    "posterUrl": "...",
    "cast": [...],
    "crew": [...],
    "genres": [...]
  }
}
```

## Veritabanı Yapısı

Metadata SQLite veritabanında (`data/metadata.db`) şu tablolarda saklanır:

- **movie_metadata** - Film bilgileri
- **movie_cast** - Film oyuncuları
- **movie_crew** - Film yönetmen/yapımcı/yazarlar
- **movie_genre** - Film türleri
- **series_metadata** - Dizi bilgileri
- **series_cast** - Dizi oyuncuları
- **series_crew** - Dizi yönetmen/yapımcı/yazarlar
- **series_genre** - Dizi türleri

Docker ortamında bu veritabanı adlı volume (`iptv-data`) üzerinde saklanır, böylece yeniden başlatmalar sonrasında korunur.

## Özellikler

### Pi 3 Dostu
- **Hafif ORM**: TypeORM + SQLite (PostgreSQL'e kıyasla minimal overhead)
- **Rate Limiting**: TMDB API'nin 25 req/sec limitini saygıyla karşılar
- **Lazy Loading**: İstenirse metadata lazily fetch edilir
- **Indexed Queries**: Hızlı actor/director/genre aramaları

### Esnek Entegrasyon
- TMDB API key isteğe bağlıdır - key olmadan app normal çalışır
- Mevcut film/dizi endpoints'leri uyumsuz değişmeden çalışmaya devam eder
- Metadata isteğe bağlı olarak enrich edilir

## TMDB API Rate Limiting

TMDB'nin rate limiti: **40 requests per 10 seconds**

Bu implementasyon:
- Request'leri sırayla işler
- İstek sayacı 1 saniyelik pencereyi takip eder
- Limitin yaklaşması durumunda otomatik olarak beklemeyi ekler

Fazla sayıda film/dizi enrich etmek durumunda, beklemeler artar. Bu normal davranıştır.

## Eksik TMDB API Key Hatası

API key ayarlanmamışsa:

```
TMDB_API_KEY env var is not set. Metadata enrichment disabled.
```

Bu durum normal - app tüm core özellikleri ile çalışmaya devam eder, sadece TMDB metadata enrich özelliği devre dışı kalır.

## Gelecek Geliştirmeler

- [ ] Metadata otomatik sync scheduler
- [ ] İzlenme geçmişine göre recommendation engine
- [ ] Poster resimlerini locale indirme ve caching
- [ ] Multi-language metadata desteği
- [ ] IMDb rating eklemesi
- [ ] Trailer URL'leri ekleme

## Sorun Giderme

### "No TMDB result found"

Film/dizi adı TMDB'de farklı yazılı olabilir. Adı düzeltmeyi deneyin:

```bash
POST /api/metadata/movies/123/enrich
{
  "title": "The Matrix Reloaded",
  "year": 2003
}
```

### Çok yavaş metadata enrich işlemi

TMDB rate limitinden dolayı yavaşsa normal. İstek sayısını azaltmayı ya da daha sonra tekrar denemyi deneyin.

### Veritabanı hataları

Docker'da veritabanı `iptv-data` volume'ünde tutulur. Volume'ü temizlemek için:

```bash
docker compose down -v
```

Sonrasında yeniden başlatın.
