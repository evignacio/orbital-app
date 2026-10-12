// Chaves do localStorage. Os nomes (e os formatos gravados) são os do legado e
// ficam congelados até a F5: quem já tem cache no navegador não pode perdê-lo.
export const KEYS = {
  theme: 'orbital-theme-v1',
  apps: 'orbital-apps-v1',
  status: 'orbital-status-v1',
  notify: 'orbital-notify-v1',
  sound: 'orbital-sound-v1',
  lastOk: 'orbital-lastok-v1',
  comet: 'orbital-comet-v1',
  env: 'orbital-env-v1',
} as const;

// Do tempo em que o navegador contava e checava por conta própria: nada mais lê
// estas chaves, só a carga as apaga.
export const OBSOLETE_KEYS = ['orbital-counters-v1', 'orbital-rate-v1'] as const;
