import { isStatus, statusColor } from '../domain/status';

// Cálculos da órbita do painel (legacy/script.js drawOrbits/updatePlanets/paintPlanets),
// sem DOM: o desenho em panel-orbits.ts só aplica o que sai daqui.

/** Achatamento das órbitas: a elipse tem ry = r * ORBIT_TILT. */
export const ORBIT_TILT = 0.42;
const RINGS = 4;
// Ângulo áureo (~137,5°): planetas vizinhos na lista não nascem lado a lado.
const GOLDEN_ANGLE = 2.399;

export interface OrbitPlanet {
  id: string;
  name: string;
}

export interface PlanetNode extends OrbitPlanet {
  r: number;
  ry: number;
  phase: number;
  speed: number;
  size: number;
}

/** Tamanho do desenho: o do elemento, com mínimo de 320 x 280 (sem layout, 860 x 560). */
export function orbitBox(clientWidth: number, clientHeight: number): { W: number; H: number } {
  return { W: Math.max(320, clientWidth || 860), H: Math.max(280, clientHeight || 560) };
}

/** Raio do anel externo: cabe na largura (margem 46) e, achatado, na altura (margem 34). */
export function maxRadius(W: number, H: number): number {
  return Math.min(W / 2 - 46, (H / 2 - 34) / ORBIT_TILT);
}

/** Um planeta por app, distribuídos em 4 anéis pela ordem da lista; o anel de dentro é mais rápido e maior. */
export function planetNodes(planets: readonly OrbitPlanet[], rMax: number): PlanetNode[] {
  return planets.map(({ id, name }, i) => {
    const ring = i % RINGS;
    const r = rMax * (0.34 + ring * 0.22);
    return {
      id,
      name,
      r,
      ry: r * ORBIT_TILT,
      phase: (i * GOLDEN_ANGLE) % (Math.PI * 2),
      speed: 0.32 / (1 + ring * 0.55),
      size: 9.5 + (ring === 0 ? 2.5 : 0),
    };
  });
}

/** Raios distintos (um anel tracejado por raio ocupado). */
export function ringRadii(nodes: readonly Pick<PlanetNode, 'r'>[]): number[] {
  return [...new Set(nodes.map((n) => n.r))];
}

/** Posição do planeta t segundos depois do início da rotação. */
export function planetTransform(
  node: Pick<PlanetNode, 'r' | 'ry' | 'phase' | 'speed'>,
  t: number,
): string {
  const a = node.phase + t * node.speed;
  return `translate(${String(Math.cos(a) * node.r)},${String(Math.sin(a) * node.ry)})`;
}

/**
 * Preenchimento do halo. Stale (sem contato): cinza. Com brilho (escuro, com
 * contato): o gradiente pré-desenhado do status. Senão a cor do status, translúcida.
 */
export function haloFill(status: unknown, opts: { stale: boolean; glow: boolean }): string {
  if (opts.stale) return 'var(--stale)';
  if (opts.glow) return `url(#glow-${isStatus(status) ? status : 'idle'})`;
  return statusColor(status);
}
