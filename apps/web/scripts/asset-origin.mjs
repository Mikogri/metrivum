export function assetOrigin(value = process.env.PAGES_ASSET_ORIGIN) {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new Error('PAGES_ASSET_ORIGIN must be an HTTPS origin without credentials or path.');
  return url.origin;
}
