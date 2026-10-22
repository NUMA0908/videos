import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FRAMEDATA_END, FRAMEDATA_START, frameDataMarkdown } from "../src/data/frameDataDoc";

describe("documentación", () => {
  it("DESIGN.md tiene la frame data al día (npm run framedata)", () => {
    const doc = readFileSync("DESIGN.md", "utf8");
    const start = doc.indexOf(FRAMEDATA_START);
    const end = doc.indexOf(FRAMEDATA_END);
    expect(start).toBeGreaterThan(0);
    expect(doc.slice(start + FRAMEDATA_START.length, end).trim()).toBe(frameDataMarkdown().trim());
  });
});
