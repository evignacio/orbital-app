import { createBrowserRouter } from 'react-router';
import { AppShell } from '@/app/AppShell';
import { PanelPage } from '@/features/panel/PanelPage';

// Só o painel por enquanto: até o corte da F4 a galáxia (/) é a legada, servida
// pelo nginx fora da SPA (o "← Galáxia" do painel é um <a href="/"> comum).
export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [{ path: '/painel', element: <PanelPage /> }],
  },
]);
