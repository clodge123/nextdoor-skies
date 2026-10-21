import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MapProvider, useMapContext } from './map-context';

function Probe() {
  const ctx = useMapContext();
  return (
    <div>
      <span data-testid="ready">{String(ctx.ready)}</span>
      <span data-testid="warn">{ctx.tileWarnings}</span>
      <span data-testid="tier">{ctx.tier}</span>
    </div>
  );
}

describe('map-context seam (L5 -> L6)', () => {
  it('exposes map instance + counters through context', () => {
    const fakeMap = { id: 'maplibre-fake' } as never;
    render(
      <MapProvider map={fakeMap} ready tileWarnings={3} tier="city">
        <Probe />
      </MapProvider>,
    );
    expect(screen.getByTestId('ready').textContent).toBe('true');
    expect(screen.getByTestId('warn').textContent).toBe('3');
    expect(screen.getByTestId('tier').textContent).toBe('city');
  });
});
