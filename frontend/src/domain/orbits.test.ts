import { describe, expect, it } from 'vitest';
import type { Application } from './types';
import {
  collectOrbits,
  inOrbit,
  ORBIT_COLORS,
  orbitColors,
  orbitKey,
  orbitList,
  orbitsByBirth,
} from './orbits';

function app(id: string, orbits: string[]): Application {
  return {
    id,
    env: 'prd',
    name: `app-${id}`,
    team: 'time',
    healthCheckUrl: 'https://x.test/health',
    swaggerUrl: '',
    orbits,
  };
}

describe('orbitKey', () => {
  // Mesmos casos de api/test/application.validator.test.js: a chave tem de ser igual nos dois lados.
  it('tira acentos, põe em minúscula e troca espaços por hífen', () => {
    expect(orbitKey('Integrações')).toBe('integracoes');
    expect(orbitKey('Dream team')).toBe('dream-team');
    expect(orbitKey('DREAM-TEAM')).toBe('dream-team');
    expect(orbitKey('squad_2.0-b')).toBe('squad_2.0-b');
  });

  it('une grafias da mesma órbita', () => {
    expect(orbitKey(' Integrações ')).toBe(orbitKey('integracoes'));
  });

  it('apara as pontas e junta espaços repetidos num só hífen', () => {
    expect(orbitKey('  Dados   e  Análise  ')).toBe('dados-e-analise');
    expect(orbitKey('a\tb')).toBe('a-b');
  });

  it('devolve vazio para o que não é texto útil', () => {
    expect(orbitKey('')).toBe('');
    expect(orbitKey('   ')).toBe('');
    expect(orbitKey(undefined)).toBe('');
    expect(orbitKey(null)).toBe('');
  });
});

describe('orbitList', () => {
  it('mantém só strings não vazias', () => {
    expect(orbitList(['A', '', '  ', 3, null, 'B'])).toEqual(['A', 'B']);
  });

  it('devolve lista vazia quando não é array', () => {
    expect(orbitList(undefined)).toEqual([]);
    expect(orbitList('A')).toEqual([]);
    expect(orbitList({ 0: 'A' })).toEqual([]);
  });
});

describe('inOrbit', () => {
  it('compara pela chave, ignorando acento e caixa', () => {
    const a = app('1', ['Integrações', 'Dream team']);
    expect(inOrbit(a, 'integracoes')).toBe(true);
    expect(inOrbit(a, 'dream-team')).toBe(true);
    expect(inOrbit(a, 'dados')).toBe(false);
    expect(inOrbit(app('2', []), 'dados')).toBe(false);
  });
});

describe('collectOrbits', () => {
  it('junta uma órbita por chave com a primeira grafia, em ordem alfabética da chave', () => {
    const apps = [
      app('1', ['Pagamentos', ' Dream team ']),
      app('2', ['dream-team', 'Árvore']),
      app('3', ['PAGAMENTOS']),
    ];
    expect(collectOrbits(apps)).toEqual([
      { key: 'arvore', name: 'Árvore' },
      { key: 'dream-team', name: 'Dream team' },
      { key: 'pagamentos', name: 'Pagamentos' },
    ]);
  });

  it('ignora nomes que não geram chave e lida com lista vazia', () => {
    expect(collectOrbits([app('1', ['  '])])).toEqual([]);
    expect(collectOrbits([])).toEqual([]);
  });
});

describe('orbitsByBirth', () => {
  it('ordena as órbitas pela app mais antiga (menor id) e agrupa as apps', () => {
    const a1 = app('a1', ['Dados']);
    const a2 = app('a2', ['Pagamentos', 'Dados']);
    const a3 = app('a3', ['Novas']);
    const resultado = orbitsByBirth([a3, a2, a1]);
    expect(resultado.map((o) => o.key)).toEqual(['dados', 'pagamentos', 'novas']);
    expect(resultado[0]?.apps).toEqual([a1, a2]);
    expect(resultado[1]?.apps).toEqual([a2]);
    expect(resultado[2]?.name).toBe('Novas');
  });

  it('usa a grafia da app mais antiga como nome e não altera a lista recebida', () => {
    const velha = app('1', ['Integrações']);
    const nova = app('2', ['integracoes']);
    const entrada = [nova, velha];
    expect(orbitsByBirth(entrada)[0]?.name).toBe('Integrações');
    expect(entrada).toEqual([nova, velha]);
  });

  it('mantém a ordem recebida entre apps de mesmo id', () => {
    const x = app('1', ['A']);
    const y = app('1', ['A']);
    expect(orbitsByBirth([x, y])[0]?.apps).toEqual([x, y]);
  });

  it('descarta nomes sem chave', () => {
    expect(orbitsByBirth([app('1', ['  '])])).toEqual([]);
  });
});

describe('orbitColors', () => {
  it('dá a cor da paleta pela ordem de nascimento, em cada tema', () => {
    const apps = [app('1', ['A']), app('2', ['B']), app('3', ['C'])];
    const escuro = orbitColors(apps, 'dark');
    expect(escuro('a')).toBe(ORBIT_COLORS.dark[0]);
    expect(escuro('b')).toBe(ORBIT_COLORS.dark[1]);
    expect(escuro('c')).toBe(ORBIT_COLORS.dark[2]);
    expect(orbitColors(apps, 'light')('a')).toBe(ORBIT_COLORS.light[0]);
  });

  it('dá a cor que uma órbita nova vai ganhar, sem mexer nas existentes', () => {
    const apps = [app('1', ['A']), app('2', ['B'])];
    const cor = orbitColors(apps, 'dark');
    expect(cor('nova')).toBe(ORBIT_COLORS.dark[2]);
    expect(cor('a')).toBe(ORBIT_COLORS.dark[0]);
  });

  it('volta ao começo da paleta depois de 8 órbitas', () => {
    const apps = Array.from({ length: 9 }, (_, i) => app(String(i), [`Orbita ${String(i)}`]));
    const cor = orbitColors(apps, 'dark');
    expect(cor('orbita-8')).toBe(ORBIT_COLORS.dark[0]);
    expect(cor('orbita-7')).toBe(ORBIT_COLORS.dark[7]);
  });

  it('tem 8 cores por tema', () => {
    expect(ORBIT_COLORS.dark).toHaveLength(8);
    expect(ORBIT_COLORS.light).toHaveLength(8);
  });
});
