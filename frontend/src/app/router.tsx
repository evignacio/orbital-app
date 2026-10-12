import { createBrowserRouter } from 'react-router';
import { AppShell } from '@/app/AppShell';
import { DiagnosticPage } from '@/features/panel/DiagnosticPage';

// Provisório: a galáxia (/) e o painel (/painel) chegam nas fases F3 e F4; até lá
// as duas rotas mostram a página de diagnóstico.
export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <DiagnosticPage /> },
      { path: '/painel', element: <DiagnosticPage /> },
    ],
  },
]);
