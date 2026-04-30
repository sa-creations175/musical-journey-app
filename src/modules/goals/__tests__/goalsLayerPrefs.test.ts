// @vitest-environment jsdom
/**
 * Phase 2 step 6h.2 — tests for the layer-level localStorage
 * prefs that survive across reloads (collapse overrides per
 * scope + hidden layers list).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadLayerCollapse,
  saveLayerCollapse,
  parseLayerCollapse,
  loadHiddenLayers,
  saveHiddenLayers,
  parseHiddenLayers,
  STORAGE_KEY_LAYER_COLLAPSE,
  STORAGE_KEY_HIDDEN_LAYERS,
} from '../goalsLayerPrefs';

beforeEach(() => {
  localStorage.clear();
});

describe('parseLayerCollapse', () => {
  it('returns {} for null / undefined / non-object inputs', () => {
    expect(parseLayerCollapse(null)).toEqual({});
    expect(parseLayerCollapse(undefined)).toEqual({});
    expect(parseLayerCollapse('legacy')).toEqual({});
    expect(parseLayerCollapse(42)).toEqual({});
    expect(parseLayerCollapse(['weekly'])).toEqual({});
  });

  it('keeps recognized scope/value entries only', () => {
    expect(
      parseLayerCollapse({
        weekly: 'collapsed',
        monthly: 'expanded',
        quarterly: 'open',           // unknown value
        yearly: 'collapsed',
        bogus: 'collapsed',          // unknown scope
        lifetime: 42,                // wrong type
      }),
    ).toEqual({
      weekly: 'collapsed',
      monthly: 'expanded',
      yearly: 'collapsed',
    });
  });

  it('returns {} when nothing valid remains', () => {
    expect(parseLayerCollapse({ bogus: 'collapsed' })).toEqual({});
  });
});

describe('layer collapse round-trip', () => {
  it('returns {} on first visit', () => {
    expect(loadLayerCollapse()).toEqual({});
  });

  it('persists overrides across reload', () => {
    saveLayerCollapse({ weekly: 'collapsed', yearly: 'expanded' });
    expect(loadLayerCollapse()).toEqual({
      weekly: 'collapsed',
      yearly: 'expanded',
    });
  });

  it('falls back to {} when stored JSON is malformed', () => {
    localStorage.setItem(STORAGE_KEY_LAYER_COLLAPSE, '{not json');
    expect(loadLayerCollapse()).toEqual({});
  });

  it('drops invalid entries on load', () => {
    localStorage.setItem(
      STORAGE_KEY_LAYER_COLLAPSE,
      JSON.stringify({ weekly: 'collapsed', bogus: 'collapsed' }),
    );
    expect(loadLayerCollapse()).toEqual({ weekly: 'collapsed' });
  });
});

describe('parseHiddenLayers', () => {
  it('returns [] for non-array inputs', () => {
    expect(parseHiddenLayers(null)).toEqual([]);
    expect(parseHiddenLayers(undefined)).toEqual([]);
    expect(parseHiddenLayers({ weekly: true })).toEqual([]);
    expect(parseHiddenLayers('weekly')).toEqual([]);
  });

  it('keeps only valid scope strings', () => {
    expect(
      parseHiddenLayers(['weekly', 'monthly', 'bogus', 42, null]),
    ).toEqual(['weekly', 'monthly']);
  });

  it('dedupes the array', () => {
    expect(parseHiddenLayers(['weekly', 'weekly', 'monthly'])).toEqual([
      'weekly',
      'monthly',
    ]);
  });
});

describe('hidden layers round-trip', () => {
  it('returns [] on first visit', () => {
    expect(loadHiddenLayers()).toEqual([]);
  });

  it('persists hidden-layer list across reload', () => {
    saveHiddenLayers(['weekly', 'lifetime']);
    expect(loadHiddenLayers()).toEqual(['weekly', 'lifetime']);
  });

  it('falls back to [] when stored JSON is malformed', () => {
    localStorage.setItem(STORAGE_KEY_HIDDEN_LAYERS, '{not json');
    expect(loadHiddenLayers()).toEqual([]);
  });
});

describe('storage key pinning', () => {
  // Pin both keys — silently renaming either would orphan
  // every existing user's saved state on first load post-deploy.
  it('STORAGE_KEY_LAYER_COLLAPSE is goals.home.layerCollapse', () => {
    expect(STORAGE_KEY_LAYER_COLLAPSE).toBe('goals.home.layerCollapse');
  });

  it('STORAGE_KEY_HIDDEN_LAYERS is goals.home.hiddenLayers', () => {
    expect(STORAGE_KEY_HIDDEN_LAYERS).toBe('goals.home.hiddenLayers');
  });
});
