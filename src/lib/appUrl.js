// An address inside this site: appUrl('login') -> '/login'.
// The live site is at the top of its domain; the test copy (docs/STAGING.md)
// is in a folder (/inventory-system/), and every address needs it first.
export function appUrl(path = '') {
  return import.meta.env.BASE_URL + String(path).replace(/^\/+/, '')
}
