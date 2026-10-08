import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { fontStack, type Brand } from "../brands/types";

// Texto con entrada (spring desde abajo) y salida opcional (fade + subida).
// `enterAt` y `exitAt` son frames relativos a la Sequence que lo contiene.
export const AnimatedText: React.FC<{
  brand: Brand;
  text: string;
  enterAt?: number;
  exitAt?: number;
  exitDuration?: number;
  fontSize?: number;
  color?: string; // por defecto brand.colors.light
  highlight?: boolean; // fondo de acento detrás del texto
  weight?: number;
  style?: React.CSSProperties;
}> = ({
  brand,
  text,
  enterAt = 0,
  exitAt,
  exitDuration = 10,
  fontSize = 80,
  color = brand.colors.light,
  highlight = false,
  weight = 800,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame: frame - enterAt, fps, config: { damping: 14 } });
  const exit =
    exitAt === undefined
      ? 0
      : interpolate(frame, [exitAt, exitAt + exitDuration], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

  return (
    <div
      style={{
        fontFamily: fontStack(brand.fonts.heading),
        fontSize,
        fontWeight: weight,
        lineHeight: 1.15,
        textAlign: "center",
        color: highlight ? brand.colors.dark : color,
        background: highlight ? brand.colors.accent : undefined,
        padding: highlight ? "8px 28px" : undefined,
        borderRadius: highlight ? 16 : undefined,
        opacity: enter * (1 - exit),
        transform: `translateY(${(1 - enter) * 60 - exit * 40}px)`,
        whiteSpace: "pre-line",
        ...style,
      }}
    >
      {text}
    </div>
  );
};
