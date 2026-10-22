import { AIR, CROUCH_LEGS, ik, registerPoses, STANCE_LEGS } from "./poses";

/**
 * Poses de ataque por personaje (clave "<personaje>.<pose>").
 * `_w` = anticipación (windup), `_s` = impacto (strike), `_r` = follow-through.
 * Las coordenadas son de manos/tobillos respecto a la cadera; los tests comprueban que la
 * extremidad que golpea cae dentro de la hitbox del movimiento.
 */
const TUCK = { fF: [30, -38] as [number, number], fB: [6, -46] as [number, number] };

registerPoses({
  // ---------------------------------------------------------------- RAYO
  "rayo.jab_w": ik({ torso: 12, head: -6, hF: [34, 50], hB: [26, 58], ...STANCE_LEGS }),
  "rayo.jab_s": ik({ torso: 16, head: -8, hF: [72, 56], hB: [24, 56], fF: [36, -80], fB: [-34, -80] }),
  "rayo.lk_w": ik({ torso: 2, head: -6, hF: [36, 56], hB: [22, 60], fF: [30, -46], fB: [-16, -86] }),
  "rayo.lk_s": ik({ torso: -8, head: -6, hF: [30, 58], hB: [14, 60], fF: [72, -52], fB: [-18, -86] }),
  "rayo.straight_w": ik({ torso: 2, head: -6, hF: [22, 52], hB: [10, 56], fF: [30, -80], fB: [-38, -80] }),
  "rayo.straight_s": ik({ hx: 6, torso: 24, head: -10, hF: [86, 50], hB: [26, 48], fF: [50, -78], fB: [-42, -78] }),
  "rayo.hk_w": ik({ torso: -8, head: -6, hF: [30, 60], hB: [10, 50], fF: [26, -24], fB: [-12, -86] }),
  "rayo.hk_s": ik({ torso: -26, head: -4, hF: [10, 64], hB: [-20, 40], fF: [84, 18], fB: [-12, -86] }),
  "rayo.hk_r": ik({ torso: -14, head: -6, hF: [24, 60], hB: [0, 50], fF: [50, -30], fB: [-12, -86] }),

  "rayo.crlp_w": ik({ torso: 26, head: -12, hF: [40, 34], hB: [32, 42], ...CROUCH_LEGS }),
  "rayo.crlp_s": ik({ torso: 32, head: -14, hF: [70, 30], hB: [34, 40], ...CROUCH_LEGS }),
  "rayo.crlk_w": ik({ torso: 20, head: -12, hF: [46, 36], hB: [32, 42], fF: [30, -40], fB: [-28, -50] }),
  "rayo.crlk_s": ik({ torso: 18, head: -12, hF: [44, 36], hB: [30, 42], fF: [76, -48], fB: [-30, -50] }),
  "rayo.crhp_w": ik({ torso: 22, head: -12, hF: [34, 18], hB: [24, 36], ...CROUCH_LEGS }),
  "rayo.crhp_s": ik({ torso: 0, head: -14, hF: [30, 120], hB: [24, 50], fF: [32, -72], fB: [-28, -76] }),
  "rayo.sweep_w": ik({ torso: 36, head: -10, hF: [40, 10], hB: [10, 20], fF: [30, -40], fB: [-26, -46] }),
  "rayo.sweep_s": ik({ torso: 44, head: -10, hF: [50, -18], hB: [20, -10], fF: [78, -46], fB: [-22, -44] }),

  "rayo.jlp_w": ik({ torso: 14, head: -6, hF: [34, 40], hB: [24, 46], ...TUCK, ...AIR }),
  "rayo.jlp_s": ik({ torso: 22, head: -8, hF: [62, 20], hB: [22, 40], ...TUCK, ...AIR }),
  "rayo.jlk_w": ik({ torso: 10, head: -6, hF: [36, 46], hB: [22, 50], fF: [30, -40], fB: [4, -46], ...AIR }),
  "rayo.jlk_s": ik({ torso: 4, head: -8, hF: [36, 50], hB: [20, 54], fF: [44, -74], fB: [-14, -40], ...AIR }),
  "rayo.jhp_w": ik({ torso: 0, head: -6, hF: [20, 70], hB: [10, 50], ...TUCK, ...AIR }),
  "rayo.jhp_s": ik({ torso: 34, head: -6, hF: [64, -4], hB: [24, 30], ...TUCK, ...AIR }),
  "rayo.jhk_w": ik({ torso: -6, head: -6, hF: [34, 50], hB: [20, 54], fF: [24, -26], fB: [4, -44], ...AIR }),
  "rayo.jhk_s": ik({ torso: -18, head: -4, hF: [24, 58], hB: [4, 50], fF: [82, -36], fB: [-8, -40], ...AIR }),
});
