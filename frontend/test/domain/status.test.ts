import { describe, expect, it } from 'vitest';
import {
  FILTERS,
  IDLE_META,
  isStatus,
  STATUS_META,
  STATUSES,
  statusColor,
  statusMeta,
  statusText,
} from '@/domain/status';

describe('status', () => {
  it('lista os status na ordem da tela', () => {
    expect(STATUSES).toEqual(['healthy', 'degraded', 'unhealthy']);
  });

  it('descreve cada status com tom, texto e chip', () => {
    expect(STATUS_META).toEqual({
      healthy: { tone: 'up', text: 'NO AR', chip: 'NO AR' },
      degraded: { tone: 'warn', text: 'DEGRADADO', chip: 'DEGRADADO' },
      unhealthy: { tone: 'down', text: 'FORA DO AR', chip: 'FORA' },
    });
    expect(IDLE_META).toEqual({ tone: 'idle', text: 'VERIFICANDO' });
  });

  it('monta os chips de filtro começando por TODAS', () => {
    expect(FILTERS).toEqual([
      ['all', 'TODAS'],
      ['healthy', 'NO AR'],
      ['degraded', 'DEGRADADO'],
      ['unhealthy', 'FORA'],
    ]);
  });

  it('usa o meta do status conhecido e o IDLE para ausente ou desconhecido', () => {
    expect(statusMeta('degraded')).toBe(STATUS_META.degraded);
    expect(statusMeta(undefined)).toBe(IDLE_META);
    expect(statusMeta(null)).toBe(IDLE_META);
    expect(statusMeta('up')).toBe(IDLE_META);
  });

  it('devolve a cor como variável CSS e o texto do badge', () => {
    expect(statusColor('healthy')).toBe('var(--up)');
    expect(statusColor('degraded')).toBe('var(--warn)');
    expect(statusColor('unhealthy')).toBe('var(--down)');
    expect(statusColor(undefined)).toBe('var(--idle)');
    expect(statusText('unhealthy')).toBe('FORA DO AR');
    expect(statusText('???')).toBe('VERIFICANDO');
  });

  it('reconhece só os três status como Status', () => {
    expect(isStatus('healthy')).toBe(true);
    expect(isStatus('unhealthy')).toBe(true);
    expect(isStatus('down')).toBe(false);
    expect(isStatus(null)).toBe(false);
    expect(isStatus(1)).toBe(false);
  });
});
