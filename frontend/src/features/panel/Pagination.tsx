import styles from './Pagination.module.css';

interface PaginationProps {
  /** Página atual (0-based, já limitada) e o total (≥ 1). */
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}

/** ‹ 1/3 ›: o botão no limite fica apagado e não faz nada. */
export function Pagination({ page, pageCount, onChange }: PaginationProps) {
  const canPrev = page > 0;
  const canNext = page < pageCount - 1;
  return (
    <div className={styles.pagination}>
      <button
        type="button"
        className={styles.nav}
        title="Página anterior"
        aria-label="Página anterior"
        aria-disabled={!canPrev}
        onClick={() => {
          if (canPrev) onChange(page - 1);
        }}
      >
        ‹
      </button>
      <span className={styles.label}>{`${String(page + 1)}/${String(pageCount)}`}</span>
      <button
        type="button"
        className={styles.nav}
        title="Próxima página"
        aria-label="Próxima página"
        aria-disabled={!canNext}
        onClick={() => {
          if (canNext) onChange(page + 1);
        }}
      >
        ›
      </button>
    </div>
  );
}
