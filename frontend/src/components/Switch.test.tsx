import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Switch } from './Switch';

describe('Switch', () => {
  it('expõe role switch com o rótulo como nome e aria-checked', () => {
    render(<Switch label="NOTIFICAÇÕES" checked={false} onChange={vi.fn()} />);
    expect(screen.getByRole('switch', { name: 'NOTIFICAÇÕES' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('reflete o estado ligado', () => {
    render(<Switch label="SOM" checked onChange={vi.fn()} />);
    expect(screen.getByRole('switch', { name: 'SOM' })).toBeChecked();
  });

  it('pede o valor oposto ao clicar', async () => {
    const onChange = vi.fn();
    render(<Switch label="SOM" checked={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole('switch', { name: 'SOM' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('alterna pelo teclado (Espaço e Enter)', async () => {
    const onChange = vi.fn();
    render(<Switch label="SOM" checked onChange={onChange} />);
    await userEvent.tab();
    expect(screen.getByRole('switch')).toHaveFocus();
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenNthCalledWith(1, false);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('desabilitado não dispara', async () => {
    const onChange = vi.fn();
    render(<Switch label="SOM" checked={false} onChange={onChange} disabled />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
