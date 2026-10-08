import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Brand, Gradient } from "../brands/types";

// Fondo con degradado de marca; el ángulo gira lentamente para dar vida.
export const BrandBackground: React.FC<{
  brand: Brand;
  gradient?: Gradient; // por defecto brand.gradients.main
  angle?: number;
  drift?: number; // grados que gira el degradado durante la composición/Sequence
  children?: React.ReactNode;
}> = ({ brand, gradient = brand.gradients.main, angle = 160, drift = 30, children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const current = interpolate(frame, [0, durationInFrames], [angle, angle + drift]);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${current}deg, ${gradient.from}, ${gradient.to})`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
