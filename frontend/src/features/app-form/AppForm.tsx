import { useId } from 'react';
import { FIELD_LIMITS } from '@/domain/application-form';
import styles from './AppForm.module.css';
import { EnvTabs } from './EnvTabs';
import field from './Field.module.css';
import { OrbitCombobox } from './OrbitCombobox';
import { TeamField } from './TeamField';
import type { AppFormController } from './useAppForm';

interface TextFieldProps {
  label: string;
  required: boolean;
  value: string;
  error: string | undefined;
  onChange: (v: string) => void;
  maxLength: number;
  placeholder: string;
  mono?: boolean;
}

// Campo de texto simples do cadastro: rótulo, input e a mensagem de erro dele.
function TextField({
  label,
  required,
  value,
  error,
  onChange,
  maxLength,
  placeholder,
  mono = false,
}: TextFieldProps) {
  const labelId = useId();
  const errorId = useId();
  return (
    <label className={field.field}>
      <span id={labelId} className={field.label}>
        {label}{' '}
        {required ? (
          <span className={field.required}>*</span>
        ) : (
          <span className={field.optional}>(opcional)</span>
        )}
      </span>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        required={required}
        maxLength={maxLength}
        aria-labelledby={labelId}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? errorId : undefined}
        placeholder={placeholder}
        className={[field.input, mono ? field.mono : '', error ? field.invalid : ''].join(' ')}
      />
      {error && (
        <span id={errorId} role="alert" className={field.error}>
          {error}
        </span>
      )}
    </label>
  );
}

export interface AppFormProps {
  ctl: AppFormController;
}

/** Os campos e botões do cadastro/edição. */
export function AppForm({ ctl }: AppFormProps) {
  const { form, errors, formError, submitting, isEditing } = ctl;
  const submitLabel = isEditing
    ? submitting
      ? 'Salvando…'
      : 'Salvar alterações'
    : submitting
      ? 'Lançando…'
      : 'Lançar em órbita';
  return (
    <form onSubmit={ctl.submit} noValidate className={styles.form}>
      <TextField
        label="Nome da aplicação"
        required
        value={form.name}
        error={errors.name}
        onChange={(v) => {
          ctl.setField('name', v);
        }}
        maxLength={FIELD_LIMITS.name}
        placeholder="checkout-api"
      />
      <TeamField
        value={form.team}
        error={errors.team}
        onChange={(v) => {
          ctl.setField('team', v);
        }}
      />
      <EnvTabs value={form.env} locked={isEditing} onChange={ctl.setEnv} />
      <OrbitCombobox
        value={form.orbits}
        query={ctl.orbitQuery}
        error={errors.orbits}
        onQueryChange={ctl.setOrbitQuery}
        onToggle={ctl.toggleOrbit}
        onRemoveLast={ctl.removeLastOrbit}
      />
      <TextField
        label="URL do Swagger"
        required={false}
        value={form.swaggerUrl}
        error={errors.swaggerUrl}
        onChange={(v) => {
          ctl.setField('swaggerUrl', v);
        }}
        maxLength={FIELD_LIMITS.url}
        placeholder="https://api.exemplo.com/swagger-ui.html"
        mono
      />
      <TextField
        label="URL do health check"
        required
        value={form.healthCheckUrl}
        error={errors.healthCheckUrl}
        onChange={(v) => {
          ctl.setField('healthCheckUrl', v);
        }}
        maxLength={FIELD_LIMITS.url}
        placeholder="https://api.exemplo.com/actuator/health"
        mono
      />
      {formError && (
        <div role="alert" className={styles.formError}>
          {formError}
        </div>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={ctl.close}>
          Cancelar
        </button>
        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
          className={styles.submit}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
