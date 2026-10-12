// Único ponto de acesso ao localStorage. Ele pode faltar ou lançar (modo privado,
// cota cheia, dados do site bloqueados) e o JSON gravado pode estar corrompido:
// nenhuma falha daqui sai para quem chama, que recebe o valor padrão.

export function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Devolve `false` se não deu para gravar. */
export function writeString(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // sem localStorage não há o que remover
  }
}

// O que está gravado é dado externo: `parse` valida e converte (e pode lançar).
export function readJson<T>(key: string, parse: (raw: unknown) => T, fallback: T): T {
  const text = readString(key);
  if (text === null) return fallback;
  try {
    return parse(JSON.parse(text));
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    return writeString(key, JSON.stringify(value));
  } catch {
    return false;
  }
}
