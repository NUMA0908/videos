import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { AnimatedText } from "../../../components/AnimatedText";
import { BrandBackground } from "../../../components/BrandBackground";
import { CtaEnd } from "../../../components/CtaEnd";
import { PhoneFrame } from "../../../components/PhoneFrame";
import { seconds } from "../../../studio";
import { cuadrate as brand } from "../brand";

// Anuncio de ejemplo de Cuadrate · 15 s · 9:16.
// Gancho 0–3 s · Problema 3–7 s · App en acción 7–12 s · CTA 12–15 s.
// La escena "app" NO menciona funciones concretas: cuando haya capturas en
// public/cuadrate/screenshots/, ajusta el copy a lo que se vea en ellas.

export type CuadrateEjemploProps = {
  gancho: string;
  problema1: string;
  problema2: string;
  appTitulo: string;
  ctaTitulo: string;
  ctaBoton: string;
  ctaSubtexto: string;
};

export const cuadrateEjemploDefaults: CuadrateEjemploProps = {
  gancho: "¿Todavía llevas\ntu negocio en\nuna libreta?",
  problema1: "Cuentas a mano,\npapelitos por\ntodos lados…",
  problema2: "…y al final del día\nla caja no cuadra.",
  appTitulo: "Con Cuadrate,\ntu negocio en tu celular.",
  ctaTitulo: "¡Cuádrate ya!",
  ctaBoton: "Descarga Cuadrate",
  ctaSubtexto: "Hecha para los pequeños\nnegocios de RD",
};

const SCENES = {
  gancho: { from: 0, durationInFrames: seconds(3) },
  problema: { from: seconds(3), durationInFrames: seconds(4) },
  app: { from: seconds(7), durationInFrames: seconds(5) },
  cta: { from: seconds(12), durationInFrames: seconds(3) },
};

export const CUADRATE_EJEMPLO_DURATION = seconds(15);

const Center: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{ alignItems: "center", justifyContent: "center", gap: 40, padding: 80 }}
  >
    {children}
  </AbsoluteFill>
);

const Gancho: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const dur = SCENES.gancho.durationInFrames;
  const zoom = interpolate(frame, [0, dur], [1, 1.08]);
  return (
    <Center>
      <div style={{ transform: `scale(${zoom})` }}>
        <AnimatedText brand={brand} text={text} fontSize={110} exitAt={dur - 8} />
      </div>
    </Center>
  );
};

// Papelitos que caen: el desorden de llevar el negocio a mano.
const Papelito: React.FC<{ x: number; delay: number; rotate: number }> = ({
  x,
  delay,
  rotate,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const drop = spring({ frame: frame - delay, fps, config: { damping: 9 } });
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: interpolate(drop, [0, 1], [-300, 1450]),
        width: 220,
        height: 260,
        borderRadius: 8,
        transform: `rotate(${rotate * drop}deg)`,
        boxShadow: `0 20px 40px ${brand.colors.shadow}`,
        backgroundImage: `repeating-linear-gradient(${brand.colors.light} 0 34px, ${brand.colors.muted} 34px 37px)`,
      }}
    />
  );
};

const Problema: React.FC<{ text1: string; text2: string }> = ({ text1, text2 }) => {
  const mid = seconds(2);
  return (
    <BrandBackground brand={brand} gradient={brand.gradients.dark}>
      <Papelito x={60} delay={4} rotate={-18} />
      <Papelito x={420} delay={12} rotate={10} />
      <Papelito x={780} delay={20} rotate={-8} />
      <Center>
        <AnimatedText brand={brand} text={text1} fontSize={92} exitAt={mid - 8} />
      </Center>
      <Sequence from={mid}>
        <Center>
          <AnimatedText brand={brand} text={text2} fontSize={92} highlight />
        </Center>
      </Sequence>
    </BrandBackground>
  );
};

const AppEnAccion: React.FC<{ titulo: string }> = ({ titulo }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame, fps, config: { damping: 15 } });
  const float = Math.sin(frame / 15) * 10;
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 140, gap: 60 }}>
      <AnimatedText
        brand={brand}
        text={titulo}
        fontSize={76}
        exitAt={SCENES.app.durationInFrames - 8}
      />
      <div style={{ transform: `translateY(${(1 - rise) * 900 + float}px)` }}>
        <PhoneFrame
          brand={brand}
          screenshot={brand.screenshots.inicio}
          expectedPath="screenshots/inicio.png"
          height={1300}
        />
      </div>
    </AbsoluteFill>
  );
};

export const CuadrateEjemplo: React.FC<CuadrateEjemploProps> = (props) => (
  <BrandBackground brand={brand}>
    <Sequence name="Gancho" {...SCENES.gancho}>
      <Gancho text={props.gancho} />
    </Sequence>
    <Sequence name="Problema" {...SCENES.problema}>
      <Problema text1={props.problema1} text2={props.problema2} />
    </Sequence>
    <Sequence name="App en acción" {...SCENES.app}>
      <AppEnAccion titulo={props.appTitulo} />
    </Sequence>
    <Sequence name="CTA" {...SCENES.cta}>
      <CtaEnd
        brand={brand}
        headline={props.ctaTitulo}
        buttonText={props.ctaBoton}
        subtext={props.ctaSubtexto}
      />
    </Sequence>
  </BrandBackground>
);
