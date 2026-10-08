// Configuración: https://remotion.dev/docs/config
// Cada opción también existe como flag de CLI: https://remotion.dev/docs/cli

import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);

// Para entornos sin acceso a remotion.media (p. ej. CI o sandboxes): usa un
// Chromium ya instalado. Ej.: REMOTION_CHROMIUM=/opt/pw-browsers/chromium npm run render
if (process.env.REMOTION_CHROMIUM) {
  Config.setBrowserExecutable(process.env.REMOTION_CHROMIUM);
  Config.setChromeMode("chrome-for-testing");
}
