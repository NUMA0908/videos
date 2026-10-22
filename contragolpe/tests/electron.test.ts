import { describe, expect, it } from "vitest";
import { CSP, isAllowedUrl } from "../electron/security";

describe("seguridad de la app de escritorio", () => {
  it("la CSP no permite eval ni recursos remotos", () => {
    expect(CSP).not.toContain("unsafe-eval");
    expect(CSP).toContain("default-src 'self'");
    expect(CSP).toContain("script-src 'self'");
    expect(CSP).not.toMatch(/https?:/);
    expect(CSP).toContain("object-src 'none'");
  });

  it("solo se navega al propio juego", () => {
    expect(isAllowedUrl("app://game/index.html", undefined)).toBe(true);
    expect(isAllowedUrl("app://otra/index.html", undefined)).toBe(false);
    expect(isAllowedUrl("https://example.com", undefined)).toBe(false);
    expect(isAllowedUrl("file:///etc/passwd", undefined)).toBe(false);
    expect(isAllowedUrl("http://localhost:5173/", "http://localhost:5173/")).toBe(true);
    expect(isAllowedUrl("http://evil.com/", "http://localhost:5173/")).toBe(false);
    expect(isAllowedUrl("no es una url", undefined)).toBe(false);
  });
});
