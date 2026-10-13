import { Modal } from '@/components/Modal';
import type { Application, EnvCode } from '@/domain/types';
import { AppForm } from './AppForm';
import styles from './AppFormDialog.module.css';
import { useAppForm } from './useAppForm';

export interface AppFormDialogProps {
  /**
   * O diálogo fica montado e só se mostra com `open`: o rascunho de um cadastro
   * fechado sem enviar volta ao reabrir (openForm do legado só zera sem nome).
   */
  open: boolean;
  /** App em edição (PUT, ambiente travado no dela); null é cadastro novo (POST). */
  editing: Application | null;
  /**
   * Ambiente do primeiro cadastro (o da tela, no painel). Depois o form guarda o
   * dele: o próximo cadastro em branco nasce no ambiente do último envio ou edição,
   * como o blankForm(form.env) do legado.
   */
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
 * reaproveitado pela galáxia: nada aqui é do painel. A lista de apps (times e órbitas
 * sugeridos) vem de useAppsStore. O fundo não fecha, para não perder o que foi digitado.
 */
export function AppFormDialog(props: AppFormDialogProps) {
  const ctl = useAppForm(props);
  if (!props.open) return null;
  return (
    <Modal
      title={ctl.isEditing ? 'Editar aplicação' : 'Adicionar aplicação'}
      eyebrow={ctl.isEditing ? 'AJUSTE DE ROTA' : 'NOVO LANÇAMENTO'}
      onClose={ctl.close}
    >
      <div className={styles.body}>
        <AppForm ctl={ctl} />
      </div>
      {/* Depois dos campos no DOM: o foco inicial do Modal cai no nome, não no ✕. */}
      <button type="button" aria-label="Fechar" className={styles.close} onClick={ctl.close}>
        ✕
      </button>
    </Modal>
  );
}
