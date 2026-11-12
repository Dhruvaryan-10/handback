import type { PriceList } from './domain/pricing.js';
import type { Item, Store } from './store/types.js';

/** Demo shop "Lensworks Rentals". Prices are the shop's own, in cents. */
const cameraPrices: PriceList = {
  scratch: { minor: 1000, moderate: 2500, severe: 6000 },
  dent: { minor: 2000, moderate: 4500, severe: 9000 },
  crack: { minor: 2500, moderate: 4500, severe: 12000 },
  missing_part: { minor: 1500, moderate: 4000, severe: 15000 },
  stain: { minor: 500, moderate: 1500, severe: 3000 },
  other: { minor: 1000, moderate: 2500, severe: 5000 },
};

const bikePrices: PriceList = {
  scratch: { minor: 500, moderate: 1500, severe: 4000 },
  dent: { minor: 1500, moderate: 3500, severe: 8000 },
  crack: { minor: 3000, moderate: 6000, severe: 15000 },
  missing_part: { minor: 1000, moderate: 3000, severe: 9000 },
  stain: { minor: 0, moderate: 1000, severe: 2500 },
  other: { minor: 1000, moderate: 2500, severe: 5000 },
};

const electronicsPrices: PriceList = {
  scratch: { minor: 800, moderate: 2000, severe: 5000 },
  dent: { minor: 1500, moderate: 4000, severe: 8000 },
  crack: { minor: 3000, moderate: 7500, severe: 18000 },
  missing_part: { minor: 1500, moderate: 3500, severe: 12000 },
  stain: { minor: 500, moderate: 1500, severe: 3000 },
  other: { minor: 1000, moderate: 2500, severe: 6000 },
};

const outdoorPrices: PriceList = {
  scratch: { minor: 0, moderate: 1000, severe: 2500 },
  dent: { minor: 1000, moderate: 2500, severe: 6000 },
  crack: { minor: 2000, moderate: 5000, severe: 12000 },
  missing_part: { minor: 800, moderate: 2500, severe: 7000 },
  stain: { minor: 0, moderate: 1500, severe: 4000 },
  other: { minor: 800, moderate: 2000, severe: 5000 },
};

const toolPrices: PriceList = {
  scratch: { minor: 0, moderate: 800, severe: 2000 },
  dent: { minor: 800, moderate: 2000, severe: 5000 },
  crack: { minor: 1500, moderate: 4000, severe: 9000 },
  missing_part: { minor: 1000, moderate: 3000, severe: 8000 },
  stain: { minor: 0, moderate: 500, severe: 1500 },
  other: { minor: 800, moderate: 2000, severe: 4500 },
};

/**
 * Catalog. Every item has a "front" angle (the demo photos use it). Deposit = refundable security;
 * dailyRateCents = what the shop charges for lending, billed per started day.
 */
export const seedItems: Item[] = [
  // Cameras & video
  { id: 'cam-a7iv', name: 'Mirrorless camera + 24-70mm lens', category: 'Cameras', depositCents: 30000, dailyRateCents: 4500, angles: ['front', 'back', 'top', 'lens'], priceList: cameraPrices },
  { id: 'lens-70200', name: '70-200mm f/2.8 telephoto lens', category: 'Cameras', depositCents: 25000, dailyRateCents: 3500, angles: ['front', 'side', 'mount', 'hood'], priceList: cameraPrices },
  { id: 'cine-kit', name: 'Cinema camera kit with rig', category: 'Cameras', depositCents: 60000, dailyRateCents: 12000, angles: ['front', 'left', 'right', 'monitor'], priceList: cameraPrices },
  { id: 'action-cam', name: 'Action camera + mounts', category: 'Cameras', depositCents: 10000, dailyRateCents: 1500, angles: ['front', 'back', 'mounts'], priceList: cameraPrices },
  { id: 'drone-mini', name: 'Compact camera drone', category: 'Cameras', depositCents: 25000, dailyRateCents: 4000, angles: ['top', 'bottom', 'front', 'controller'], priceList: cameraPrices },
  // Electronics
  { id: 'laptop-16', name: '16-inch creator laptop', category: 'Electronics', depositCents: 50000, dailyRateCents: 6000, angles: ['front', 'lid', 'keyboard', 'base'], priceList: electronicsPrices },
  { id: 'projector-4k', name: '4K portable projector + screen', category: 'Electronics', depositCents: 20000, dailyRateCents: 3500, angles: ['front', 'top', 'screen'], priceList: electronicsPrices },
  { id: 'pa-speaker', name: 'Party PA speaker pair', category: 'Electronics', depositCents: 15000, dailyRateCents: 3000, angles: ['front', 'back', 'grille'], priceList: electronicsPrices },
  { id: 'vr-headset', name: 'VR headset + controllers', category: 'Electronics', depositCents: 15000, dailyRateCents: 2500, angles: ['front', 'lenses', 'controllers'], priceList: electronicsPrices },
  { id: 'console-kit', name: 'Game console + 2 controllers', category: 'Electronics', depositCents: 15000, dailyRateCents: 2000, angles: ['front', 'top', 'controllers'], priceList: electronicsPrices },
  // Mobility & outdoor
  { id: 'ebike-city', name: 'City e-bike', category: 'Mobility', depositCents: 40000, dailyRateCents: 3500, angles: ['left', 'right', 'front', 'battery'], priceList: bikePrices },
  { id: 'escooter', name: 'Electric scooter', category: 'Mobility', depositCents: 20000, dailyRateCents: 2000, angles: ['front', 'left', 'deck', 'handlebar'], priceList: bikePrices },
  { id: 'kayak-2p', name: 'Inflatable 2-person kayak', category: 'Outdoor', depositCents: 15000, dailyRateCents: 3000, angles: ['front', 'top', 'paddles'], priceList: outdoorPrices },
  { id: 'tent-4p', name: '4-person camping tent', category: 'Outdoor', depositCents: 8000, dailyRateCents: 1500, angles: ['front', 'side', 'poles'], priceList: outdoorPrices },
  { id: 'paddleboard', name: 'Stand-up paddleboard', category: 'Outdoor', depositCents: 12000, dailyRateCents: 2500, angles: ['front', 'deck', 'fin'], priceList: outdoorPrices },
  // Tools
  { id: 'drill-kit', name: 'Cordless drill + driver kit', category: 'Tools', depositCents: 6000, dailyRateCents: 1200, angles: ['front', 'side', 'battery'], priceList: toolPrices },
  { id: 'pressure-washer', name: 'Pressure washer', category: 'Tools', depositCents: 10000, dailyRateCents: 2500, angles: ['front', 'hose', 'nozzle'], priceList: toolPrices },
];

export async function seed(store: Store) {
  // Upsert every time so new catalog items and rates reach an existing database too.
  for (const item of seedItems) await store.upsertItem(item);
}
