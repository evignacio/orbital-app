import { Modal } from '@/components/Modal';
import type { Application } from '@/domain/types';

export interface RemoveDialogProps {
  /** A app pendente (pendingRemoveId), só se estiver no envApps da tela (removeVals ~985). */
  app: Application;
  /**
   * Cancelar/Esc/fundo (cancelRemove: ignorado enquanto remove). Depois de remover,
   * o commitApps sem a app já solta a pendência (usePanelLifecycle) e o diálogo some.
   */
  onClose: () => void;
}

/**
 * Confirmação de remoção (painel.html ~341–366, confirmRemove ~774). A PanelPage o
 * renderiza só enquanto há remoção pendente. Stub da F3a; a F3c implementa.
 */
export function RemoveDialog({ app, onClose }: RemoveDialogProps) {
  return (
    <Modal
      title={`Remover ${app.name}?`}
      eyebrow="REMOVER DA ÓRBITA"
      eyebrowTone="down"
      size="sm"
      dismissOnBackdrop
      onClose={onClose}
    >
      <button type="button" onClick={onClose}>
        Cancelar
      </button>
    </Modal>
  );
}
