import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { createApplication, updateApplication } from '@/api/applications';
import { apiErrorMsg, ApiError } from '@/api/http';
import {
  normalizeAppForm,
  validateAppForm,
  type AppForm,
  type AppFormField,
  type FormErrors,
} from '@/domain/application-form';
import { collectOrbits } from '@/domain/orbits';
import type { Application, EnvCode } from '@/domain/types';
import { useAppsStore } from '@/store/apps.store';
import {
  apiFieldErrors,
  blankForm,
  formFromApp,
  toggleOrbit,
  withPendingOrbit,
} from './app-form-model';

export interface UseAppFormOptions {
  open: boolean;
  editing: Application | null;
  initialEnv: EnvCode;
  initialOrbit: string | null;
  onClose: () => void;
  onCreated: (app: Application) => void;
  onUpdated: (app: Application) => void;
}

interface Draft {
  form: AppForm;
  errors: FormErrors;
  /** Erro geral (API), abaixo dos campos. */
  formError: string;
  /** Texto do campo de órbitas ainda não confirmado com Enter. */
  orbitQuery: string;
  submitting: boolean;
}

export interface AppFormController {
  form: AppForm;
  errors: FormErrors;
  formError: string;
  orbitQuery: string;
  submitting: boolean;
  /** Edição: PUT e ambiente travado no da app. */
  isEditing: boolean;
  /** Mudar um campo limpa o erro dele: a mensagem só volta no próximo envio. */
  setField: (k: 'name' | 'team' | 'swaggerUrl' | 'healthCheckUrl', value: string) => void;
  setEnv: (env: EnvCode) => void;
  setOrbitQuery: (q: string) => void;
  toggleOrbit: (name: string) => void;
  removeLastOrbit: () => void;
  submit: (e?: SyntheticEvent) => void;
  /** ✕, Cancelar e Esc: ignorado enquanto envia. */
  close: () => void;
}

function withoutError(errors: FormErrors, k: AppFormField): FormErrors {
  if (!(k in errors)) return errors;
  const next = { ...errors };
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- cópia local por campo
  delete next[k];
  return next;
}

/**
 * Estado e envio do formulário de cadastro/edição. O diálogo
 * fica montado: o rascunho de um cadastro fechado sem enviar sobrevive, e a abertura
 * (open/editing vindos de quem usa) decide se o form volta em branco ou vem da app.
 */
export function useAppForm(opts: UseAppFormOptions): AppFormController {
  const { open, editing, initialEnv, initialOrbit } = opts;
  const [draft, setDraft] = useState<Draft>(() => ({
    form: blankForm(initialEnv, initialOrbit),
    errors: {},
    formError: '',
    orbitQuery: '',
    submitting: false,
  }));
  const [seen, setSeen] = useState<{ open: boolean; editing: Application | null }>({
    open: false,
    editing: null,
  });

  // Abrir e fechar vêm por props: o estado acompanha durante a renderização, sem efeito.
  if (seen.open !== open || seen.editing !== editing) {
    setSeen({ open, editing });
    const cleared = { ...draft, errors: {}, formError: '' };
    if (!open) {
      // Fechar a edição descarta as alterações: o + abre de novo um cadastro em branco.
      if (seen.open)
        setDraft(
          seen.editing
            ? { ...cleared, form: blankForm(draft.form.env, initialOrbit), orbitQuery: '' }
            : cleared,
        );
    } else if (editing) {
      if (editing !== seen.editing || !seen.open)
        setDraft({ ...cleared, form: formFromApp(editing), orbitQuery: '' });
    } else if (!seen.open || seen.editing) {
      // Cadastro: o rascunho sem nome volta em branco (na órbita atual). Vindo de uma
      // edição (sem passar pelo fechar), o form também volta em branco.
      if (seen.editing)
        setDraft({ ...cleared, form: blankForm(draft.form.env, initialOrbit), orbitQuery: '' });
      else
        setDraft(
          draft.form.name ? cleared : { ...cleared, form: blankForm(draft.form.env, initialOrbit) },
        );
    }
  }

  // Os callbacks e a órbita mais recentes, para quando o envio terminar.
  const latest = useRef(opts);
  useEffect(() => {
    latest.current = opts;
  });
  // Duplo clique / Enter repetido: um envio por vez (o estado só muda no próximo render).
  const busy = useRef(false);

  const isEditing = editing !== null;

  const patchForm = (
    patch: Partial<AppForm>,
    field: AppFormField | null,
    extra: Partial<Draft> = {},
  ) => {
    setDraft((d) => ({
      ...d,
      form: { ...d.form, ...patch },
      errors: field ? withoutError(d.errors, field) : d.errors,
      ...extra,
    }));
  };

  async function send(f: AppForm, target: Application | null) {
    const payload = normalizeAppForm(f);
    const verb = target ? 'salvar' : 'cadastrar';
    busy.current = true;
    setDraft((d) => ({ ...d, submitting: true, errors: {}, formError: '' }));
    let app: Application;
    try {
      app = target
        ? await updateApplication(target.env, target.id, payload)
        : await createApplication(f.env, payload);
    } catch (e) {
      const fields = apiFieldErrors(e);
      const formError = fields
        ? 'A API recusou os dados: revise os campos marcados.'
        : // 404 na edição: a app foi removida (outra aba, outra pessoa).
          target && e instanceof ApiError && e.status === 404
          ? 'Esta aplicação não existe mais: ela foi removida. Feche o formulário.'
          : `Não foi possível ${verb}: ${apiErrorMsg(e)}`;
      setDraft((d) => ({ ...d, submitting: false, errors: fields ?? {}, formError }));
      return;
    } finally {
      busy.current = false;
    }
    const cur = latest.current;
    // A app nova entra no próximo ciclo do servidor; não há check imediato.
    setDraft({
      form: blankForm(app.env, cur.initialOrbit),
      errors: {},
      formError: '',
      orbitQuery: '',
      submitting: false,
    });
    if (target) cur.onUpdated(app);
    else cur.onCreated(app);
    cur.onClose();
  }

  return {
    ...draft,
    isEditing,
    setField: (k, value) => {
      patchForm({ [k]: value }, k);
    },
    setEnv: (env) => {
      if (!isEditing) patchForm({ env }, null);
    },
    setOrbitQuery: (orbitQuery) => {
      setDraft((d) => ({ ...d, orbitQuery }));
    },
    toggleOrbit: (name) => {
      const orbits = toggleOrbit(draft.form.orbits, name);
      if (orbits) patchForm({ orbits }, 'orbits', { orbitQuery: '' });
    },
    removeLastOrbit: () => {
      patchForm({ orbits: draft.form.orbits.slice(0, -1) }, 'orbits');
    },
    submit: (e) => {
      e?.preventDefault();
      if (busy.current) return;
      // Órbita digitada e não confirmada com Enter também entra.
      const known = collectOrbits(useAppsStore.getState().apps);
      const f = withPendingOrbit(draft.form, draft.orbitQuery, known);
      if (f !== draft.form) setDraft((d) => ({ ...d, form: f, orbitQuery: '' }));
      const errors = validateAppForm(f);
      if (Object.keys(errors).length) {
        setDraft((d) => ({ ...d, errors, formError: '' }));
        return;
      }
      void send(f, editing);
    },
    close: () => {
      if (!draft.submitting) opts.onClose();
    },
  };
}
