import { createBrowserRouter } from 'react-router';
import { AppShell } from '@/app/AppShell';
import { GalaxyPage } from '@/features/galaxy/GalaxyPage';
import { PanelPage } from '@/features/panel/PanelPage';

// Até o corte da F4 (4.7) o nginx ainda serve a galáxia legada em /; a rota /
// da SPA já vale no vite dev e passa a valer no nginx no corte.
export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <GalaxyPage /> },
      { path: '/painel', element: <PanelPage /> },
    ],
  },
]);
