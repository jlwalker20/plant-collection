/**
 * Storage layer — shared collection, cached locally.
 *
 * Reads: ask Supabase whether its copy is newer than the cached one, and only
 * download the payload if it is. That keeps photo traffic off the free tier's
 * 5 GB monthly egress and makes repeat opens instant.
 *
 * Writes: go to Supabase, then to the local cache. Last write wins, so if you
 * and your partner edit the same plant in the same minute, one of you overwrites
 * the other. In practice that almost never comes up with two people.
 *
 * Offline: reads fall back to the cache, so the collection stays browsable on a
 * plane or in a basement. Writes need a connection and will report a failure.
 */
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import { supabase, isConfigured } from "./supabaseClient.js";

const TABLE = "collection_kv";
const cacheKey = (key) => `cache:${key}`;

export async function getJson(key, _shared, fallback) {
  const cached = await idbGet(cacheKey(key)).catch(() => null);

  if (!isConfigured) return cached ? cached.value : fallback;

  try {
    const { data: head, error: headError } = await supabase
      .from(TABLE)
      .select("updated_at")
      .eq("key", key)
      .maybeSingle();
    if (headError) throw headError;

    if (!head) return fallback; // nothing stored yet
    if (cached && cached.updated_at === head.updated_at) return cached.value;

    const { data, error } = await supabase
      .from(TABLE)
      .select("value, updated_at")
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    if (!data) return fallback;

    await idbSet(cacheKey(key), { value: data.value, updated_at: data.updated_at }).catch(() => {});
    return data.value;
  } catch (e) {
    // Offline, or the project is paused — fall back to whatever we have.
    return cached ? cached.value : fallback;
  }
}

export async function setJson(key, value, _shared) {
  if (!isConfigured) throw new Error("Supabase isn't configured.");

  const { data, error } = await supabase
    .from(TABLE)
    .upsert({ key, value }, { onConflict: "key" })
    .select("updated_at")
    .single();
  if (error) throw error;

  await idbSet(cacheKey(key), { value, updated_at: data.updated_at }).catch(() => {});
  return true;
}

export async function delKey(key) {
  await idbDel(cacheKey(key)).catch(() => {});
  if (!isConfigured) return;
  const { error } = await supabase.from(TABLE).delete().eq("key", key);
  if (error) throw error;
}

/** Nothing to persist locally any more — the cache is disposable. */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = await navigator.storage.persisted();
      if (!already) await navigator.storage.persist();
    }
  } catch (e) {
    /* not supported */
  }
}
