// Provider registry — the single swap point for external data sources.
//
//   configureProviders({ availability: irctcAvailabilityProvider })
//
// Feature code always reads `getProviders()`, so a live railway integration
// only needs to register itself once (e.g. at app bootstrap).

import { defaultProviders } from "./default-providers";
import type { ProviderBundle } from "./types";

let active: ProviderBundle = { ...defaultProviders };

export function getProviders(): ProviderBundle {
  return active;
}

export function configureProviders(overrides: Partial<ProviderBundle>): ProviderBundle {
  active = { ...active, ...overrides };
  return active;
}

export function resetProviders(): ProviderBundle {
  active = { ...defaultProviders };
  return active;
}

/** True when every registered provider serves live railway data. */
export function isFullyLive(): boolean {
  return Object.values(active).every((p) => p.isLive);
}
