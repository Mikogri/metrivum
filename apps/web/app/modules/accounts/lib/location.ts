/** Regions Intl knows that are not countries (EU, UN, pseudo-locales, unknown). */
const NOT_COUNTRIES = new Set(["EU", "EZ", "UN", "ZZ", "QO", "XA", "XB", "AA", "QM", "QN", "QP", "QQ", "QR", "QS", "QT", "QU", "QV", "QW", "QX", "QY", "QZ", "XC", "XD", "XE", "XF", "XG", "XH", "XI", "XJ", "XL", "XM", "XN", "XO", "XP", "XQ", "XR", "XS", "XT", "XU", "XV", "XW", "XX", "XY", "XZ"]);

/** ISO 3166-1 alpha-2 codes with names in the given language, sorted by name. */
export function countryNames(locale: string): { id: string; name: string }[] {
  const names = new Intl.DisplayNames([locale], { type: "region", fallback: "none" });
  const list: { id: string; name: string }[] = [];
  for (let a = 65; a <= 90; a++)
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      if (NOT_COUNTRIES.has(code)) continue;
      let name: string | undefined;
      try {
        name = names.of(code);
      } catch {
        name = undefined;
      }
      if (name && name !== code) list.push({ id: code, name });
    }
  return list.sort((x, y) => x.name.localeCompare(y.name, locale));
}

export type FoundLocation = { country: string; region: string; city: string; postalCode: string };

/** The browser's position (asks for permission). Rejects with the GeolocationPositionError on refusal. */
function position(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("Geolocation is not available."));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 15_000, maximumAge: 600_000 });
  });
}

/**
 * Where the person is: the browser position, turned into country, region, city and postal code by BigDataCloud's
 * free client-side reverse geocoding (no key; the host's CSP must allow its origin in connect-src).
 */
export async function locateMe(locale: string): Promise<FoundLocation> {
  const { coords } = await position();
  const url = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
  url.searchParams.set("latitude", coords.latitude.toFixed(4));
  url.searchParams.set("longitude", coords.longitude.toFixed(4));
  url.searchParams.set("localityLanguage", locale);
  const response = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer" });
  if (!response.ok) throw new Error(`Reverse geocoding failed (${response.status}).`);
  const data = (await response.json()) as { countryCode?: string; principalSubdivision?: string; city?: string; locality?: string; postcode?: string };
  const text = (value: string | undefined, max: number) => (value ?? "").trim().slice(0, max);
  return {
    country: /^[A-Z]{2}$/.test(data.countryCode ?? "") ? data.countryCode! : "",
    region: text(data.principalSubdivision, 100),
    city: text(data.city || data.locality, 100),
    postalCode: text(data.postcode, 16),
  };
}
