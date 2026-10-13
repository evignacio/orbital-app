import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from '@/app/router';
import { clearObsoleteKeys } from '@/storage/cache';
import { hydrateStores } from '@/store/hydrate';
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
