const EARTH_RADIUS_M = 6_371_000;

/** Distance in meters between two points (haversine). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Whether a guest's reported position counts as "at the gig". Phone GPS indoors can be off by
 * tens of meters, so the reported accuracy is added to the radius, capped so a very vague fix
 * can't stretch the radius far.
 */
export function isWithinGig(
  gig: { lat: number; lng: number; radiusM: number },
  guest: { lat: number; lng: number; accuracyM?: number | null },
): boolean {
  const slack = Math.min(Math.max(guest.accuracyM ?? 0, 0), 150);
  return distanceMeters(gig.lat, gig.lng, guest.lat, guest.lng) <= gig.radiusM + slack;
}

export const RADIUS_OPTIONS = [
  { meters: 150, label: "500 ft" },
  { meters: 300, label: "1,000 ft" },
  { meters: 800, label: "0.5 mi" },
] as const;
