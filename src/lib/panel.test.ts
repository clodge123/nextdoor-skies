// W3-B2 TOWN PANEL — panel URL-state logic (the panel open/close contract).
import { describe, expect, it } from 'vitest';
import {
  PANEL_PARAM,
  panelCloseHref,
  panelOpenHref,
  panelSlugFromSearch,
} from './panel';

describe('panelSlugFromSearch', () => {
  it('reads the panel slug from a query string', () => {
    expect(panelSlugFromSearch('?panel=springfield-37.22--93.3')).toBe('springfield-37.22--93.3');
  });

  it('accepts a raw (no leading ?) search string', () => {
    expect(panelSlugFromSearch('panel=salina-38.84--97.61')).toBe('salina-38.84--97.61');
  });

  it('returns null with no panel param / empty search', () => {
    expect(panelSlugFromSearch('')).toBeNull();
    expect(panelSlugFromSearch('?')).toBeNull();
    expect(panelSlugFromSearch('?ndsCenter=1,2')).toBeNull();
    expect(panelSlugFromSearch('?panel=')).toBeNull();
  });

  it('keeps other params untouched (ndsCenter coexists with panel)', () => {
    expect(panelSlugFromSearch('?ndsCenter=-97.6%2C38.8&panel=x-1-2')).toBe('x-1-2');
  });
});

describe('panelOpenHref', () => {
  it('sets the panel param on the map route', () => {
    expect(panelOpenHref('', 'salina-38.84--97.61')).toBe('/?panel=salina-38.84--97.61');
  });

  it('preserves existing query params (test hook ndsCenter)', () => {
    const href = panelOpenHref('?ndsCenter=-97.6114%2C38.8403', 'salina-38.84--97.61');
    expect(href).toContain('ndsCenter=-97.6114%2C38.8403');
    expect(href).toContain('panel=salina-38.84--97.61');
    expect(href.startsWith('/?')).toBe(true);
  });

  it('replaces a stale panel slug (badge A -> badge B switches towns)', () => {
    const href = panelOpenHref('?panel=town-a-1-1', 'town-b-2-2');
    expect(panelSlugFromSearch(href)).toBe('town-b-2-2');
    expect(href.match(/panel=/g)).toHaveLength(1);
  });
});

describe('panelCloseHref', () => {
  it('drops only the panel param, keeps everything else', () => {
    expect(panelCloseHref('?panel=salina-38.84--97.61')).toBe('/');
    const href = panelCloseHref('?panel=x-1-2&ndsCenter=1%2C2');
    expect(href).toBe('/?ndsCenter=1%2C2');
    expect(panelSlugFromSearch(href)).toBeNull();
  });

  it('is idempotent when no panel is open', () => {
    expect(panelCloseHref('')).toBe('/');
    expect(panelCloseHref('?ndsCenter=1%2C2')).toBe('/?ndsCenter=1%2C2');
  });
});

describe('scheme law', () => {
  it('the panel param name is exactly "panel"', () => {
    expect(PANEL_PARAM).toBe('panel');
  });

  it('open then close round-trips to the original search', () => {
    const open = panelOpenHref('?ndsCenter=1%2C2', 'salina-38.84--97.61');
    const closed = panelCloseHref(open);
    expect(closed).toBe('/?ndsCenter=1%2C2');
  });
});
