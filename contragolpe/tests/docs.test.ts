import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assetsMarkdown } from "../src/data/assetsDoc";
import { FRAMEDATA_END, FRAMEDATA_START, frameDataMarkdown, moveListMarkdown, MOVELIST_END, MOVELIST_START } from "../src/data/frameDataDoc";

describe("documentación", () => {
  it("DESIGN.md tiene la frame data al día (npm run framedata)", () => {
    const doc = readFileSync("DESIGN.md", "utf8").replace(/\r\n/g, "\n");
    const start = doc.indexOf(FRAMEDATA_START);
    const end = doc.indexOf(FRAMEDATA_END);
    expect(start).toBeGreaterThan(0);
    expect(doc.slice(start + FRAMEDATA_START.length, end).trim()).toBe(frameDataMarkdown().trim());
  });

  it("README.md tiene la lista de movimientos al día (npm run framedata)", () => {
    const doc = readFileSync("README.md", "utf8").replace(/\r\n/g, "\n");
    const start = doc.indexOf(MOVELIST_START);
    const end = doc.indexOf(MOVELIST_END);
    expect(start).toBeGreaterThan(0);
    expect(doc.slice(start + MOVELIST_START.length, end).trim()).toBe(moveListMarkdown().trim());
  });

  it("ASSETS_NEEDED.md está al día con la frame data y el catálogo de audio (npm run assets)", () => {
    const doc = readFileSync("ASSETS_NEEDED.md", "utf8").replace(/\r\n/g, "\n");
    expect(doc).toBe(assetsMarkdown());
  });
});
