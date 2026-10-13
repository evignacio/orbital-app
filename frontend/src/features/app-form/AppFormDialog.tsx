import { Modal } from '@/components/Modal';
import type { Application, EnvCode } from '@/domain/types';

export interface AppFormDialogProps {
  /**
   * O diálogo fica montado e só se mostra com `open`: o rascunho de um cadastro
   * fechado sem enviar volta ao reabrir (openForm do legado só zera sem nome).
   */
  open: boolean;
  /** App em edição (PUT, ambiente travado no dela); null é cadastro novo (POST). */
  editing: Application | null;
  /** Ambiente inicial de um cadastro novo (o da tela, no painel). */
  initialEnv: EnvCode;
  /** Nome da órbita pré-selecionada num cadastro novo (blankForm); null sem órbita. */
  initialOrbit: string | null;
  /** ✕ e Cancelar (ignorados enquanto envia); também chamado depois do sucesso. */
  onClose: () => void;
  /** POST ok, com a app devolvida pela API; em seguida o diálogo chama onClose. */
  onCreated: (app: Application) => void;
  /** PUT ok, com a app devolvida pela API; em seguida o diálogo chama onClose. */
  onUpdated: (app: Application) => void;
}

/**
 * Modal de cadastro/edição de aplicação (painel.html ~239–340, legacy/app-form.js),
 * reaproveitado pela galáxia na F4: nada aqui é do painel. A lista de apps (times e
 * órbitas sugeridos) vem de useAppsStore. Stub da F3a; a F3d implementa.
 */
export function AppFormDialog({ open, editing, onClose }: AppFormDialogProps) {
  if (!open) return null;
  return (
    <Modal
      title={editing ? 'Editar aplicação' : 'Adicionar aplicação'}
      eyebrow={editing ? 'AJUSTE DE ROTA' : 'NOVO LANÇAMENTO'}
      onClose={onClose}
    >
      <button type="button" onClick={onClose}>
        Cancelar
      </button>
    </Modal>
  );
}
