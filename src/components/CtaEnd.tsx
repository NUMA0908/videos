import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { fontStack, type Brand } from "../brands/types";
import { AnimatedText } from "./AnimatedText";
import { BrandLogo } from "./BrandLogo";

// Cierre con logo, titular y botón CTA con pulso.
export const CtaEnd: React.FC<{
  brand: Brand;
  headline: string;
  buttonText: string;
  subtext?: string;
  logoSize?: number;
}> = ({ brand, headline, buttonText, subtext, logoSize = 280 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoIn = spring({ frame, fps, config: { damping: 12 } });
  const buttonIn = spring({ frame: frame - 18, fps, config: { damping: 10 } });
  const pulse = 1 + 0.04 * Math.sin(Math.max(0, frame - 35) / 6);
  const glow = interpolate(Math.sin(frame / 6), [-1, 1], [24, 72]);

  return (
    <AbsoluteFill
      style={{ alignItems: "center", justifyContent: "center", gap: 60, padding: 80 }}
    >
      <div style={{ transform: `scale(${logoIn})`, opacity: logoIn }}>
        <BrandLogo brand={brand} size={logoSize} />
      </div>
      <AnimatedText brand={brand} text={headline} enterAt={8} fontSize={84} />
      <div
        style={{
          fontFamily: fontStack(brand.fonts.heading),
          fontSize: 64,
          fontWeight: 900,
          color: brand.colors.dark,
          background: brand.colors.accent,
          padding: "32px 72px",
          borderRadius: 999,
          opacity: buttonIn,
          transform: `scale(${buttonIn * pulse})`,
          boxShadow: `0 0 ${glow}px ${brand.colors.accent}`,
        }}
      >
        {buttonText}
      </div>
      {subtext ? (
        <AnimatedText
          brand={brand}
          text={subtext}
          enterAt={28}
          fontSize={44}
          weight={600}
          color={brand.colors.muted}
        />
      ) : null}
    </AbsoluteFill>
  );
};
