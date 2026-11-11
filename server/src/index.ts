import { createApp } from "./app.js";
import { config } from "./config.js";

createApp().listen(config.port, () => {
  console.log(`API çalışıyor: http://localhost:${config.port}`);
});
