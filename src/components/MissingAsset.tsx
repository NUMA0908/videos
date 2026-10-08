import React from "react";
import { PLACEHOLDER } from "../studio";

// Placeholder deliberadamente llamativo para assets que todavía no existen.
export const MissingAsset: React.FC<{
  label: string;
  expectedPath: string; // ruta completa dentro de public/
  style?: React.CSSProperties;
}> = ({ label, expectedPath, style }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      border: `6px dashed ${PLACEHOLDER.border}`,
      background: `repeating-linear-gradient(45deg, ${PLACEHOLDER.stripeA}, ${PLACEHOLDER.stripeA} 20px, ${PLACEHOLDER.stripeB} 20px, ${PLACEHOLDER.stripeB} 40px)`,
      color: PLACEHOLDER.border,
      fontFamily: "sans-serif",
      fontWeight: 800,
      textAlign: "center",
      padding: 24,
      boxSizing: "border-box",
      ...style,
    }}
  >
    <div style={{ fontSize: 40 }}>FALTA: {label}</div>
    <div style={{ fontSize: 26, color: PLACEHOLDER.text }}>public/{expectedPath}</div>
  </div>
);
