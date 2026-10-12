import { useEffect } from 'react';
import mono from '@/theme/mono.module.css';

const TEMAS = ['dark', 'light'];

function lerTema(): string {
  try {
    const salvo = localStorage.getItem('orbital-theme-v1');
    return TEMAS.find((t) => t === salvo) ?? 'dark';
  } catch {
    return 'dark';
  }
}

export function PlaceholderPage() {
  useEffect(() => {
    document.documentElement.dataset.theme = lerTema();
  }, []);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--bg)',
        color: 'var(--ink)',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <p className={mono.eyebrow}>Painel em construção</p>
    </main>
  );
}
