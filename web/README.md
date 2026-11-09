# Todap web

Mobil öncelikli PWA arayüzü. Vite, React, TypeScript ve Tailwind kullanır.

## Geliştirme

API sunucusu `http://localhost:3000` adresinde çalışmalıdır (bkz. [server/](../server/)). Vite, `/api` isteklerini bu adrese yönlendirir.

```bash
cd web
npm install
npm run dev        # http://localhost:5173
```

Farklı bir API adresi için `API_PROXY_TARGET` ortam değişkenini kullanın.

## Kontrol

```bash
npm run build      # tip denetimi + üretim derlemesi (PWA dosyaları dist/ içine yazılır)
npm run lint
npm run preview    # üretim derlemesini yerelde açar
```

## Kapsam

Bu aşamada giriş ekranı, API istemcisi, sekme çubuğu (ekip sekmeleri üyeliğe göre gelir) ve PWA ayarları vardır. Sekmelerin içerikleri sonraki aşamalarda eklenecek; bkz. [docs/ROADMAP-2026-11-09.md](../docs/ROADMAP-2026-11-09.md).
