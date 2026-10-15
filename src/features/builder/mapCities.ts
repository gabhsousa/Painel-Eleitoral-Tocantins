export type MapCity = { code: string; name: string };
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
export function searchMapCities(cities: MapCity[], query: string) {
  const needle = normalize(query);
  return needle
    ? cities.filter((city) => normalize(`${city.name} ${city.code}`).includes(needle))
    : cities;
}
