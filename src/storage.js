/**
 * Local storage layer, backed by IndexedDB.
 *
 * Everything lives on this device. There is no server and no account, so
 * nothing leaves the phone unless you export a backup yourself.
 *
 * IndexedDB has no small fixed cap the way the artifact version did — browsers
 * grant a share of free disk, typically hundreds of megabytes or more. Android
 * may evict data for a site you never open; installing to the home screen makes
 * the storage persistent, and the code below asks for that explicitly.
 */
import { get, set, del } from "idb-keyval";

export async function getJson(key, _shared, fallback) {
  try {
    const value = await get(key);
    if (value === undefined || value === null) return fallback;
    return value;
  } catch (e) {
    return fallback;
  }
}

export async function setJson(key, value, _shared) {
  await set(key, value);
  return true;
}

export async function delKey(key) {
  await del(key);
}

/** Ask Android not to evict this app's data under storage pressure. */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = await navigator.storage.persisted();
      if (!already) await navigator.storage.persist();
    }
  } catch (e) {
    /* not supported — carry on */
  }
}

/** Rough bytes used, straight from the browser's own estimate. */
export async function storageEstimate() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      return { usage: usage || 0, quota: quota || 0 };
    }
  } catch (e) {
    /* fall through */
  }
  return { usage: 0, quota: 0 };
}
