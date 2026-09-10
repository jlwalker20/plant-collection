/**
 * Publishing the public view.
 *
 * The public snapshot is a separate, deliberately smaller thing: only the plants
 * you ticked, only the fields worth showing a stranger, and photos re-encoded
 * smaller so a link that circulates doesn't burn through the free egress
 * allowance. Rooms, sources, wishlist, and propagation notes never go in.
 */
import { supabase, isConfigured } from "./supabaseClient.js";
import { getJson } from "./storage.js";

const MAX_PHOTOS_PER_PLANT = 3;

function downscale(dataUrl, maxDim, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(null);
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = dataUrl;
  });
}

export async function buildSnapshot(plants, options) {
  const { title, blurb, showRooms } = options;
  const chosen = plants.filter((p) => p.publicOn);
  const out = [];

  for (const p of chosen) {
    const stored = await getJson(`plantdex:photos:${p.id}`, false, []);
    const photos = [];
    for (const src of stored.slice(0, MAX_PHOTOS_PER_PLANT)) {
      const smaller = await downscale(src, 900, 0.72);
      if (smaller) photos.push(smaller);
    }
    out.push({
      id: p.id,
      common: p.common || "",
      scientific: p.scientific || "",
      cultivar: p.cultivar || "",
      added: p.acquired || "",
      room: showRooms ? p.location || "" : "",
      photos,
    });
  }

  return {
    title: title || "The Living Collection",
    blurb: blurb || "",
    showRooms: !!showRooms,
    count: out.length,
    plants: out,
  };
}

export async function publish(snapshot) {
  if (!isConfigured) throw new Error("Supabase isn't configured.");
  const { error } = await supabase
    .from("public_garden")
    .upsert({ id: 1, payload: snapshot, published_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw error;
}

export async function unpublish() {
  if (!isConfigured) throw new Error("Supabase isn't configured.");
  const { error } = await supabase.from("public_garden").delete().eq("id", 1);
  if (error) throw error;
}

export async function fetchPublished() {
  if (!isConfigured) return null;
  const { data, error } = await supabase
    .from("public_garden")
    .select("payload, published_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
