/**
 * One-time rescue for photos left behind by the local-only version.
 *
 * Before the app moved to Supabase it kept photos in IndexedDB under plain
 * keys — `plantdex:photos:<plantId>`. Restoring from a JSON backup brought the
 * plants across but not those photos, because backups deliberately exclude
 * them. The originals are still sitting in the browser's storage on whichever
 * device you used back then, and plant IDs didn't change, so they can be
 * matched up and pushed to the shared collection.
 *
 * Safe to run more than once: it skips any plant that already has photos
 * stored server-side, so it can never overwrite newer pictures with older ones.
 */
import { keys as idbKeys, get as idbGet } from "idb-keyval";
import { getJson, setJson } from "./storage.js";

const PLANT_PREFIX = "plantdex:photos:";
const WISH_PREFIX = "plantdex:wishphotos:";

export async function findOrphanedPhotos() {
  const all = await idbKeys();
  return all
    .map(String)
    // `cache:` entries are the new local mirror of Supabase — not what we want.
    .filter((k) => !k.startsWith("cache:"))
    .filter((k) => k.startsWith(PLANT_PREFIX) || k.startsWith(WISH_PREFIX));
}

export async function migratePhotos(onProgress) {
  const found = await findOrphanedPhotos();
  let moved = 0;
  let skipped = 0;

  for (let i = 0; i < found.length; i++) {
    const key = found[i];
    if (onProgress) onProgress(i + 1, found.length);

    const local = await idbGet(key).catch(() => null);
    const shots = Array.isArray(local) ? local : null;
    if (!shots || shots.length === 0) {
      skipped++;
      continue;
    }

    const existing = await getJson(key, false, []);
    if (Array.isArray(existing) && existing.length > 0) {
      skipped++; // already has photos in the shared collection — leave it alone
      continue;
    }

    await setJson(key, shots, false);
    moved++;
  }

  return { moved, skipped, total: found.length };
}
