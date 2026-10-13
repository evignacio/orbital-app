import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/http';
import { emptyForm } from '@/domain/application-form';
import type { Application } from '@/domain/types';
import {
  apiFieldErrors,
  blankForm,
  formFromApp,
  orbitOptions,
  teamSuggestions,
  toggleOrbit,
  withPendingOrbit,
} from './app-form-model';

function app(id: string, team: string, orbits: string[]): Application {
  return {
    id,
    env: 'prd',
    name: `app-${id}`,
    team,
    healthCheckUrl: 'http://x',
    swaggerUrl: '',
    orbits,
  };
}

const KNOWN = [
  { key: 'dream-team', name: 'Dream team' },
  { key: 'financeiro', name: 'Financeiro' },
];

describe('blankForm', () => {
  it('sem órbita fica sem órbitas; com órbita já a traz escolhida', () => {
    expect(blankForm('hml', null)).toEqual(emptyForm('hml'));
    expect(blankForm('dev', 'Dream team')).toEqual(emptyForm('dev', ['Dream team']));
  });
});

describe('formFromApp', () => {
  it('copia os campos e o ambiente da app, com uma lista de órbitas nova', () => {
    const a = { ...app('a', 'Pagamentos', ['X1']), swaggerUrl: 'http://s', env: 'hml' as const };
    const f = formFromApp(a);
    expect(f).toEqual({
      name: 'app-a',
      team: 'Pagamentos',
      swaggerUrl: 'http://s',
      healthCheckUrl: 'http://x',
      env: 'hml',
      orbits: ['X1'],
    });
    expect(f.orbits).not.toBe(a.orbits);
  });
});

describe('teamSuggestions', () => {
  const apps = [app('a', 'Pagamentos', []), app('b', 'Logística', []), app('c', 'Pagamentos', [])];

  it('sem texto lista todos os times, sem repetir e em ordem', () => {
    expect(teamSuggestions(apps, '')).toEqual(['Logística', 'Pagamentos']);
  });

  it('filtra por trecho sem diferenciar maiúsculas e tira o time já digitado igual', () => {
    expect(teamSuggestions(apps, ' pag')).toEqual(['Pagamentos']);
    expect(teamSuggestions(apps, 'pagamentos')).toEqual([]);
  });
});

describe('orbitOptions', () => {
  it('sem busca lista as conhecidas, marcando as escolhidas pela chave', () => {
    expect(orbitOptions(KNOWN, ['financeiro'], '')).toEqual([
      { label: 'Dream team', key: 'dream-team', value: 'Dream team', on: false, create: false },
      { label: 'Financeiro', key: 'financeiro', value: 'Financeiro', on: true, create: false },
    ]);
  });

  it('filtra pela chave da busca', () => {
    expect(orbitOptions(KNOWN, [], 'Dréam').map((o) => o.label)).toEqual([
      'Dream team',
      'Criar órbita “Dréam”',
    ]);
  });

  it('texto novo oferece "Criar órbita “x”" no fim', () => {
    expect(orbitOptions(KNOWN, [], ' Fin ').at(-1)).toEqual({
      label: 'Criar órbita “Fin”',
      key: 'fin',
      value: 'Fin',
      on: false,
      create: true,
    });
  });

  it('não oferece criar quando a órbita já existe ou já foi escolhida', () => {
    expect(orbitOptions(KNOWN, [], 'financeiro').some((o) => o.create)).toBe(false);
    expect(orbitOptions(KNOWN, ['Nova'], 'nova').some((o) => o.create)).toBe(false);
  });
});

describe('toggleOrbit', () => {
  it('liga aparando e desliga pela chave', () => {
    expect(toggleOrbit(['A1'], '  Financeiro ')).toEqual(['A1', 'Financeiro']);
    expect(toggleOrbit(['Financeiro', 'A1'], 'financeiro')).toEqual(['A1']);
  });

  it('nome sem chave não muda nada', () => {
    expect(toggleOrbit(['A1'], '   ')).toBeNull();
  });
});

describe('withPendingOrbit', () => {
  const f = emptyForm('prd', ['Dream team']);

  it('sem texto, ou com órbita já escolhida, devolve o mesmo form', () => {
    expect(withPendingOrbit(f, '  ', KNOWN)).toBe(f);
    expect(withPendingOrbit(f, 'dream TEAM', KNOWN)).toBe(f);
  });

  it('órbita conhecida entra com a grafia dela; nova entra aparada', () => {
    expect(withPendingOrbit(f, 'financeiro', KNOWN).orbits).toEqual(['Dream team', 'Financeiro']);
    expect(withPendingOrbit(f, ' Nova ', KNOWN).orbits).toEqual(['Dream team', 'Nova']);
  });
});

describe('apiFieldErrors', () => {
  it('400 com fields vira erro por campo (só textos dos campos do form)', () => {
    const e = new ApiError(400, {
      error: 'Invalid application',
      fields: { name: 'nome ruim', extra: 'x', team: 3 },
    });
    expect(apiFieldErrors(e)).toEqual({ name: 'nome ruim' });
  });

  it('400 sem fields, outro status ou outro erro devolve null', () => {
    expect(apiFieldErrors(new ApiError(400, { error: 'x' }))).toBeNull();
    expect(apiFieldErrors(new ApiError(500, { fields: { name: 'x' } }))).toBeNull();
    expect(apiFieldErrors(new Error('x'))).toBeNull();
  });
});
