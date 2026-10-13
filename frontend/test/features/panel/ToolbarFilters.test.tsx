import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToolbarFilters } from '@/features/panel/ToolbarFilters';

describe('ToolbarFilters', () => {
  it('mostra os chips do legado e marca o filtro ativo', () => {
    render(<ToolbarFilters filter="degraded" onChange={vi.fn()} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'TODAS',
      'NO AR',
      'DEGRADADO',
      'FORA',
    ]);
    expect(screen.getByRole('button', { name: 'DEGRADADO' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('chama onChange com o valor do filtro', async () => {
    const onChange = vi.fn();
    render(<ToolbarFilters filter="all" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'FORA' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('unhealthy');
  });
});
