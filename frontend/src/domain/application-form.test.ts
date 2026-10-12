import { describe, expect, it } from 'vitest';
import {
  emptyForm,
  FIELD_LIMITS,
  normalizeAppForm,
  ORBIT_BLUR_MS,
  TEAM_BLUR_MS,
  validateAppForm,
  type AppForm,
} from './application-form';

// Mesmo corpo válido de api/test/application.validator.test.js.
const valid: AppForm = {
  name: 'checkout-api',
  team: 'Pagamentos',
  healthCheckUrl: 'https://checkout.interno/actuator/health',
  swaggerUrl: 'https://checkout.interno/swagger-ui.html',
  env: 'prd',
  orbits: ['Financeiro', 'Pagamentos'],
};
const errorsFor = (patch: Partial<AppForm>) => validateAppForm({ ...valid, ...patch });

const FORMATO_NOME =
  'Use letras sem acento, números, ".", "_" ou "-", começando por letra ou número.';
const FORMATO_TIME = 'Use letras, números, espaços, ".", "_" ou "-".';
const FORMATO_ORBITA = (o: string) =>
  `Órbita "${o}": use de 2 a 40 caracteres entre letras, números, espaços, ".", "_" ou "-".`;

describe('constantes e emptyForm', () => {
  it('expõe os limites e os atrasos de blur do legado', () => {
    expect(FIELD_LIMITS).toEqual({ name: 60, team: 60, url: 2048, orbit: 40, orbits: 10 });
    expect(TEAM_BLUR_MS).toBe(150);
    expect(ORBIT_BLUR_MS).toBe(120);
  });

  it('cria o formulário vazio já no ambiente e nas órbitas indicados', () => {
    expect(emptyForm('hml', ['Dados'])).toEqual({
      name: '',
      team: '',
      swaggerUrl: '',
      healthCheckUrl: '',
      env: 'hml',
      orbits: ['Dados'],
    });
    expect(emptyForm('dev').orbits).toEqual([]);
  });
});

describe('validateAppForm', () => {
  it('aceita um formulário válido sem erros', () => {
    expect(validateAppForm(valid)).toEqual({});
  });

  it('reporta todos os campos inválidos de uma vez', () => {
    const errors = validateAppForm({
      ...valid,
      name: '',
      team: '',
      healthCheckUrl: '',
      orbits: [],
    });
    expect(Object.keys(errors).sort()).toEqual(['healthCheckUrl', 'name', 'orbits', 'team']);
  });

  it('trata swaggerUrl vazio ou só espaços como omitido', () => {
    expect(errorsFor({ swaggerUrl: '' })).toEqual({});
    expect(errorsFor({ swaggerUrl: '   ' })).toEqual({});
  });

  it.each(['name', 'team', 'healthCheckUrl'] as const)('exige o campo %s', (field) => {
    const msg = field === 'healthCheckUrl' ? 'Informe a URL.' : 'Campo obrigatório.';
    expect(errorsFor({ [field]: '' })).toEqual({ [field]: msg });
    expect(errorsFor({ [field]: '   ' })).toEqual({ [field]: msg });
  });

  describe('name', () => {
    it.each(['ab', 'checkout-api', 'billing.v2', 'auth_gateway', 'A1'])('aceita %p', (name) => {
      expect(errorsFor({ name })).toEqual({});
    });

    it.each([
      ['com espaço', 'checkout api'],
      ['com tag HTML', '<script>alert(1)</script>'],
      ['começando com hífen', '-checkout'],
      ['com operador do Mongo', '$gt'],
      ['com barra', 'a/b'],
      ['com acento', 'catálogo'],
    ])('rejeita nome %s', (_, name) => {
      expect(errorsFor({ name })).toEqual({ name: FORMATO_NOME });
    });

    it('rejeita nomes mais curtos ou mais longos que o limite', () => {
      expect(errorsFor({ name: 'a' })).toEqual({ name: 'Use de 2 a 60 caracteres.' });
      expect(errorsFor({ name: 'a'.repeat(61) })).toEqual({ name: 'Use de 2 a 60 caracteres.' });
      expect(errorsFor({ name: 'a'.repeat(60) })).toEqual({});
    });
  });

  describe('team', () => {
    it.each(['Pagamentos', 'Time de Produtos', 'Integração', 'squad_2.0-b'])(
      'aceita %p',
      (team) => {
        expect(errorsFor({ team })).toEqual({});
      },
    );

    it.each([
      ['com tag HTML', '<b>Dados</b>'],
      ['com aspas', 'Dados"'],
      ['com chaves', '{Dados}'],
    ])('rejeita time %s', (_, team) => {
      expect(errorsFor({ team })).toEqual({ team: FORMATO_TIME });
    });

    it('rejeita times mais curtos ou mais longos que o limite', () => {
      expect(errorsFor({ team: 'D' })).toEqual({ team: 'Use de 2 a 60 caracteres.' });
      expect(errorsFor({ team: 'D'.repeat(61) })).toEqual({ team: 'Use de 2 a 60 caracteres.' });
    });
  });

  it.each([
    ['nulo', '\u0000'],
    ['DEL', '\u007f'],
    ['quebra de linha no meio', '\nx'],
  ])('rejeita caractere de controle (%s) no nome e no time', (_, ch) => {
    expect(errorsFor({ name: `ab${ch}` }).name).toBe(FORMATO_NOME);
    expect(errorsFor({ team: `ab${ch}` }).team).toBe(FORMATO_TIME);
  });

  it.each([
    ['nulo', '\u0000'],
    ['DEL', '\u007f'],
  ])('rejeita caractere de controle (%s) nas URLs', (_, ch) => {
    const msg = 'A URL tem caracteres inválidos.';
    expect(errorsFor({ healthCheckUrl: `${valid.healthCheckUrl}${ch}` })).toEqual({
      healthCheckUrl: msg,
    });
    expect(errorsFor({ swaggerUrl: `${valid.swaggerUrl}${ch}` })).toEqual({ swaggerUrl: msg });
  });

  describe('orbits', () => {
    it('exige ao menos uma órbita', () => {
      expect(errorsFor({ orbits: [] })).toEqual({ orbits: 'Escolha ao menos uma órbita.' });
    });

    it('aceita acentos, dígitos, espaços, ".", "_" e "-"', () => {
      expect(errorsFor({ orbits: ['Integrações', 'Dream team', 'squad_2.0-b'] })).toEqual({});
    });

    it('rejeita órbita fora do formato ou do tamanho, citando a primeira inválida', () => {
      expect(errorsFor({ orbits: ['<b>Dados</b>'] })).toEqual({
        orbits: FORMATO_ORBITA('<b>Dados</b>'),
      });
      expect(errorsFor({ orbits: ['Ok', 'D'] })).toEqual({ orbits: FORMATO_ORBITA('D') });
      expect(errorsFor({ orbits: ['   '] })).toEqual({ orbits: FORMATO_ORBITA('') });
      const longa = 'D'.repeat(41);
      expect(errorsFor({ orbits: [longa] })).toEqual({ orbits: FORMATO_ORBITA(longa) });
      expect(errorsFor({ orbits: ['D'.repeat(40)] })).toEqual({});
      expect(errorsFor({ orbits: ['Ok', 'a\u0000b'] })).toEqual({
        orbits: FORMATO_ORBITA('a\u0000b'),
      });
    });

    it('limita a quantidade de órbitas, contando só as distintas', () => {
      const many = (n: number) => Array.from({ length: n }, (_, i) => `Orbita ${String(i)}`);
      expect(errorsFor({ orbits: many(10) })).toEqual({});
      expect(errorsFor({ orbits: [...many(10), 'orbita 0'] })).toEqual({});
      expect(errorsFor({ orbits: many(11) })).toEqual({ orbits: 'Use no máximo 10 órbitas.' });
    });
  });

  describe('URLs', () => {
    it.each([
      'http://billing:8080/health',
      'https://10.0.0.5/actuator/health',
      'https://hml-catalogo.interno/actuator/health?full=1',
      'HTTPS://Billing.Interno/Health',
    ])('aceita %p (hosts internos continuam permitidos)', (healthCheckUrl) => {
      expect(errorsFor({ healthCheckUrl })).toEqual({});
    });

    it.each([
      ['javascript:', 'javascript:alert(1)'],
      ['data:', 'data:text/html,<script>alert(1)</script>'],
      ['file:', 'file:///etc/passwd'],
      ['ftp:', 'ftp://billing/health'],
      ['sem esquema', 'billing/health'],
    ])('rejeita o protocolo %s', (_, url) => {
      const msg = 'A URL deve começar com http:// ou https://';
      expect(errorsFor({ healthCheckUrl: url })).toEqual({ healthCheckUrl: msg });
      expect(errorsFor({ swaggerUrl: url })).toEqual({ swaggerUrl: msg });
    });

    it.each(['http://', 'https:// espaço.com'])('rejeita URL malformada %p', (url) => {
      expect(errorsFor({ healthCheckUrl: url })).toEqual({ healthCheckUrl: 'URL inválida.' });
    });

    it('rejeita URL com usuário ou senha embutidos', () => {
      const msg = 'Não inclua usuário ou senha na URL.';
      expect(errorsFor({ healthCheckUrl: 'https://admin:segredo@billing/health' })).toEqual({
        healthCheckUrl: msg,
      });
      expect(errorsFor({ swaggerUrl: 'https://admin@billing/docs' })).toEqual({ swaggerUrl: msg });
    });

    it('rejeita URL maior que o limite', () => {
      const long = `https://billing/${'a'.repeat(2048)}`;
      expect(errorsFor({ healthCheckUrl: long })).toEqual({
        healthCheckUrl: 'Use no máximo 2048 caracteres.',
      });
    });
  });

  // Divergência registrada: a API recusa controle nas pontas (checa antes do trim);
  // o legado apara primeiro, então a quebra de linha final some e o valor passa.
  it('apara espaços e quebras nas pontas antes de validar (como o legado)', () => {
    expect(errorsFor({ name: ' checkout-api\n', orbits: [' Financeiro\n'] })).toEqual({});
  });
});

describe('normalizeAppForm', () => {
  it('apara todos os campos e descarta órbitas repetidas, mantendo a primeira grafia', () => {
    const value = normalizeAppForm({
      name: '  checkout-api ',
      team: ' Pagamentos  ',
      healthCheckUrl: ' https://checkout.interno/health ',
      swaggerUrl: '  https://checkout.interno/docs ',
      env: 'dev',
      orbits: [' Integrações ', 'integracoes', 'Dream team', 'DREAM-TEAM', 'Dados'],
    });
    expect(value).toEqual({
      name: 'checkout-api',
      team: 'Pagamentos',
      healthCheckUrl: 'https://checkout.interno/health',
      swaggerUrl: 'https://checkout.interno/docs',
      orbits: ['Integrações', 'Dream team', 'Dados'],
    });
  });

  it('mantém a URL como digitada, sem normalizar', () => {
    const url = 'HTTPS://Billing.Interno/Health';
    expect(normalizeAppForm({ ...valid, healthCheckUrl: url }).healthCheckUrl).toBe(url);
  });
});
