/**
 * Starting points for the empty state. 74 SKUs is a lot to face from scratch;
 * each preset is a plausible SKU mix for a common kind of product, sized so the
 * estimate lands past the free caps and into the graduated tiers where the
 * US/India gap actually shows up.
 */
export interface Preset {
  id: string
  label: string
  blurb: string
  volumes: Record<string, number>
}

export const PRESETS: Preset[] = [
  {
    id: 'store-locator',
    label: 'Store locator',
    blurb: 'A map on a marketing site with search and directions',
    volumes: {
      'maps-dynamic-maps': 250_000,
      'places-autocomplete-requests': 120_000,
      'places-geocoding': 80_000,
      'places-places-api-place-details-essentials': 40_000,
    },
  },
  {
    id: 'ride-hailing',
    label: 'Ride-hailing app',
    blurb: 'Live in-app maps, turn-by-turn routing and address search',
    volumes: {
      'maps-maps-sdk': 2_000_000,
      'routes-routes-compute-routes-essentials': 3_000_000,
      'navigation-sdk-navigation-request': 400_000,
      'places-autocomplete-requests': 1_500_000,
      'places-geocoding': 900_000,
    },
  },
  {
    id: 'fleet-logistics',
    label: 'Fleet & logistics',
    blurb: 'Multi-stop optimisation, road snapping and speed limits',
    volumes: {
      'routes-routes-compute-route-matrix-pro': 5_000_000,
      'routes-routeoptimization-fleetrouting': 200_000,
      'routes-roads-route-traveled': 1_000_000,
      'routes-roads-speed-limits': 800_000,
      'maps-dynamic-maps': 300_000,
    },
  },
  {
    id: 'listings-portal',
    label: 'Listings portal',
    blurb: 'Property or travel listings with imagery and rich place data',
    volumes: {
      'maps-dynamic-maps': 900_000,
      'maps-static-maps': 1_200_000,
      'maps-static-street-view': 600_000,
      'places-places-api-place-details-enterprise': 150_000,
      'places-autocomplete-requests': 700_000,
    },
  },
]
