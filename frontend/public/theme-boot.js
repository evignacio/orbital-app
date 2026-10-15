// Tema antes da primeira pintura: o módulo do React só roda depois e daria um
// clarão do tema errado. Mesma regra de storage/preferences.ts (só "light" vale).
// Arquivo externo (e não <script> inline) para a CSP manter script-src 'self';
// carregado sem defer/async no <head>, então ainda bloqueia e roda antes da pintura.
try {
  document.documentElement.dataset.theme =
    localStorage.getItem('orbital-theme-v1') === 'light' ? 'light' : 'dark';
} catch {
  document.documentElement.dataset.theme = 'dark';
}
