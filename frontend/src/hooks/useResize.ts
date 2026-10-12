import { useEffect, useRef, type RefObject } from 'react';
import { RESIZE_DEBOUNCE_MS } from '../domain/constants';

/**
 * Chama `onResize` quando o elemento do ref muda de tamanho. Arrastar a borda da
 * janela dispara o observer a cada quadro: espera RESIZE_DEBOUNCE_MS depois do
 * último evento e ignora se o tamanho final é o do último disparo.
 */
export function useResize(ref: RefObject<HTMLElement | null>, onResize: () => void): void {
  // O callback mais recente sem religar o observer a cada render.
  const latest = useRef(onResize);
  useEffect(() => {
    latest.current = onResize;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastSize = '';
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const size = `${el.clientWidth}x${el.clientHeight}`;
        if (size === lastSize) return;
        lastSize = size;
        latest.current();
      }, RESIZE_DEBOUNCE_MS);
    });
    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [ref]);
}
