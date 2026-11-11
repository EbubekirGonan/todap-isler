import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { config } from "./config.js";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/dist");

createApp(config.isProduction ? { webDir } : {}).listen(config.port, "0.0.0.0", () => {
  console.log(`API çalışıyor: http://localhost:${config.port}`);
});
