/**
 * Scientific-name suggestions from iNaturalist.
 *
 * Public API, no key, no account. It is strong on wild species and weak on
 * cultivars, which is why the curated list in names.js runs first.
 *
 * Failures are silent by design: no network, a blocked request, or a slow
 * response just means no extra suggestions, never an error in your way.
 */
const ENDPOINT = "https://api.inaturalist.org/v1/taxa/autocomplete";

export async function lookupRemote(common, signal) {
  const q = common.trim();
  if (q.length < 3) return [];

  const url = `${ENDPOINT}?q=${encodeURIComponent(q)}&rank=species,genus,hybrid&per_page=8&locale=en`;
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
  const data = await res.json();

  return (data.results || [])
    // plants only — otherwise "spider plant" turns up actual spiders
    .filter((t) => t.iconic_taxon_name === "Plantae")
    .map((t) => ({
      scientific: t.name,
      common: t.preferred_common_name || "",
      rank: t.rank || "",
      source: "inat",
    }));
}
