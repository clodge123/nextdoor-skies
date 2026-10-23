// W4-A1 UNITS-CORE — useUnits() subscription hook.
//
// Seam for lane W4-A2 (header pill) and every temperature surface: returns
// the active Unit and re-renders the consumer when it changes. Sources:
//   1. the custom 'nds-units-changed' event (same-tab setUnit/toggleUnit)
//   2. the native 'storage' event (cross-tab nds-units writes)
//
// useSyncExternalStore keeps React 19 tearing-free; getUnit() reads storage
// on every call so the snapshot is always honest (private mode => 'F').

import { useSyncExternalStore } from 'react'
import {
  UNITS_CHANGED_EVENT,
  UNITS_STORAGE_KEY,
  getUnit,
  type Unit,
} from './units'

function subscribeUnits(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e: StorageEvent) => {
    // key === null (storage.clear) => re-read honestly; other keys ignored.
    if (e.key === null || e.key === UNITS_STORAGE_KEY) onChange()
  }
  window.addEventListener(UNITS_CHANGED_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(UNITS_CHANGED_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

/** Active display unit; re-renders consumers on same-tab + cross-tab change. */
export function useUnits(): Unit {
  return useSyncExternalStore(subscribeUnits, getUnit, () => 'F' as Unit)
}

export type { Unit }
