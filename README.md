# Todap iş paylaşım uygulaması

Todap derneğinin iç kullanımı için geliştirilen, gönüllülük temelli bir iş paylaşım ve takip aracı. İşler tanımlanır, gönüllüler işleri kendileri üstlenebilir ya da yetkili kişiler tarafından atanabilir. Geciken ve sahipsiz kalan işler görünür kılınır. İlk sürüm, telefonda rahat kullanılabilen mobil öncelikli bir PWA olarak geliştirilecektir.

Proje kapsamı, veri modeli ve iş kuralları için [docs/PROJECT.md](docs/PROJECT.md) dosyasına bak.

Arayüz (PWA) geliştirme adımları için [web/README.md](web/README.md) dosyasına bak.

## Canlı giriş e-postası

Üretimde `NODE_ENV=production` ile birlikte `APP_BASE_URL` uygulamanın gerçek HTTPS adresi, `EMAIL_FROM` doğrulanmış Resend alan adındaki gönderen adresi ve `RESEND_API_KEY` gönderim yetkili API anahtarı olarak yapılandırılmalıdır. Anahtarı yalnızca dağıtım ortamının gizli değişkenlerinde saklayın. Geliştirmede giriş bağlantısı ve kod konsola yazdırılır; Resend kullanılmaz.

Canlıya geçmeden önce ayrı test ortamında giriş bağlantısını, kodu ve e-posta teslimatını doğrulayın. Gönderim hataları sunucu günlüğüne yazılır; giriş isteğinin yanıtı e-posta adresinin kayıtlı olup olmadığını açıklamaz.
