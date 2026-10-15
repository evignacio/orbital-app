import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { isTopModal, pushModal, removeModal, useModalOpen } from '@/components/modal-stack';

describe('modal-stack', () => {
  it('marca data-modal no <html> enquanto houver um modal aberto', () => {
    const a = {};
    const b = {};
    pushModal(a);
    pushModal(b);
    expect(document.documentElement.dataset.modal).toBe('open');
    expect(isTopModal(b)).toBe(true);
    removeModal(b);
    expect(document.documentElement.dataset.modal).toBe('open');
    expect(isTopModal(a)).toBe(true);
    removeModal(a);
    expect(document.documentElement.dataset.modal).toBeUndefined();
  });

  it('remover um modal que não está na pilha não tira outro', () => {
    const a = {};
    pushModal(a);
    removeModal({});
    expect(isTopModal(a)).toBe(true);
    removeModal(a);
  });

  it('useModalOpen reage à abertura e ao fechamento', () => {
    const { result } = renderHook(() => useModalOpen());
    expect(result.current).toBe(false);
    const token = {};
    act(() => {
      pushModal(token);
    });
    expect(result.current).toBe(true);
    act(() => {
      removeModal(token);
    });
    expect(result.current).toBe(false);
  });
});
