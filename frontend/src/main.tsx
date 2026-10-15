import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from '@/app/router';
import { clearObsoleteKeys } from '@/storage/cache';
import { hydrateStores } from '@/store/hydrate';
// Fontes servidas pela própria origem (o Vite empacota os woff2 em /assets/): só os
// pesos usados e só o subconjunto latin, que já cobre o pt-BR. Nada de Google Fonts —
// a CSP (font-src 'self') bloquearia, e nenhuma requisição sai para terceiros.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@/theme/themes.css';
import '@/theme/base.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado');

// Antes do primeiro render, para que quem captura o estado no mount (o ambiente do
// formulário, por exemplo) já o veja hidratado. O legado hidratava no componentDidMount.
clearObsoleteKeys();
hydrateStores(Date.now(), {
  notifyAllowed: 'Notification' in window && Notification.permission === 'granted',
});

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
