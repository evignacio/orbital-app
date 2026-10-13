import { orbitsByBirth, type Orbit, type OrbitWithApps } from '../domain/orbits';
import { hashId, rng } from '../domain/random';
import type { Status, StatusMap } from '../domain/types';

// Espaço de referência do layout: as posições são calculadas nele e só depois
// reescaladas para a janela, então redimensionar não embaralha os planetas.
export const REF_W = 1280;
export const REF_H = 800;
// Duração da "sucção" ao entrar numa órbita, e quando o véu começa a cobrir.
export const ENTER_MS = 900;
export const VEIL_AT_MS = 720;

// Margens dos candidatos no espaço de referência (a de baixo tem 30 a mais, para a legenda).
const RMX = 110;
const RMY = 104;
const CANDIDATES = 60;

/**
 * Áreas reservadas no espaço de referência, [x, y, raio]: o título, a barra do
 * topo, o botão + e o núcleo da galáxia.
 */
export const RESERVED: readonly (readonly [number, number, number])[] = [
  [170, 40, 150],
  [REF_W - 110, 30, 90],
  [REF_W - 58, REF_H - 58, 110],
  [REF_W / 2, REF_H / 2, Math.min(REF_W, REF_H) * 0.16],
];

export type Point = [number, number];
export type Tone = Status | 'idle';

/** Uma órbita da galáxia com a saúde dela. */
export interface GalaxyOrbit extends OrbitWithApps {
  n: number;
  down: number;
  degraded: number;
  /** Alguma app da órbita já tem status (senão a legenda diz VERIFICANDO). */
  checked: boolean;
}

// As órbitas na ordem em que nasceram (orbitsByBirth), com a saúde de cada uma.
// Contam aplicações como o painel: cada uma em cada ambiente (checkout-api em
// dev e em prd são duas), que é o que o servidor monitora.
export function orbitsData(
  apps: Parameters<typeof orbitsByBirth>[0],
  status: Readonly<StatusMap>,
): GalaxyOrbit[] {
  return orbitsByBirth(apps).map((o) => ({
    ...o,
    n: o.apps.length,
    down: o.apps.filter((a) => status[a.id] === 'unhealthy').length,
    degraded: o.apps.filter((a) => status[a.id] === 'degraded').length,
    checked: o.apps.some((a) => status[a.id] !== undefined),
  }));
}

// Os planetinhas de uma órbita na galáxia: uma amostra, não a contagem (essa vai
// na legenda). Quantos: de 0 a 5 conforme o tamanho da órbita. De que cor: na
// proporção dos status reais, com ao menos um planetinha para cada queda ou
// lentidão que exista, para o problema nunca sumir na amostra.
export function systemTones(
  o: Pick<GalaxyOrbit, 'apps' | 'down' | 'degraded'>,
  status: Readonly<StatusMap>,
): Tone[] {
  const n = o.apps.length;
  const k = n <= 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 7 ? 3 : n <= 14 ? 4 : 5;
  const share = (c: number) => (c ? Math.max(1, Math.round((c / n) * k)) : 0);
  const down = Math.min(k, share(o.down));
  const warn = Math.min(k - down, share(o.degraded));
  const idle = Math.min(
    k - down - warn,
    share(o.apps.filter((a) => status[a.id] === undefined).length),
  );
  const up = k - down - warn - idle;
  return [
    ...Array<Tone>(down).fill('unhealthy'),
    ...Array<Tone>(warn).fill('degraded'),
    ...Array<Tone>(up).fill('healthy'),
    ...Array<Tone>(idle).fill('idle'),
  ];
}

// Posições estáveis: calculadas no espaço REF_W×REF_H, na ordem de nascimento,
// com candidatos sorteados a partir do hash da chave de cada órbita e comparados
// só às anteriores. O título, a barra do topo, o botão + e o núcleo da galáxia
// ficam reservados.
export function layoutRef(orbits: readonly Pick<Orbit, 'key'>[]): Point[] {
  const placed: Point[] = [];
  orbits.forEach((o) => {
    const r = rng(hashId(o.key));
    let best: Point = [RMX, RMY];
    let bestD = -1;
    for (let k = 0; k < CANDIDATES; k++) {
      const x = RMX + r() * (REF_W - 2 * RMX);
      const y = RMY + r() * (REF_H - 2 * RMY - 30);
      let d = Infinity;
      placed.forEach(([px, py]) => {
        d = Math.min(d, Math.hypot(px - x, (py - y) * 1.25));
      });
      RESERVED.forEach(([px, py, pr]) => {
        d = Math.min(d, Math.hypot(px - x, py - y) - pr + 60);
      });
      if (d > bestD) {
        bestD = d;
        best = [x, y];
      }
    }
    placed.push(best);
  });
  return placed;
}

/** As posições de `layoutRef` reescaladas para uma janela W×H. */
export function layout(orbits: readonly Pick<Orbit, 'key'>[], W: number, H: number): Point[] {
  const mx = Math.min(110, W * 0.12);
  const my = Math.min(110, H * 0.13);
  return layoutRef(orbits).map(([x, y]) => [
    mx + ((x - RMX) / (REF_W - 2 * RMX)) * (W - 2 * mx),
    my + ((y - RMY) / (REF_H - 2 * RMY - 30)) * (H - 2 * my - 30),
  ]);
}

export function easeCubicIn(t: number): number {
  return t * t * t;
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// Contorno fechado e suave por pontos: quadráticas com controle em cada ponto e
// ponta no meio de cada lado (faz o papel do curveCardinalClosed do d3-shape,
// que não é carregado).
export function smoothClosedPath(pts: readonly (readonly [number, number])[]): string {
  const n = pts.length;
  const at = (i: number): readonly [number, number] => pts[(i + n) % n] ?? [0, 0];
  const mid = (a: readonly [number, number], b: readonly [number, number]) => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
  ];
  const [sx, sy] = mid(at(n - 1), at(0));
  let d = `M ${String(sx)} ${String(sy)}`;
  pts.forEach((p, i) => {
    const [mx, my] = mid(p, at(i + 1));
    d += ` Q ${String(p[0])} ${String(p[1])} ${String(mx)} ${String(my)}`;
  });
  return `${d} Z`;
}
