import { createBrowserRouter } from 'react-router';
import { AppShell } from '@/app/AppShell';
import { NotFoundPage, RouteError } from '@/app/MessagePage';
import { GalaxyPage } from '@/features/galaxy/GalaxyPage';
import { PanelPage } from '@/features/panel/PanelPage';

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <GalaxyPage /> },
      { path: '/painel', element: <PanelPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
