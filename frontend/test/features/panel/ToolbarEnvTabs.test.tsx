import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToolbarEnvTabs } from '@/features/panel/ToolbarEnvTabs';

describe('ToolbarEnvTabs', () => {
  it('marca só a aba do ambiente atual', () => {
    render(<ToolbarEnvTabs env="hml" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'HOMOLOGAÇÃO' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'PRODUÇÃO' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('chama onChange com o código do ambiente clicado', async () => {
    const onChange = vi.fn();
    render(<ToolbarEnvTabs env="prd" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'HOMOLOGAÇÃO' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('hml');
  });
});
