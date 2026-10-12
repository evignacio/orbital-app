import { render, screen } from '@testing-library/react';
import { PlaceholderPage } from '@/app/PlaceholderPage';

describe('PlaceholderPage', () => {
  it('mostra o aviso de painel em construção', () => {
    render(<PlaceholderPage />);
    expect(screen.getByText('Painel em construção')).toBeInTheDocument();
  });

  it('aplica o tema salvo no localStorage ao <html>', () => {
    localStorage.setItem('orbital-theme-v1', 'light');
    render(<PlaceholderPage />);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('usa o tema escuro quando nada foi salvo', () => {
    render(<PlaceholderPage />);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
