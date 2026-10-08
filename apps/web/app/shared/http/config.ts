/** Base URL of the ASP.NET API. Business data never comes from Supabase directly. */
export function apiBaseUrl(): string {
  const value = import.meta.env.VITE_API_URL;
  if (!value) throw new Error("VITE_API_URL is not configured. Copy apps/web/.env.example to apps/web/.env.local.");
  return value.replace(/\/+$/, "");
}
