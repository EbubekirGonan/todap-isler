import { createApp } from "./app.js";
import { config } from "./config.js";

// Canlı e-posta sağlayıcısı Faz 8'de bağlanana kadar üretimde giriş e-postası gönderilemez.
if (config.isProduction) {
  console.error("Üretim ortamında e-posta sağlayıcısı henüz yapılandırılmadı; sunucu başlatılmıyor.");
  process.exit(1);
}

createApp().listen(config.port, () => {
  console.log(`API çalışıyor: http://localhost:${config.port}`);
});
