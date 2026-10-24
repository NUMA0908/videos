/** Regenera ASSETS_NEEDED.md (lista de animaciones y sonidos que hay que conseguir) a partir de los datos. */
import { writeFileSync } from "node:fs";
import { assetsMarkdown } from "../src/data/assetsDoc";

writeFileSync(new URL("../ASSETS_NEEDED.md", import.meta.url), assetsMarkdown());
console.log("ASSETS_NEEDED.md actualizado");
