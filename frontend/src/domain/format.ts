// Hora do último ciclo: só o horário se for hoje, data e hora curtas se não for.
export function clockLabel(ts: number): string {
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString('pt-BR')
    : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function agoLabel(ts: number): string {
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return 'há menos de 1 min';
  if (min < 60) return `há ${String(min)} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `há ${String(h)} h` : `há ${String(Math.floor(h / 24))} d`;
}
