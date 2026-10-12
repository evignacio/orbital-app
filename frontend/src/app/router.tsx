import { createBrowserRouter } from 'react-router';
import { PlaceholderPage } from '@/app/PlaceholderPage';

export const router = createBrowserRouter([
  { path: '/', element: <PlaceholderPage /> },
  { path: '/painel', element: <PlaceholderPage /> },
]);
