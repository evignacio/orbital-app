import type { Application } from '@/domain/types';

export interface AppMutations {
  /** Cadastro feito: a app entra na lista e a tela vai para o ambiente dela (onAppCreated). */
  onCreated: (app: Application) => void;
  /** Edição feita: troca no lugar; URL de health check nova volta a "não verificado" (onAppUpdated). */
  onUpdated: (app: Application) => void;
}

function ignore(): void {
  // Stub da F3a: a F3d implementa os dois callbacks.
}

/** Callbacks do formulário no painel (legacy/script.js ~792–807). Stub da F3a; a F3d implementa. */
export function useAppMutations(): AppMutations {
  return { onCreated: ignore, onUpdated: ignore };
}
