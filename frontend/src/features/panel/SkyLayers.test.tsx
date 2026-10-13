import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';
import { SkyLayers } from './SkyLayers';

describe('SkyLayers', () => {
  it('desenha as estrelas uma vez no StrictMode e as remove no desmonte', () => {
    const { container, unmount } = render(
      <StrictMode>
        <SkyLayers />
      </StrictMode>,
    );
    const stars = container.querySelector('.stars');
    expect(stars?.querySelectorAll('svg')).toHaveLength(1);
    expect(stars?.querySelectorAll('circle')).toHaveLength(160);
    unmount();
    expect(stars?.querySelector('svg')).toBeNull();
  });
});
