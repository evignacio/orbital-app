import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Application } from '@/domain/types';
import { useAppsStore } from '@/store/apps.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { AppFormDialog } from './AppFormDialog';

const EDITING: Application = {
  id: 'a',
  env: 'hml',
  name: 'checkout-api',
  team: 'Pagamentos',
  healthCheckUrl: 'http://a/health',
  swaggerUrl: 'http://a/swagger',
  orbits: ['Dream team'],
};
const APPS: Application[] = [
  EDITING,
  {
    id: 'b',
    env: 'prd',
    name: 'frete-api',
    team: 'Logística',
    healthCheckUrl: 'http://b/health',
    swaggerUrl: '',
    orbits: ['Financeiro'],
  },
];

interface HarnessProps {
  editing?: Application | null;
  initialOrbit?: string | null;
  onCreated?: (app: Application) => void;
  onUpdated?: (app: Application) => void;
}

// O dono do `open` (no painel, a panel.store): o ✕, o Cancelar e o sucesso fecham.
function Harness({
  editing = null,
  initialOrbit = null,
  onCreated = vi.fn(),
  onUpdated = vi.fn(),
}: HarnessProps) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        reabrir
      </button>
      <AppFormDialog
        open={open}
        editing={editing}
        initialEnv="prd"
        initialOrbit={initialOrbit}
        onClose={() => {
          setOpen(false);
        }}
        onCreated={onCreated}
        onUpdated={onUpdated}
      />
    </>
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(...responses: Response[]): Mock {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fn);
  return fn;
}

function sentBody(fetchMock: Mock): unknown {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
  return JSON.parse(init.body as string);
}

const field = {
  name: () => screen.getByRole('textbox', { name: /Nome da aplicação/ }),
  team: () => screen.getByRole('textbox', { name: /Time responsável/ }),
  swagger: () => screen.getByRole('textbox', { name: /URL do Swagger/ }),
  health: () => screen.getByRole('textbox', { name: /URL do health check/ }),
  orbits: () => screen.getByRole('combobox', { name: /Órbitas onde a aplicação aparece/ }),
};

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(field.name(), 'novo-api');
  await user.type(field.team(), 'Pagamentos');
  await user.type(field.health(), 'https://novo/health');
}

beforeEach(() => {
  useAppsStore.setState({ ...useAppsStore.getInitialState(), apps: APPS });
  usePreferencesStore.setState(usePreferencesStore.getInitialState());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppFormDialog: cadastro', () => {
  it('mostra os textos do legado e as três abas, com o ambiente inicial marcado', () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog', { name: 'Adicionar aplicação' });
    expect(dialog).toHaveTextContent('NOVO LANÇAMENTO');
    expect(screen.getByRole('button', { name: 'Lançar em órbita' })).toHaveAttribute(
      'type',
      'submit',
    );
    expect(screen.getByRole('button', { name: 'PRODUÇÃO' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'DESENVOLVIMENTO' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(field.name()).toHaveAttribute('placeholder', 'checkout-api');
    expect(field.name()).toHaveAttribute('maxLength', '60');
    expect(field.health()).toHaveAttribute('maxLength', '2048');
    expect(field.orbits()).toHaveAttribute('placeholder', 'Buscar ou criar órbita');
    expect(screen.queryByText('O ambiente não muda na edição.')).not.toBeInTheDocument();
  });

  it('fechado não renderiza nada', () => {
    render(
      <AppFormDialog
        open={false}
        editing={null}
        initialEnv="prd"
        initialOrbit={null}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        onUpdated={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('enviar vazio mostra os erros de cada campo sem chamar a API, e editar o campo limpa o dele', async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Lançar em órbita' }));
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent);
    expect(alerts).toEqual([
      'Campo obrigatório.',
      'Campo obrigatório.',
      'Escolha ao menos uma órbita.',
      'Informe a URL.',
    ]);
    expect(field.name()).toHaveAttribute('aria-invalid', 'true');
    expect(field.swagger()).toHaveAttribute('aria-invalid', 'false');
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(field.name(), 'x');
    expect(field.name()).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getAllByRole('alert')).toHaveLength(3);
  });

  it('valida formato e URL como o legado', async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<Harness initialOrbit="Dream team" />);
    await user.type(field.name(), 'nome com espaço');
    await user.type(field.team(), 'Pagamentos');
    await user.type(field.swagger(), 'ftp://x');
    await user.type(field.health(), 'https://u:p@host/health');
    await user.click(screen.getByRole('button', { name: 'Lançar em órbita' }));
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual([
      'Use letras sem acento, números, ".", "_" ou "-", começando por letra ou número.',
      'A URL deve começar com http:// ou https://',
      'Não inclua usuário ou senha na URL.',
    ]);
  });

  it('envia o POST no ambiente escolhido, com os campos aparados, e fecha limpando o cadastro', async () => {
    const created = {
      id: 'n1',
      name: 'novo-api',
      team: 'Pagamentos',
      healthCheckUrl: 'https://novo/health',
      orbits: ['Dream team'],
    };
    let resolve: (r: Response) => void = () => undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<Harness initialOrbit="Dream team" onCreated={onCreated} />);

    await user.click(screen.getByRole('button', { name: 'DESENVOLVIMENTO' }));
    expect(screen.getByRole('button', { name: 'DESENVOLVIMENTO' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.type(field.name(), '  novo-api ');
    await user.type(field.team(), 'Pagamentos');
    await user.type(field.health(), 'https://novo/health');
    await user.click(screen.getByRole('button', { name: 'Lançar em órbita' }));

    const submit = screen.getByRole('button', { name: 'Lançando…' });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('aria-busy', 'true');
    // ✕ e Cancelar não fecham enquanto envia.
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith('/api/applications/development', expect.anything());
    expect(sentBody(fetchMock)).toEqual({
      name: 'novo-api',
      team: 'Pagamentos',
      healthCheckUrl: 'https://novo/health',
      swaggerUrl: '',
      orbits: ['Dream team'],
    });

    await act(async () => {
      resolve(json(created, 201));
      await Promise.resolve();
    });
    expect(await screen.findByRole('button', { name: 'reabrir' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onCreated).toHaveBeenCalledWith({ ...created, env: 'dev', swaggerUrl: '' });

    await user.click(screen.getByRole('button', { name: 'reabrir' }));
    expect(field.name()).toHaveValue('');
    expect(screen.getByRole('button', { name: 'DESENVOLVIMENTO' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Dream team')).toBeInTheDocument();
  });

  it('o rascunho de um cadastro fechado sem enviar volta ao reabrir', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field.name(), 'rascunho');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'reabrir' }));
    expect(field.name()).toHaveValue('rascunho');
  });

  it('400 com fields marca os campos recusados e mostra o aviso geral', async () => {
    stubFetch(json({ error: 'Invalid application', fields: { name: 'Já existe.' } }, 400));
    const user = userEvent.setup();
    render(<Harness initialOrbit="Dream team" />);
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Lançar em órbita' }));
    expect(await screen.findByText('Já existe.')).toHaveAttribute('role', 'alert');
    expect(field.name()).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen.getByText('A API recusou os dados: revise os campos marcados.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lançar em órbita' })).toBeEnabled();
  });

  it('outra falha mostra "Não foi possível cadastrar" com o motivo', async () => {
    stubFetch(new Response(null, { status: 500 }));
    const user = userEvent.setup();
    render(<Harness initialOrbit="Dream team" />);
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Lançar em órbita' }));
    expect(
      await screen.findByText('Não foi possível cadastrar: a API respondeu 500.'),
    ).toBeInTheDocument();
  });

  it('resposta sem id é falha', async () => {
    stubFetch(json({ name: 'x' }, 201));
    const user = userEvent.setup();
    render(<Harness initialOrbit="Dream team" />);
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Lançar em órbita' }));
    expect(
      await screen.findByText('Não foi possível cadastrar: a API não devolveu o id da aplicação.'),
    ).toBeInTheDocument();
  });
});

describe('AppFormDialog: time', () => {
  it('sugere os times cadastrados, filtra pelo texto e escolhe com o mouse', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(field.team());
    expect(screen.getByRole('button', { name: 'Logística' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pagamentos' })).toBeInTheDocument();
    await user.type(field.team(), 'pag');
    expect(screen.queryByRole('button', { name: 'Logística' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pagamentos' }));
    expect(field.team()).toHaveValue('Pagamentos');
    expect(screen.queryByRole('button', { name: 'Pagamentos' })).not.toBeInTheDocument();
  });
});

describe('AppFormDialog: órbitas', () => {
  it('a órbita do filtro já vem escolhida e muda o placeholder', () => {
    render(<Harness initialOrbit="Dream team" />);
    expect(screen.getByText('Dream team')).toBeInTheDocument();
    expect(field.orbits()).toHaveAttribute('placeholder', 'Adicionar outra…');
  });

  it('combobox por teclado: setas, Enter, Esc e Backspace', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <AppFormDialog
        open
        editing={null}
        initialEnv="prd"
        initialOrbit={null}
        onClose={onClose}
        onCreated={vi.fn()}
        onUpdated={vi.fn()}
      />,
    );
    const input = field.orbits();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    await user.click(input);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('listbox');
    const options = within(list).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Dream team', 'Financeiro']);
    expect(input).toHaveAttribute('aria-activedescendant', options[0]?.id);

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', options[1]?.id);
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', options[0]?.id);
    await user.keyboard('{ArrowUp}{Enter}');
    expect(screen.getByRole('button', { name: /Remover órbita/ })).toBeInTheDocument();
    expect(within(screen.getByRole('listbox')).getAllByRole('option')[1]).toHaveTextContent(
      'Financeiro✓',
    );

    await user.keyboard('Nova');
    const create = within(screen.getByRole('listbox')).getByRole('option', {
      name: /Criar órbita “Nova”/,
    });
    expect(create).toHaveTextContent('ENTER');
    await user.keyboard('{Enter}');
    expect(input).toHaveValue('');
    expect(screen.getAllByRole('button', { name: /Remover órbita/ })).toHaveLength(2);

    // Esc com a lista aberta só fecha a lista; o segundo fecha o diálogo.
    await user.keyboard('{Escape}');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard('{Backspace}');
    expect(screen.getAllByRole('button', { name: /Remover órbita/ })).toHaveLength(1);
    expect(screen.getByText('Financeiro')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('o ✕ do chip tira a órbita', async () => {
    const user = userEvent.setup();
    render(<Harness initialOrbit="Dream team" />);
    await user.click(screen.getByRole('button', { name: /Remover órbita/ }));
    expect(screen.queryByText('Dream team')).not.toBeInTheDocument();
  });

  it('órbita digitada e não confirmada entra no envio', async () => {
    const fetchMock = stubFetch(
      json(
        {
          id: 'n',
          name: 'novo-api',
          team: 'Pagamentos',
          healthCheckUrl: 'https://novo/health',
          orbits: ['Financeiro', 'Nova'],
        },
        201,
      ),
    );
    const user = userEvent.setup();
    render(<Harness initialOrbit="financeiro" />);
    await fillValid(user);
    await user.type(field.orbits(), ' Nova ');
    await user.click(screen.getByRole('button', { name: 'Lançar em órbita' }));
    expect(sentBody(fetchMock)).toMatchObject({ orbits: ['financeiro', 'Nova'] });
  });

  it('órbita pendente conhecida entra com a grafia dela', async () => {
    const fetchMock = stubFetch(json({ error: 'x' }, 500));
    const user = userEvent.setup();
    render(<Harness />);
    await fillValid(user);
    await user.type(field.orbits(), 'dream team');
    await user.click(screen.getByRole('button', { name: 'Lançar em órbita' }));
    expect(sentBody(fetchMock)).toMatchObject({ orbits: ['Dream team'] });
    // A pendente vira chip e o campo esvazia.
    expect(field.orbits()).toHaveValue('');
    expect(screen.getByRole('button', { name: /Remover órbita/ })).toBeInTheDocument();
  });
});

describe('AppFormDialog: edição', () => {
  it('abre com os dados da app e o ambiente travado no dela', () => {
    render(<Harness editing={EDITING} />);
    expect(screen.getByRole('dialog', { name: 'Editar aplicação' })).toHaveTextContent(
      'AJUSTE DE ROTA',
    );
    expect(field.name()).toHaveValue('checkout-api');
    expect(field.team()).toHaveValue('Pagamentos');
    expect(field.swagger()).toHaveValue('http://a/swagger');
    expect(field.health()).toHaveValue('http://a/health');
    expect(screen.getByText('Dream team')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'HOMOLOGAÇÃO' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('button', { name: 'PRODUÇÃO' })).not.toBeInTheDocument();
    expect(screen.getByText('O ambiente não muda na edição.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeInTheDocument();
  });

  it('envia o PUT no ambiente da app e devolve a app a onUpdated', async () => {
    const saved = {
      id: 'a',
      name: 'checkout-api',
      team: 'Novo time',
      healthCheckUrl: 'http://a/health',
      swaggerUrl: 'http://a/swagger',
      orbits: ['Dream team'],
    };
    const fetchMock = stubFetch(json(saved));
    const onUpdated = vi.fn();
    const user = userEvent.setup();
    render(<Harness editing={EDITING} onUpdated={onUpdated} />);
    await user.click(screen.getByRole('button', { name: 'HOMOLOGAÇÃO' }));
    await user.clear(field.team());
    await user.type(field.team(), 'Novo time');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/applications/staging/a',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(await screen.findByRole('button', { name: 'reabrir' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onUpdated).toHaveBeenCalledWith({ ...saved, env: 'hml' });
  });

  it('404 na edição avisa que a app foi removida', async () => {
    stubFetch(json({ error: 'Not found' }, 404));
    const user = userEvent.setup();
    render(<Harness editing={EDITING} />);
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(
      await screen.findByText(
        'Esta aplicação não existe mais: ela foi removida. Feche o formulário.',
      ),
    ).toBeInTheDocument();
  });

  it('fechar a edição descarta as alterações e o próximo cadastro abre em branco', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness editing={EDITING} />);
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    rerender(<Harness editing={null} />);
    await user.click(screen.getByRole('button', { name: 'reabrir' }));
    expect(screen.getByRole('dialog', { name: 'Adicionar aplicação' })).toBeInTheDocument();
    expect(field.name()).toHaveValue('');
    // O cadastro em branco fica no ambiente da app editada (blankForm(form.env) do legado).
    expect(screen.getByRole('button', { name: 'HOMOLOGAÇÃO' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
