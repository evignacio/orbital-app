import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

/**
 * EventSource falso para os testes (jsdom não tem um).
 *
 * - `FakeEventSource.instances`: todas as instâncias criadas; `FakeEventSource.last()` devolve a última.
 * - `emitOpen()`: marca como aberta e dispara `open`.
 * - `emit(tipo, dados)`: dispara um evento nomeado (como `snapshot`/`status`/`cycle`) com `data` em JSON.
 * - `emitError()`: dispara `error` (a conexão cai; `readyState` volta a CONNECTING).
 * - `close()`: marca como fechada (`readyState` CLOSED).
 */
export class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];

  static last(): FakeEventSource {
    const ultima = FakeEventSource.instances.at(-1);
    if (!ultima) throw new Error('Nenhum EventSource foi criado');
    return ultima;
  }

  readonly url: string;
  readyState: number = FakeEventSource.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent<string>) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  private readonly listeners = new Map<string, Set<(ev: Event) => void>>();

  constructor(url: string | URL) {
    this.url = String(url);
    FakeEventSource.instances.push(this);
  }

  addEventListener(tipo: string, ouvinte: (ev: Event) => void): void {
    const conjunto = this.listeners.get(tipo) ?? new Set();
    conjunto.add(ouvinte);
    this.listeners.set(tipo, conjunto);
  }

  removeEventListener(tipo: string, ouvinte: (ev: Event) => void): void {
    this.listeners.get(tipo)?.delete(ouvinte);
  }

  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }

  emitOpen(): void {
    this.readyState = FakeEventSource.OPEN;
    this.dispatch('open', new Event('open'));
  }

  emit(tipo: string, dados: unknown): void {
    const evento = new MessageEvent(tipo, { data: JSON.stringify(dados) });
    this.dispatch(tipo, evento);
    if (tipo === 'message') this.onmessage?.(evento);
  }

  emitError(): void {
    this.readyState = FakeEventSource.CONNECTING;
    this.dispatch('error', new Event('error'));
  }

  private dispatch(tipo: string, evento: Event): void {
    if (tipo === 'open') this.onopen?.(evento);
    if (tipo === 'error') this.onerror?.(evento);
    this.listeners.get(tipo)?.forEach((ouvinte) => {
      ouvinte(evento);
    });
  }
}

globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;

beforeEach(() => {
  localStorage.clear();
  FakeEventSource.instances = [];
});

afterEach(() => {
  cleanup();
});
