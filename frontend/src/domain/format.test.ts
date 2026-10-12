import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agoLabel, clockLabel } from './format';

// O fuso da máquina muda o resultado de clockLabel, então as datas são montadas
// no horário local (new Date(ano, mês, ...)) e o texto esperado vem do mesmo
// locale, sem fixar o fuso.
const AGORA = new Date(2026, 5, 15, 14, 30, 5);

describe('clockLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mostra só a hora quando é o mesmo dia', () => {
    const ts = new Date(2026, 5, 15, 9, 5, 7).getTime();
    expect(clockLabel(ts)).toBe('09:05:07');
  });

  it('mostra data e hora curtas quando é outro dia', () => {
    const ts = new Date(2026, 5, 14, 23, 59, 0).getTime();
    expect(clockLabel(ts)).toBe('14/06/2026, 23:59');
  });

  it('trata o mesmo dia de calendário, não as últimas 24 h', () => {
    const ontemTarde = new Date(2026, 5, 14, 14, 30, 6).getTime();
    expect(clockLabel(ontemTarde)).toBe('14/06/2026, 14:30');
  });
});

describe('agoLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const atras = (ms: number) => AGORA.getTime() - ms;
  const MIN = 60_000;

  it('diz "há menos de 1 min" abaixo de um minuto, inclusive no futuro', () => {
    expect(agoLabel(atras(0))).toBe('há menos de 1 min');
    expect(agoLabel(atras(59_999))).toBe('há menos de 1 min');
    expect(agoLabel(atras(-5 * MIN))).toBe('há menos de 1 min');
  });

  it('conta minutos até 59', () => {
    expect(agoLabel(atras(MIN))).toBe('há 1 min');
    expect(agoLabel(atras(59 * MIN + 59_999))).toBe('há 59 min');
  });

  it('conta horas inteiras até 23', () => {
    expect(agoLabel(atras(60 * MIN))).toBe('há 1 h');
    expect(agoLabel(atras(150 * MIN))).toBe('há 2 h');
    expect(agoLabel(atras(23 * 60 * MIN + 59 * MIN))).toBe('há 23 h');
  });

  it('conta dias a partir de 24 h', () => {
    expect(agoLabel(atras(24 * 60 * MIN))).toBe('há 1 d');
    expect(agoLabel(atras(49 * 60 * MIN))).toBe('há 2 d');
  });
});
