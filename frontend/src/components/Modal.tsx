import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react';
import mono from '@/theme/mono.module.css';
import styles from './Modal.module.css';

interface ModalProps {
  title: string;
  /** Rótulo mono acima do título. */
  eyebrow?: string;
  /** Cor do rótulo: `accent` (formulários) ou `down` (ações destrutivas). */
  eyebrowTone?: 'accent' | 'down';
  /** `sm` (400px, confirmação) ou `md` (480px, formulário). */
  size?: 'sm' | 'md';
  /** Clicar no fundo também fecha (o formulário não, para não perder o que foi digitado). */
  dismissOnBackdrop?: boolean;
  onClose: () => void;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
}

/**
 * Diálogo modal: fundo escurecido, foco preso lá dentro, Esc fecha e o foco volta a
 * quem o abriu. Quem usa renderiza o Modal só enquanto ele está aberto.
 */
export function Modal({
  title,
  eyebrow,
  eyebrowTone = 'accent',
  size = 'md',
  dismissOnBackdrop = false,
  onClose,
  children,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // O callback mais recente sem refazer o efeito (que mexe no foco) a cada render.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (focusables(dialog)[0] ?? dialog).focus();

    // Um Esc que quem está dentro já tratou (stopPropagation, ex.: lista aberta num
    // campo) não chega aqui; o resto fecha o diálogo.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables(dialog);
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const active = document.activeElement;
      if (!(active instanceof Node) || !dialog.contains(active) || active === dialog) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      opener?.focus();
    };
  }, []);

  const onBackdrop = (e: MouseEvent<HTMLDivElement>) => {
    if (dismissOnBackdrop && e.target === e.currentTarget) onClose();
  };

  return (
    // O fundo não é um controle: o teclado fecha com Esc e o clique é só conveniência.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div className={[styles.overlay, styles[size]].join(' ')} onClick={onBackdrop}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.dialog}
      >
        {eyebrow && (
          <div
            className={[mono.eyebrow, eyebrowTone === 'down' ? styles.down : styles.accent].join(
              ' ',
            )}
          >
            {eyebrow}
          </div>
        )}
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
