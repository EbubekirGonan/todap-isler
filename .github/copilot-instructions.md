# Todap iş paylaşım uygulaması: Copilot kuralları

Proje bağlamı için önce docs/PROJECT.md dosyasını oku.

## Genel
- Arayüz metinleri Türkçe (cümle düzeni: yalnızca ilk harf büyük).
- Kod yorumları Türkçe. Tablo, alan, değişken ve fonksiyon adları İngilizce.
- Hiçbir şey fiziksel olarak silinmez: ilişkilerde ended_at, görevlerde deleted_at (soft delete).
- Tüm zamanlar timestamptz; arayüzde Europe/Istanbul.
- Kapsam dışına çıkma: docs/PROJECT.md içindeki "MVP kapsamı" dışındaki özellikleri ekleme.

## Teknik
- Backend: Node.js, Express, TypeScript, pg. Migration'lar düz SQL (node-pg-migrate), server/migrations/ altında.
- Frontend: Vite, React, TypeScript, Tailwind, vite-plugin-pwa. Mobile-first.
- SQL: her zaman parametreli sorgu kullan, string birleştirme yok.
- Gizli bilgiler .env dosyasında; koda asla gömme. .env.example güncel kalsın.
- Yetki ve görünürlük kontrolleri tek bir modülde (policy/visibility) toplanır, route'lara dağıtılmaz.

## Çalışma şekli
- Büyük değişiklikten önce kısa bir plan ver, sonra uygula.
- Yeni bağımlılık eklemeden önce neden gerektiğini söyle.
- Her değişiklikten sonra nasıl test edileceğini yaz.