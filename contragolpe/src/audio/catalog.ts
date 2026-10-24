/**
 * Catálogo de sonidos del juego: nombres, cuántas variantes conviene tener y qué debe sonar.
 * Lo usan el motor de audio (`Audio.ts`) y el generador de ASSETS_NEEDED.md (`npm run assets`).
 * Sin dependencias de Vite ni del DOM, para poder usarlo desde los scripts.
 */
export type SfxName =
  | "swingPunchL"
  | "swingPunchH"
  | "swingKickL"
  | "swingKickH"
  | "swingSpecial"
  | "hitPunchL"
  | "hitPunchH"
  | "hitKickL"
  | "hitKickH"
  | "hitSpecial"
  | "hitSuper"
  | "counter"
  | "block"
  | "blockHeavy"
  | "parry"
  | "redParry"
  | "parryFail"
  | "projectile"
  | "clash"
  | "super"
  | "ko"
  | "jump"
  | "land"
  | "dash"
  | "throw"
  | "throwHit"
  | "tech"
  | "knockdown"
  | "round"
  | "fight"
  | "win"
  | "select"
  | "confirm"
  | "back"
  // Nombres antiguos (equivalen a otros: no tienen archivo propio).
  | "hitLight"
  | "hitHeavy"
  | "whiffLight"
  | "whiffHeavy";

export type AliasName = "hitLight" | "hitHeavy" | "whiffLight" | "whiffHeavy";

/** Voces cortas por personaje (solo con archivos: no se sintetizan voces). */
export type VoiceName = "attack" | "heavy" | "special" | "super" | "hurt" | "ko" | "win";

export interface SoundSpec {
  /** Variantes recomendadas (el juego usa las que haya: 1 o más). */
  variants: number;
  group: "Golpes: swing" | "Golpes: impacto" | "Defensa" | "Movimiento" | "Especiales y súper" | "Ronda" | "Menús";
  desc: string;
}

export const SFX_CATALOG: Record<Exclude<SfxName, AliasName>, SoundSpec> = {
  swingPunchL: { variants: 4, group: "Golpes: swing", desc: "Silbido corto de un puño ligero (suena al lanzarlo, conecte o no)" },
  swingPunchH: { variants: 4, group: "Golpes: swing", desc: "Silbido de un puño fuerte: más aire y más grave" },
  swingKickL: { variants: 4, group: "Golpes: swing", desc: "Silbido de una patada ligera" },
  swingKickH: { variants: 4, group: "Golpes: swing", desc: "Silbido largo y grave de una patada fuerte" },
  swingSpecial: { variants: 3, group: "Golpes: swing", desc: "Silbido con energía (especiales con puño o patada)" },
  hitPunchL: { variants: 4, group: "Golpes: impacto", desc: "Impacto seco de puño ligero" },
  hitPunchH: { variants: 4, group: "Golpes: impacto", desc: "Impacto pesado de puño fuerte, con cuerpo" },
  hitKickL: { variants: 4, group: "Golpes: impacto", desc: "Impacto de patada ligera (más 'carnoso' que el puño)" },
  hitKickH: { variants: 4, group: "Golpes: impacto", desc: "Impacto grave de patada fuerte" },
  hitSpecial: { variants: 3, group: "Golpes: impacto", desc: "Impacto de especial o proyectil: golpe + chasquido de energía" },
  hitSuper: { variants: 3, group: "Golpes: impacto", desc: "Impacto de cada golpe de la súper (grande, con cola)" },
  counter: { variants: 1, group: "Golpes: impacto", desc: "Campanita del counter hit (se suma al impacto)" },
  block: { variants: 4, group: "Defensa", desc: "Golpe ligero bloqueado: sordo y apagado" },
  blockHeavy: { variants: 3, group: "Defensa", desc: "Golpe fuerte o especial bloqueado" },
  parry: { variants: 3, group: "Defensa", desc: "Parry: 'ting' metálico agudo e inconfundible" },
  redParry: { variants: 1, group: "Defensa", desc: "Red parry: como el parry pero más grave" },
  parryFail: { variants: 1, group: "Defensa", desc: "Parry fallado: nota corta descendente" },
  tech: { variants: 1, group: "Defensa", desc: "Escape de agarre" },
  throw: { variants: 1, group: "Defensa", desc: "Agarre que conecta (agarrón de ropa)" },
  throwHit: { variants: 3, group: "Defensa", desc: "Caída al suelo tras un agarre" },
  jump: { variants: 3, group: "Movimiento", desc: "Despegue del salto (suave)" },
  land: { variants: 3, group: "Movimiento", desc: "Aterrizaje (pasos)" },
  dash: { variants: 3, group: "Movimiento", desc: "Dash (arrastre rápido)" },
  knockdown: { variants: 3, group: "Movimiento", desc: "Cuerpo que cae al suelo (derribo)" },
  projectile: { variants: 3, group: "Especiales y súper", desc: "Lanzamiento de proyectil" },
  clash: { variants: 1, group: "Especiales y súper", desc: "Dos proyectiles que se anulan" },
  super: { variants: 1, group: "Especiales y súper", desc: "Inicio de la súper (pantalla congelada): barrido largo" },
  ko: { variants: 1, group: "Ronda", desc: "KO: estruendo grave con eco (debe destacar sobre la música)" },
  round: { variants: 1, group: "Ronda", desc: "Anuncio de ronda (gong/acorde)" },
  fight: { variants: 1, group: "Ronda", desc: "¡A pelear!" },
  win: { variants: 1, group: "Ronda", desc: "Fanfarria de ronda ganada" },
  select: { variants: 1, group: "Menús", desc: "Mover el cursor" },
  confirm: { variants: 1, group: "Menús", desc: "Aceptar" },
  back: { variants: 1, group: "Menús", desc: "Volver / cancelar" },
};

export const VOICE_CATALOG: Record<VoiceName, SoundSpec> = {
  attack: { variants: 3, group: "Golpes: swing", desc: "Exhalación corta al lanzar un ligero (suena el 12 % de las veces)" },
  heavy: { variants: 3, group: "Golpes: swing", desc: "Grito corto de esfuerzo en un golpe fuerte (35 %)" },
  special: { variants: 3, group: "Especiales y súper", desc: "Grito del especial (60 %)" },
  super: { variants: 1, group: "Especiales y súper", desc: "Frase/grito de la súper (siempre)" },
  hurt: { variants: 3, group: "Golpes: impacto", desc: "Queja al recibir un golpe fuerte (50 %)" },
  ko: { variants: 2, group: "Ronda", desc: "Grito de KO" },
  win: { variants: 2, group: "Ronda", desc: "Frase de victoria" },
};

/** Pistas de música en bucle (una por escenario + menú). */
export const MUSIC_CATALOG: Record<string, string> = {
  menu: "Menús (bucle tranquilo)",
  muelle: "Muelle al Atardecer: aire de merengue, güira constante",
  azotea: "Azotea Neón: synthwave",
  plaza: "Plaza Colonial: guitarra arpegiada, fiesta",
};
