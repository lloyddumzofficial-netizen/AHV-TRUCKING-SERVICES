export function calculateDistanceKm(start, end) {
  if (!start || !end) {
    return null;
  }

  const earthRadiusKm = 6371;
  const latDelta = ((end.lat - start.lat) * Math.PI) / 180;
  const lngDelta = ((end.lng - start.lng) * Math.PI) / 180;
  const startLat = (start.lat * Math.PI) / 180;
  const endLat = (end.lat * Math.PI) / 180;
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(lngDelta / 2) ** 2;

  return Math.round(earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
