#!/bin/bash
# Lokal test script - Backend'i hızlı başlat

set -e

echo "🚀 IPTV Player - Lokal Test Başlatıcı"
echo "======================================"
echo ""

# Renk tanımları
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Adım 1: .env kontrolü
echo -e "${BLUE}[1/4]${NC} .env dosyası kontrol ediliyor..."
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env dosyası bulunamadı, .env.example'dan kopyalanıyor...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}⚠️  .env dosyasını düzenle ve TMDB_API_KEY'i ekle!${NC}"
    echo "    https://www.themoviedb.org/settings/api"
    echo ""
    exit 1
fi

# TMDB_API_KEY kontrolü
if grep -q "your_tmdb_api_key_here" .env; then
    echo -e "${YELLOW}⚠️  TMDB_API_KEY henüz yapılandırılmamış!${NC}"
    echo "    .env dosyasını aç ve TMDB_API_KEY'i ekle"
    echo "    https://www.themoviedb.org/settings/api"
    exit 1
fi

echo -e "${GREEN}✓ .env dosyası tamam${NC}"
echo ""

# Adım 2: Backend bağımlılıkları
echo -e "${BLUE}[2/4]${NC} Backend bağımlılıkları kontrol ediliyor..."
cd server

if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install > /dev/null 2>&1
fi

echo -e "${GREEN}✓ Bağımlılıklar yüklü${NC}"
echo ""

# Adım 3: Build kontrolü
echo -e "${BLUE}[3/4]${NC} TypeScript derlemesi yapılıyor..."
npm run build > /dev/null 2>&1
echo -e "${GREEN}✓ Build başarılı${NC}"
echo ""

# Adım 4: Backend başlat
echo -e "${BLUE}[4/4]${NC} Backend başlatılıyor..."
echo ""
echo -e "${GREEN}✓ Server çalışıyor!${NC}"
echo ""
echo "======================================"
echo -e "${BLUE}📍 API Base URL:${NC} http://localhost:3000"
echo ""
echo -e "${YELLOW}Test komutları:${NC}"
echo ""
echo "1. Tüm filmler:"
echo "   curl http://localhost:3000/api/movies"
echo ""
echo "2. Filter seçenekleri:"
echo "   curl http://localhost:3000/api/movies/filter-options"
echo ""
echo "3. Oyuncu araması:"
echo "   curl 'http://localhost:3000/api/movies?actor=Tom%20Hanks'"
echo ""
echo "4. IMDB score filtrelemesi:"
echo "   curl 'http://localhost:3000/api/movies?minImdbScore=8.0&maxImdbScore=9.5'"
echo ""
echo "======================================"
echo -e "${YELLOW}Backend log'larını aşağıda göreceksin...${NC}"
echo "======================================"
echo ""

npm run start:dev
