import { useMemo } from 'react';
import { Switch } from '@/components/Switch';
import { envLabel, ENV_CODES } from '@/domain/environments';
import { clockLabel } from '@/domain/format';
import { statusText } from '@/domain/status';
import type { EnvCode } from '@/domain/types';
import { useEventStreamControls } from '@/hooks/EventStreamContext';
import { useAppsStore } from '@/store/apps.store';
import { useConnectionStore } from '@/store/connection.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { useStatusStore } from '@/store/status.store';

// Cada item lê só o seu status: um evento de status renderiza uma linha, não a lista.
function AppRow({
  id,
  name,
  team,
  orbits,
}: {
  id: string;
  name: string;
  team: string;
  orbits: string[];
}) {
  const status = useStatusStore((s) => s.status[id]);
  return (
    <li>
      {name} ({team}) [{orbits.join(', ')}]: {statusText(status)}
    </li>
  );
}

function EnvSection({ env }: { env: EnvCode }) {
  const apps = useAppsStore((s) => s.apps);
  const cycle = useStatusStore((s) => s.cycles[env]);
  const stale = useStatusStore((s) => s.staleEnvs.includes(env));
  const list = useMemo(() => apps.filter((a) => a.env === env), [apps, env]);
  return (
    <section>
      <h2>{envLabel(env)}</h2>
      <p>
        Último ciclo: {cycle === null ? 'nenhum' : clockLabel(cycle)}
        {stale ? ' (status antigo)' : ''}
      </p>
      <ul>
        {list.map((a) => (
          <AppRow key={a.id} id={a.id} name={a.name} team={a.team} orbits={a.orbits} />
        ))}
      </ul>
    </section>
  );
}

// Temporária: só prova que stores, hooks e AppShell andam juntos. Sai na F3.
export function DiagnosticPage() {
  const apiDown = useConnectionStore((s) => s.apiDown);
  const lastOk = useConnectionStore((s) => s.lastOk);
  const staleEnvs = useStatusStore((s) => s.staleEnvs);
  const theme = usePreferencesStore((s) => s.theme);
  const setTheme = usePreferencesStore((s) => s.setTheme);
  const { reconnectIfClosed } = useEventStreamControls();

  return (
    <main style={{ padding: 16, background: 'var(--bg)', color: 'var(--ink)', minHeight: '100vh' }}>
      <h1>Diagnóstico</h1>
      <p>API: {apiDown ? 'inacessível' : 'no ar'}</p>
      {apiDown && (
        <button
          type="button"
          onClick={() => {
            reconnectIfClosed();
            void useAppsStore.getState().loadApps();
          }}
        >
          Tentar agora
        </button>
      )}
      <p>Última resposta: {lastOk === null ? 'nunca' : clockLabel(lastOk)}</p>
      <p>Ambientes com status antigo: {staleEnvs.length > 0 ? staleEnvs.join(', ') : 'nenhum'}</p>
      <Switch
        label="Tema claro"
        checked={theme === 'light'}
        onChange={(on) => {
          setTheme(on ? 'light' : 'dark');
        }}
      />
      {ENV_CODES.map((env) => (
        <EnvSection key={env} env={env} />
      ))}
    </main>
  );
}
