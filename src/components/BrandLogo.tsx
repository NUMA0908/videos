import React from "react";
import { Img } from "remotion";
import { brandFile, type Brand } from "../brands/types";
import { MissingAsset } from "./MissingAsset";

export const BrandLogo: React.FC<{ brand: Brand; size?: number }> = ({
  brand,
  size = 280,
}) =>
  brand.logo ? (
    <Img
      src={brandFile(brand, brand.logo)}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  ) : (
    <MissingAsset
      label={`LOGO ${brand.name.toUpperCase()}`}
      expectedPath={`${brand.id}/logo/${brand.id}-logo.png`}
      style={{ width: size * 1.8, height: size }}
    />
  );
