import React from "react";
import { Img } from "remotion";
import { brandFile, type Brand } from "../brands/types";
import { MissingAsset } from "./MissingAsset";

// Marco de teléfono genérico. `screenshot` es relativo a public/<marca>/;
// si es null se muestra un placeholder con la ruta esperada.
export const PhoneFrame: React.FC<{
  brand: Brand;
  screenshot: string | null;
  expectedPath?: string; // relativo a public/<marca>/, solo para el placeholder
  height?: number;
  style?: React.CSSProperties;
}> = ({
  brand,
  screenshot,
  expectedPath = "screenshots/captura.png",
  height = 1300,
  style,
}) => {
  const width = height * (9 / 19.5);
  const bezel = height * 0.018;
  const radius = height * 0.07;

  return (
    <div
      style={{
        width,
        height,
        padding: bezel,
        borderRadius: radius,
        background: brand.colors.dark,
        boxShadow: `0 40px 80px ${brand.colors.shadow}`,
        boxSizing: "border-box",
        position: "relative",
        ...style,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: radius - bezel,
          overflow: "hidden",
          background: brand.colors.light,
        }}
      >
        {screenshot ? (
          <Img
            src={brandFile(brand, screenshot)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <MissingAsset
            label="CAPTURA"
            expectedPath={`${brand.id}/${expectedPath}`}
            style={{ width: "100%", height: "100%" }}
          />
        )}
      </div>
      {/* Isla / notch */}
      <div
        style={{
          position: "absolute",
          top: bezel * 2,
          left: "50%",
          width: width * 0.3,
          height: height * 0.025,
          borderRadius: 999,
          background: brand.colors.dark,
          transform: "translateX(-50%)",
        }}
      />
    </div>
  );
};
