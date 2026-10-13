import { readFileSync } from 'node:fs';

describe('themes.css', () => {
  it('o corpo segue --page-bg do tema, com especificidade acima do fundo fixo do index.html', () => {
    const css = readFileSync('src/theme/themes.css', 'utf8');
    expect(css).toMatch(/:root\[data-theme\]\s+body\s*\{\s*background:\s*var\(--page-bg\);/);
  });
});
