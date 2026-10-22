/** Fichas de personaje para la pantalla de selección (1..5). */
export const CHAR_STATS: Record<string, { vida: number; velocidad: number; dano: number; alcance: number; dificultad: number; color: string }> = {
  rayo: { vida: 3, velocidad: 3, dano: 3, alcance: 4, dificultad: 2, color: "#46c8ff" },
  chispa: { vida: 2, velocidad: 5, dano: 2, alcance: 2, dificultad: 4, color: "#ffe14a" },
  muralla: { vida: 5, velocidad: 1, dano: 5, alcance: 3, dificultad: 4, color: "#ff8a2a" },
};

/** Consejos de estilo por personaje (pantalla de selección y lista de movimientos). */
export const CHAR_TIPS: Record<string, string[]> = {
  rayo: [
    "Mantén la distancia con la Onda y castiga los saltos con el Puño Ascendente.",
    "Cadena: ↓LK → ↓LK → ↓↘→HP. Jump-in: salto HP → HP → ↓↘→HP.",
    "La Embestida larga atraviesa proyectiles.",
  ],
  chispa: [
    "Pégate al rival: tus normales son los más rápidos del juego.",
    "Mezcla el deslizamiento (bajo) con el Salto de gata (→+HK, alto).",
    "La Rodada atraviesa golpes y proyectiles, pero te pueden agarrar.",
  ],
  muralla: [
    "Bloquea, acércate y agarra: el Abrazo de Oso no se puede escapar.",
    "La Embestida y la patada fuerte encajan un golpe con su armadura.",
    "El Atrapa Cielos agarra a cualquiera que te salte encima.",
  ],
};
