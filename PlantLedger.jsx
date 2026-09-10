import React, { useState, useEffect, useMemo, useRef } from "react";
import { getJson, setJson, delKey, requestPersistence } from "./storage.js";
import { buildSnapshot, publish, unpublish } from "./publish.js";
import { findOrphanedPhotos, migratePhotos } from "./migrate.js";
import { lookupLocal, splitName } from "./names.js";
import { lookupRemote } from "./taxa.js";

/* ------------------------------------------------------------------ */
/*  palette + type                                                     */
/* ------------------------------------------------------------------ */
const C = {
  paper: "#EFF1EA",
  sheet: "#F8F9F4",
  ink: "#17251C",
  moss: "#3F5B41",
  sage: "#8B9C84",
  rule: "#CFD5C6",
  label: "#34556E",
  warn: "#8A4B3A",
};

const serif = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";
const sans = "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif";

const INDEX_KEY = "plantdex:index:v1";
const WISH_KEY = "plantdex:wishlist:v1";
const photoKey = (id) => `plantdex:photos:${id}`;
const wishPhotoKey = (id) => `plantdex:wishphotos:${id}`;
const SOFT_LIMIT = 400 * 1024 * 1024; // a courtesy warning, not a hard ceiling

const PRIORITIES = ["Next purchase", "Watching", "Someday"];

const STATUS_TAGS = ["Thriving", "New growth", "Repotted", "Fertilized", "Pests", "Struggling", "Dormant"];

/* ------------------------------------------------------------------ */
/*  helpers                                                            */
/* ------------------------------------------------------------------ */
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const today = () => new Date().toISOString().slice(0, 10);

function fmtDate(d) {
  if (!d) return "—";
  const p = String(d).split("-");
  if (p.length !== 3) return d;
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][parseInt(p[1], 10) - 1];
  return `${m || p[1]} ${parseInt(p[2], 10)}, ${p[0]}`;
}

function latestNote(p) {
  if (!p.notes || p.notes.length === 0) return null;
  return p.notes.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
}

/**
 * Watering gets typed constantly, so it accepts "9/7", "09/07" or "9-7" and
 * works the year out: a date that would land in the future belongs to last
 * year. Stored as a full ISO date so sorting stays correct across a new year.
 */
function parseMMDD(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const m = raw.match(/^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})(?:\s*[\/\-.]\s*(\d{2,4}))?$/);
  if (!m) return null; // not a shape we understand

  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const now = new Date();
  let year = now.getFullYear();
  if (m[3]) {
    year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
  } else {
    const candidate = new Date(year, month - 1, day);
    if (candidate > now) year -= 1;
  }

  const d = new Date(year, month - 1, day);
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null; // e.g. 2/30
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function fmtMMDD(iso) {
  if (!iso) return "";
  const p = String(iso).split("-");
  if (p.length !== 3) return String(iso);
  return `${parseInt(p[1], 10)}/${parseInt(p[2], 10)}`;
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function shrink(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file isn't a readable image."));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function thumbFrom(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve("");
    img.onload = () => {
      const scale = Math.min(1, 640 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    img.src = dataUrl;
  });
}

/* ------------------------------------------------------------------ */
/*  UI atoms                                                           */
/* ------------------------------------------------------------------ */
function Btn({ children, onClick, tone = "quiet", disabled, title }) {
  const tones = {
    quiet: { background: "transparent", borderColor: C.rule, color: C.ink },
    solid: { background: C.moss, borderColor: C.moss, color: C.sheet },
    link: { background: "transparent", borderColor: "transparent", color: C.label, padding: "4px 2px" },
    danger: { background: "transparent", borderColor: "transparent", color: C.warn, padding: "4px 2px" },
  };
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        fontFamily: sans,
        fontSize: 13,
        padding: "7px 13px",
        borderRadius: 3,
        border: "1px solid",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.45 : 1,
        ...tones[tone],
      }}
    >
      {children}
    </button>
  );
}

const inputStyle = {
  width: "100%",
  fontFamily: sans,
  fontSize: 14,
  color: C.ink,
  background: C.sheet,
  border: `1px solid ${C.rule}`,
  borderRadius: 3,
  padding: "8px 10px",
  outline: "none",
};

function Field({ label, children, hint }) {
  return (
    <label className="block mb-4">
      <span style={{ fontFamily: sans, fontSize: 12, color: C.moss }}>{label}</span>
      {hint && <span style={{ fontFamily: sans, fontSize: 11, color: C.sage, marginLeft: 6 }}>{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

/**
 * Botanical convention: the binomial is italic, the cultivar epithet upright
 * inside single quotes. Older entries that hold both in one string are split
 * on the fly so they render correctly too.
 */
function SciName({ scientific, cultivar, size = 14, color = C.moss, showCultivar = true }) {
  const parsed = cultivar ? { scientific, cultivar } : splitName(scientific);
  if (!parsed.scientific && !parsed.cultivar) return <>—</>;
  return (
    <span style={{ fontSize: size, color }}>
      <span style={{ fontFamily: serif, fontStyle: "italic" }}>{parsed.scientific}</span>
      {showCultivar && parsed.cultivar && (
        <span style={{ fontFamily: serif, fontStyle: "normal" }}> &lsquo;{parsed.cultivar}&rsquo;</span>
      )}
    </span>
  );
}

function Tag({ children }) {
  if (!children) return null;
  return (
    <span
      style={{
        fontFamily: sans,
        fontSize: 11,
        color: C.moss,
        border: `1px solid ${C.rule}`,
        borderRadius: 2,
        padding: "1px 6px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Modal({ children, onClose, wide }) {
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto"
      style={{ background: "rgba(23,37,28,0.45)", padding: "20px 10px" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full"
        style={{
          maxWidth: wide ? 860 : 560,
          background: C.sheet,
          border: `1px solid ${C.rule}`,
          borderRadius: 4,
          boxShadow: "0 18px 50px rgba(23,37,28,0.28)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  app                                                                */
/* ------------------------------------------------------------------ */
export default function PlantLedger({ account, onSignOut }) {
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [view, setView] = useState("ledger");
  const [byRoom, setByRoom] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "common", dir: 1 });
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [wishlist, setWishlist] = useState([]);
  const [section, setSection] = useState("collection");
  const [editingWish, setEditingWish] = useState(null);
  const [settings, setSettings] = useState(false);
  const [copyText, setCopyText] = useState(null);

  const shared = false;

  useEffect(() => {
    (async () => {
      requestPersistence();
      const list = await getJson(INDEX_KEY, false, []);
      setPlants(Array.isArray(list) ? list : []);
      const wl = await getJson(WISH_KEY, false, []);
      setWishlist(Array.isArray(wl) ? wl : []);
      setLoading(false);

      // Watering used to live in the journal. Lift the newest such entry into
      // the new field so nothing is lost — the journal entries stay put.
      if (Array.isArray(list) && list.length) {
        let changed = false;
        const lifted = list.map((p) => {
          if (p.watered || !Array.isArray(p.notes)) return p;
          const waterings = p.notes
            .filter((n) => (n.tag || "").toLowerCase() === "watered")
            .sort((a, b) => (a.date < b.date ? 1 : -1));
          if (!waterings.length) return p;
          changed = true;
          return { ...p, watered: waterings[0].date };
        });
        if (changed) {
          setPlants(lifted);
          setJson(INDEX_KEY, lifted, false).catch(() => {});
        }
      }
    })();
  }, []);

  const flash = (msg) => {
    setStatus(msg);
    window.setTimeout(() => setStatus(""), 3200);
  };

  const persist = async (next) => {
    setPlants(next);
    try {
      await setJson(INDEX_KEY, next, shared);
    } catch (e) {
      flash("Changes didn't save. Your device may be low on storage.");
    }
  };

  const persistWish = async (next) => {
    setWishlist(next);
    try {
      await setJson(WISH_KEY, next, shared);
    } catch (e) {
      flash("Changes didn't save. Your device may be low on storage.");
    }
  };

  const upsertWish = async (item) => {
    const exists = wishlist.some((w) => w.id === item.id);
    await persistWish(exists ? wishlist.map((w) => (w.id === item.id ? item : w)) : [...wishlist, item]);
    flash(exists ? "Updated." : "Added to the wishlist.");
  };

  const acquireWish = async (item) => {
    const plant = {
      id: uid(),
      common: item.common,
      scientific: item.scientific,
      cultivar: item.cultivar || "",
      acquired: today(),
      location: item.room || "",
      notes: item.notes ? [{ id: uid(), date: today(), tag: "", text: item.notes }] : [],
      props: [],
      photoCount: item.photoCount || 0,
      cover: item.cover || "",
      bytes: item.bytes || 0,
      publicOn: false,
    };
    // Photos taken while it was on the wishlist come with it.
    if (item.photoCount) {
      const shots = await getJson(wishPhotoKey(item.id), false, []);
      if (shots.length) await setJson(photoKey(plant.id), shots, false).catch(() => {});
      await delKey(wishPhotoKey(item.id)).catch(() => {});
    }
    await persist([...plants, plant]);
    await persistWish(wishlist.filter((w) => w.id !== item.id));
    setEditingWish(null);
    setSection("collection");
    setOpenId(plant.id);
    flash("Moved into the collection.");
  };

  // Covers are only made when photos change, so older entries keep whatever
  // size was current when they were added. This re-cuts them all at once.
  const rebuildThumbnails = async () => {
    const nextPlants = [];
    for (const p of plants) {
      if (!p.photoCount) {
        nextPlants.push(p);
        continue;
      }
      const shots = await getJson(photoKey(p.id), false, []);
      nextPlants.push(shots.length ? { ...p, cover: await thumbFrom(shots[0]) } : p);
    }
    await persist(nextPlants);

    const nextWish = [];
    for (const w of wishlist) {
      if (!w.photoCount) {
        nextWish.push(w);
        continue;
      }
      const shots = await getJson(wishPhotoKey(w.id), false, []);
      nextWish.push(shots.length ? { ...w, cover: await thumbFrom(shots[0]) } : w);
    }
    await persistWish(nextWish);
    flash("Thumbnails rebuilt.");
  };

  // Pulls photos left in this device's local storage by the pre-Supabase build
  // up into the shared collection, then re-cuts covers from them.
  const importLocalPhotos = async (onProgress) => {
    const result = await migratePhotos(onProgress);
    if (result.moved > 0) await rebuildThumbnails();
    return result;
  };

  const upsertPlant = async (plant) => {
    const exists = plants.some((p) => p.id === plant.id);
    await persist(exists ? plants.map((p) => (p.id === plant.id ? plant : p)) : [...plants, plant]);
    flash(exists ? "Updated." : "Added.");
  };

  const patchPlant = async (id, patch) =>
    persist(plants.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const removePlant = async (id) => {
    await persist(plants.filter((p) => p.id !== id));
    try {
      await delKey(photoKey(id));
    } catch (e) {
      /* no photo key */
    }
    setOpenId(null);
    flash("Removed.");
  };

  /* ---------- derived ---------- */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? plants.filter((p) => [p.common, p.scientific, p.cultivar, p.location].join(" ").toLowerCase().includes(q))
      : plants.slice();
    const val = (p) => {
      if (sort.key === "lastNote") return latestNote(p) ? latestNote(p).date : "";
      if (sort.key === "props") return String((p.props || []).length).padStart(4, "0");
      if (sort.key === "cultivar") return (p.cultivar || splitName(p.scientific).cultivar || "").toLowerCase();
      if (sort.key === "watered") return p.watered || "";
      if (sort.key === "scientific") return splitName(p.scientific).scientific.toLowerCase();
      return (p[sort.key] || "").toString().toLowerCase();
    };
    return list.sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (av === bv) return (a.common || "").localeCompare(b.common || "");
      if (av === "") return 1;
      if (bv === "") return -1;
      return av < bv ? -sort.dir : sort.dir;
    });
  }, [plants, query, sort]);

  const groups = useMemo(() => {
    if (!byRoom) return [{ name: null, rows: filtered }];
    const map = new Map();
    filtered.forEach((p) => {
      const room = (p.location || "").trim() || "No location set";
      if (!map.has(room)) map.set(room, []);
      map.get(room).push(p);
    });
    return Array.from(map.entries())
      .sort((a, b) => {
        if (a[0] === "No location set") return 1;
        if (b[0] === "No location set") return -1;
        return a[0].localeCompare(b[0]);
      })
      .map(([name, rows]) => ({ name, rows }));
  }, [filtered, byRoom]);

  const usedBytes = useMemo(() => {
    const idx = JSON.stringify(plants).length;
    const photos = plants.reduce((sum, p) => sum + (p.bytes || 0), 0);
    return idx + photos;
  }, [plants]);

  const openPlant = plants.find((p) => p.id === openId) || null;

  /* ---------- export ---------- */
  const wishRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? wishlist.filter((w) => [w.common, w.scientific, w.cultivar, w.room, w.source].join(" ").toLowerCase().includes(q))
      : wishlist.slice();
    return list.sort((a, b) => {
      const ra = PRIORITIES.indexOf(a.priority || "Someday");
      const rb = PRIORITIES.indexOf(b.priority || "Someday");
      if (ra !== rb) return ra - rb;
      return (a.common || "").localeCompare(b.common || "");
    });
  }, [wishlist, query]);

  const buildTable = (sep) => {
    const esc = (v) => (sep === "," && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    let head;
    let body;
    if (section === "wishlist") {
      head = ["Common name", "Scientific name", "Cultivar", "First seen", "Where it would go", "Source or seller", "Priority", "Notes"];
      body = wishRows.map((w) => [w.common || "", splitName(w.scientific).scientific || "", w.cultivar || splitName(w.scientific).cultivar || "", w.seen || "", w.room || "", w.source || "", w.priority || "", w.notes || ""]);
    } else {
      head = ["Common name", "Scientific name", "Cultivar", "Last watered", "Date added", "Room", "Last care note", "Latest status", "Propagations", "Photos"];
      body = filtered.map((p) => {
        const n = latestNote(p);
        return [
          p.common || "",
          splitName(p.scientific).scientific || "",
          p.cultivar || splitName(p.scientific).cultivar || "",
          p.watered || "",
          p.acquired || "",
          p.location || "",
          n ? n.date : "",
          n && n.tag ? n.tag : "",
          String((p.props || []).length),
          String(p.photoCount || 0),
        ];
      });
    }
    return [head, ...body].map((r) => r.map(esc).join(sep)).join("\n");
  };

  const download = (text, name, type) => {
    try {
      const url = URL.createObjectURL(new Blob([text], { type }));
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      flash("Downloaded.");
    } catch (e) {
      setCopyText(text);
    }
  };

  const copyForSheet = async () => {
    try {
      await navigator.clipboard.writeText(buildTable("\t"));
      flash("Copied. Paste into Excel.");
    } catch (e) {
      setCopyText(buildTable("\t"));
    }
  };

  if (loading) {
    return (
      <div style={{ background: C.paper, minHeight: 400, padding: 40, fontFamily: sans, color: C.moss }}>
        Opening your collection…
      </div>
    );
  }

  return (
    <div style={{ background: C.paper, minHeight: "100vh", color: C.ink }}>
      <div className="mx-auto" style={{ maxWidth: 1080, padding: "26px 16px 80px" }}>
        <header style={{ borderBottom: `2px solid ${C.ink}`, paddingBottom: 14, marginBottom: 16 }}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 style={{ fontFamily: serif, fontSize: 29, lineHeight: 1.05, margin: 0 }}>
                The Living Collection
              </h1>
              <p style={{ fontFamily: sans, fontSize: 13, color: C.moss, margin: "6px 0 0" }}>
                {plants.length} {plants.length === 1 ? "plant" : "plants"}
                {" · "}
                {new Set(plants.map((p) => (p.location || "").trim()).filter(Boolean)).size} rooms
                {" · "}
                {plants.reduce((s, p) => s + (p.props || []).length, 0)} propagations
                {" · "}
                {wishlist.length} wanted
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {section === "wishlist" ? (
                <Btn tone="solid" onClick={() => setEditingWish("new")}>Add to wishlist</Btn>
              ) : (
                <Btn tone="solid" onClick={() => setEditing("new")}>Add a plant</Btn>
              )}
              <Btn onClick={() => setSettings(true)}>Settings</Btn>
            </div>
          </div>
        </header>

        <div className="flex gap-5 mb-4" style={{ borderBottom: `1px solid ${C.rule}` }}>
          {[["collection", "Collection"], ["wishlist", "Wishlist"]].map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSection(k)}
              style={{
                fontFamily: serif,
                fontSize: 17,
                padding: "0 0 8px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: section === k ? C.ink : C.sage,
                borderBottom: section === k ? `2px solid ${C.ink}` : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {lbl}
              {k === "wishlist" && wishlist.length > 0 && (
                <span style={{ fontFamily: sans, fontSize: 12, color: C.sage, marginLeft: 6 }}>{wishlist.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex" style={{ border: `1px solid ${C.rule}`, borderRadius: 3, overflow: "hidden", display: section === "wishlist" ? "none" : "flex" }}>
            {[["ledger", "Ledger"], ["sheets", "Sheets"]].map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setView(k)}
                style={{
                  fontFamily: sans,
                  fontSize: 13,
                  padding: "7px 16px",
                  border: "none",
                  cursor: "pointer",
                  background: view === k ? C.ink : "transparent",
                  color: view === k ? C.sheet : C.ink,
                }}
              >
                {lbl}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2" style={{ fontFamily: sans, fontSize: 13, cursor: "pointer", display: section === "wishlist" ? "none" : "flex" }}>
            <input type="checkbox" checked={byRoom} onChange={(e) => setByRoom(e.target.checked)} />
            Group by room
          </label>

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={section === "wishlist" ? "Search the wishlist" : "Search names or rooms"}
            style={{ ...inputStyle, width: 210 }}
          />

        </div>

        {status && (
          <div
            style={{
              fontFamily: sans,
              fontSize: 13,
              color: C.moss,
              background: C.sheet,
              border: `1px solid ${C.rule}`,
              borderRadius: 3,
              padding: "8px 12px",
              marginBottom: 14,
            }}
          >
            {status}
          </div>
        )}

        {section === "wishlist" ? (
          wishlist.length === 0 ? (
            <EmptyWish onAdd={() => setEditingWish("new")} />
          ) : (
            <Wishlist rows={wishRows} onEdit={setEditingWish} onAcquire={acquireWish} />
          )
        ) : plants.length === 0 ? (
          <Empty onAdd={() => setEditing("new")} shared={shared} />
        ) : (
          groups.map((g) => (
            <section key={g.name || "all"} style={{ marginBottom: g.name ? 26 : 0 }}>
              {g.name && (
                <div
                  className="flex items-baseline gap-3"
                  style={{ marginBottom: 8, borderBottom: `1px solid ${C.ink}`, paddingBottom: 5 }}
                >
                  <h2 style={{ fontFamily: serif, fontSize: 19, margin: 0 }}>{g.name}</h2>
                  <span style={{ fontFamily: sans, fontSize: 12, color: C.moss }}>
                    {g.rows.length} {g.rows.length === 1 ? "plant" : "plants"}
                  </span>
                </div>
              )}
              {view === "ledger" ? (
                <Ledger rows={g.rows} sort={sort} setSort={setSort} onOpen={setOpenId} />
              ) : (
                <Sheets rows={g.rows} onOpen={setOpenId} />
              )}
            </section>
          ))
        )}
      </div>

      {openPlant && (
        <PlantSheet
          plant={openPlant}
          shared={shared}
          usedBytes={usedBytes}
          onClose={() => setOpenId(null)}
          onEdit={() => setEditing(openPlant)}
          onDelete={() => removePlant(openPlant.id)}
          onPatch={(patch) => patchPlant(openPlant.id, patch)}
          onSpinOff={async (plant) => {
            await upsertPlant(plant);
            setOpenId(plant.id);
          }}
          flash={flash}
        />
      )}

      {editing && (
        <PlantForm
          initial={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={async (p) => {
            await upsertPlant(p);
            setEditing(null);
          }}
        />
      )}

      {editingWish && (
        <WishForm
          initial={editingWish === "new" ? null : editingWish}
          onCancel={() => setEditingWish(null)}
          onSave={async (item) => {
            await upsertWish(item);
            setEditingWish(null);
          }}
          flash={flash}
          onDelete={async (id) => {
            await persistWish(wishlist.filter((w) => w.id !== id));
            await delKey(wishPhotoKey(id)).catch(() => {});
            setEditingWish(null);
            flash("Removed from the wishlist.");
          }}
          onAcquire={acquireWish}
        />
      )}

      {settings && (
        <Settings
          plants={plants}
          usedBytes={usedBytes}
          account={account}
          onSignOut={onSignOut}
          publicCount={plants.filter((p) => p.publicOn).length}
          onRebuildThumbnails={rebuildThumbnails}
          onImportLocalPhotos={importLocalPhotos}
          exportLabel={section === "wishlist" ? "wishlist" : "collection"}
          exportEmpty={section === "wishlist" ? !wishlist.length : !plants.length}
          onCopyForSheet={copyForSheet}
          onDownloadCsv={() =>
            download(buildTable(","), section === "wishlist" ? "plant-wishlist.csv" : "plant-collection.csv", "text/csv")
          }
          onPublish={async (opts) => {
            const snap = await buildSnapshot(plants, opts);
            await publish(snap);
            flash(`Published ${snap.count} ${snap.count === 1 ? "plant" : "plants"}.`);
          }}
          onUnpublish={async () => {
            await unpublish();
            flash("Public view emptied.");
          }}
          onClose={() => setSettings(false)}
          onBackup={() => download(JSON.stringify({ version: 2, exported: today(), plants, wishlist }, null, 2), "plant-collection-backup.json", "application/json")}
          onRestore={async (list, wl) => {
            await persist(list);
            if (wl) await persistWish(wl);
            setSettings(false);
            flash(`Restored ${list.length} plants. Photos aren't included in backups.`);
          }}
        />
      )}

      {copyText && (
        <Modal onClose={() => setCopyText(null)} wide>
          <div style={{ padding: 22 }}>
            <h2 style={{ fontFamily: serif, fontSize: 20, margin: "0 0 6px" }}>Select all and copy</h2>
            <p style={{ fontFamily: sans, fontSize: 13, color: C.moss, margin: "0 0 12px" }}>
              Downloads are blocked here. Copy this block instead.
            </p>
            <textarea
              readOnly
              value={copyText}
              onFocus={(e) => e.target.select()}
              style={{ ...inputStyle, height: 260, fontFamily: "monospace", fontSize: 12 }}
            />
            <div className="flex justify-end mt-3">
              <Btn onClick={() => setCopyText(null)}>Done</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
function Empty({ onAdd, shared }) {
  return (
    <div style={{ border: `1px dashed ${C.rule}`, borderRadius: 4, padding: "52px 22px", textAlign: "center", background: C.sheet }}>
      <p style={{ fontFamily: serif, fontSize: 22, margin: "0 0 8px" }}>
        Nothing on file yet
      </p>
      <p style={{ fontFamily: sans, fontSize: 14, color: C.moss, margin: "0 0 20px" }}>
        Add your first plant and the ledger builds itself from there.
      </p>
      <Btn tone="solid" onClick={onAdd}>Add a plant</Btn>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function Ledger({ rows, sort, setSort, onOpen }) {
  // A blank column helps nobody, so it only appears if something in view has one.
  const anyCultivar = rows.some((p) => (p.cultivar || splitName(p.scientific).cultivar));
  const cols = [
    { key: "common", label: "Common name" },
    { key: "scientific", label: "Scientific name" },
    ...(anyCultivar ? [{ key: "cultivar", label: "Cultivar" }] : []),
    { key: "watered", label: "Watered" },
    { key: "acquired", label: "Added" },
    { key: "lastNote", label: "Last note" },
  ];
  const toggle = (k, sortable) =>
    sortable === false ? null : setSort((s) => (s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: 1 }));

  return (
    <div style={{ overflowX: "auto", background: C.sheet, border: `1px solid ${C.rule}`, borderRadius: 4 }}>
      <table style={{ width: "100%", minWidth: anyCultivar ? 720 : 600, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c.key}
                onClick={() => toggle(c.key, c.sortable)}
                style={{
                  textAlign: "left",
                  fontFamily: sans,
                  fontSize: 12,
                  fontWeight: 500,
                  color: sort.key === c.key ? C.ink : C.moss,
                  padding: "10px 13px",
                  borderBottom: `1px solid ${C.ink}`,
                  cursor: c.sortable === false ? "default" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {c.label}
                <span style={{ opacity: sort.key === c.key ? 1 : 0, marginLeft: 5 }}>{sort.dir === 1 ? "↑" : "↓"}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const n = latestNote(p);
            return (
              <tr key={p.id} onClick={() => onOpen(p.id)} style={{ cursor: "pointer", borderBottom: `1px solid ${C.rule}` }}>
                <td style={{ padding: "9px 13px", fontFamily: sans, fontSize: 14 }}>
                  <span className="flex items-center gap-2">
                    {p.cover ? (
                      <img src={p.cover} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 2, flexShrink: 0 }} />
                    ) : (
                      <span style={{ width: 44, height: 44, borderRadius: 2, border: `1px solid ${C.rule}`, flexShrink: 0 }} />
                    )}
                    {p.common || "Unnamed"}
                  </span>
                </td>
                <td style={{ padding: "9px 13px" }}>
                  <SciName scientific={p.scientific} cultivar={p.cultivar} showCultivar={false} />
                </td>
                {anyCultivar && (
                  <td style={{ padding: "9px 13px", fontFamily: sans, fontSize: 13, color: C.moss }}>
                    {p.cultivar || splitName(p.scientific).cultivar || ""}
                  </td>
                )}
                <td style={{ padding: "9px 13px", fontFamily: sans, fontSize: 13, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {fmtMMDD(p.watered) || "—"}
                </td>
                <td style={{ padding: "9px 13px", fontFamily: sans, fontSize: 13, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {fmtDate(p.acquired)}
                </td>
                <td style={{ padding: "9px 13px", fontFamily: sans, fontSize: 13, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {fmtDate(n ? n.date : "")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function Sheets({ rows, onOpen }) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(205px, 1fr))" }}>
      {rows.map((p) => {
        const n = latestNote(p);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p.id)}
            style={{ textAlign: "left", background: C.sheet, border: `1px solid ${C.rule}`, borderRadius: 3, padding: 10, cursor: "pointer" }}
          >
            <div
              style={{
                aspectRatio: "4 / 5",
                background: p.cover ? `#e6e9df url(${p.cover}) center/cover` : "#e6e9df",
                borderRadius: 2,
                marginBottom: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {!p.cover && <span style={{ fontFamily: sans, fontSize: 12, color: C.sage }}>No photo yet</span>}
            </div>
            <div style={{ fontFamily: sans, fontSize: 16, lineHeight: 1.25, color: C.ink }}>
              {p.common || "Unnamed"}
            </div>
            <div style={{ marginTop: 3 }}>
              {p.scientific ? (
                <SciName scientific={p.scientific} cultivar={p.cultivar} showCultivar={false} />
              ) : (
                <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 14, color: C.moss }}>Species unrecorded</span>
              )}
            </div>
            {(p.cultivar || splitName(p.scientific).cultivar) && (
              <div style={{ fontFamily: sans, fontSize: 12.5, color: C.moss, marginTop: 2 }}>
                &lsquo;{p.cultivar || splitName(p.scientific).cultivar}&rsquo;
              </div>
            )}
            <div
              className="flex items-center justify-between gap-2"
              style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.rule}`, fontFamily: sans, fontSize: 12, color: C.moss }}
            >
              <span>{p.location || "No room set"}</span>
              {n && n.tag ? <Tag>{n.tag}</Tag> : (p.props || []).length ? <span>{(p.props || []).length} props</span> : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  detail sheet — a summary first, editing behind buttons             */
/* ------------------------------------------------------------------ */
function PlantSheet({ plant, shared, usedBytes, onClose, onEdit, onDelete, onPatch, onSpinOff, flash }) {
  const [photos, setPhotos] = useState(null);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(null);
  const [panel, setPanel] = useState(null); // "care" | "prop"
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    let alive = true;
    getJson(photoKey(plant.id), shared, []).then((ps) => alive && setPhotos(Array.isArray(ps) ? ps : []));
    return () => {
      alive = false;
    };
  }, [plant.id, shared]);

  const syncPhotos = async (next) => {
    const prev = photos;
    setPhotos(next);
    try {
      await setJson(photoKey(plant.id), next, shared);
      const cover = next.length ? await thumbFrom(next[0]) : "";
      await onPatch({ photoCount: next.length, cover, bytes: JSON.stringify(next).length });
    } catch (e) {
      setPhotos(prev);
      flash("Photos didn't save. Check your connection.");
    }
  };

  const addPhotos = async (files) => {
    if (usedBytes > SOFT_LIMIT) flash("This collection is getting large. Consider trimming older photos.");
    setBusy(true);
    try {
      const added = [];
      for (const f of Array.from(files)) added.push(await shrink(f, 1600, 0.82));
      await syncPhotos([...(photos || []), ...added]);
    } catch (e) {
      flash(e.message || "Those images didn't load.");
    }
    setBusy(false);
  };

  const notes = (plant.notes || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const props = (plant.props || []).slice().sort((a, b) => (a.started < b.started ? 1 : -1));
  const newest = latestNote(plant);

  const spinOff = (pr) => {
    onSpinOff({
      id: uid(),
      common: plant.common ? `${plant.common} (prop)` : "Propagation",
      scientific: plant.scientific || "",
      cultivar: plant.cultivar || "",
      acquired: pr.started,
      location: plant.location || "",
      notes: [{ id: uid(), date: today(), tag: "New growth", text: `Potted up from ${pr.method} started ${fmtDate(pr.started)} off the parent plant.` }],
      props: [],
      photoCount: 0,
      cover: "",
      bytes: 0,
      parent: plant.common || plant.scientific || "",
      publicOn: false,
    });
  };

  return (
    <Modal onClose={onClose} wide>
      <div style={{ padding: "20px 22px 24px" }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 style={{ margin: 0, lineHeight: 1.15 }}>
              {plant.scientific ? (
                <SciName scientific={plant.scientific} cultivar={plant.cultivar} size={25} color={C.ink} />
              ) : (
                <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 25 }}>Species unrecorded</span>
              )}
            </h2>
            <p style={{ fontFamily: sans, fontSize: 15, margin: "4px 0 0" }}>
              {plant.common || "Unnamed"}
              {plant.parent && <span style={{ color: C.moss, fontSize: 13 }}> · from {plant.parent}</span>}
            </p>
          </div>
          <Btn onClick={onClose}>Close</Btn>
        </div>

        {/* the three actions, right under the name */}
        <div className="flex flex-wrap gap-2" style={{ margin: "16px 0 4px" }}>
          <Btn
            tone="solid"
            onClick={() => onPatch({ watered: today() })}
            title="Sets today's date on the watering field"
          >
            {plant.watered === today() ? "Watered today ✓" : "Watered today"}
          </Btn>
          <Btn onClick={onEdit}>Edit details</Btn>
          <Btn onClick={() => setPanel("care")}>Care entry</Btn>
          <Btn onClick={() => setPanel("prop")}>New prop</Btn>
        </div>

        <dl
          className="grid gap-x-6 gap-y-2 my-5"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            borderTop: `1px solid ${C.rule}`,
            borderBottom: `1px solid ${C.rule}`,
            padding: "13px 0",
            fontFamily: sans,
            fontSize: 14,
          }}
        >
          <div>
            <dt style={{ fontSize: 12, color: C.moss }}>Date added</dt>
            <dd style={{ margin: 0 }}>{fmtDate(plant.acquired)}</dd>
          </div>
          <div>
            <dt style={{ fontSize: 12, color: C.moss }}>Last watered</dt>
            <dd style={{ margin: 0 }}>{plant.watered ? fmtDate(plant.watered) : "—"}</dd>
          </div>
          <div>
            <dt style={{ fontSize: 12, color: C.moss }}>Room</dt>
            <dd style={{ margin: 0 }}>{plant.location || "—"}</dd>
          </div>
          <div>
            <dt style={{ fontSize: 12, color: C.moss }}>Last care note</dt>
            <dd style={{ margin: 0 }}>{fmtDate(newest ? newest.date : "")}</dd>
          </div>
          <div>
            <dt style={{ fontSize: 12, color: C.moss }}>Latest status</dt>
            <dd style={{ margin: 0 }}>{newest && newest.tag ? newest.tag : "—"}</dd>
          </div>
        </dl>

        {/* photos */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span style={{ fontFamily: sans, fontSize: 12, color: C.moss }}>
              Photos {photos ? `(${photos.length})` : ""}
            </span>
            <Btn tone="link" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}>
              {busy ? "Processing…" : "Add photos"}
            </Btn>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length) addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          {photos === null ? (
            <p style={{ fontFamily: sans, fontSize: 13, color: C.sage }}>Loading photos…</p>
          ) : photos.length === 0 ? (
            <p style={{ fontFamily: sans, fontSize: 13, color: C.sage }}>No photos yet. The first one becomes the cover.</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {photos.map((src, i) => (
                <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                  <img
                    src={src}
                    alt=""
                    onClick={() => setZoom(src)}
                    style={{
                      width: 118,
                      height: 148,
                      objectFit: "cover",
                      borderRadius: 2,
                      cursor: "zoom-in",
                      border: i === 0 ? `2px solid ${C.moss}` : `1px solid ${C.rule}`,
                    }}
                  />
                  <div className="flex justify-between" style={{ marginTop: 2 }}>
                    {i !== 0 ? (
                      <Btn tone="link" onClick={() => syncPhotos([src, ...photos.filter((_, j) => j !== i)])}>Cover</Btn>
                    ) : (
                      <span style={{ fontFamily: sans, fontSize: 11, color: C.moss, padding: "4px 2px" }}>Cover</span>
                    )}
                    <Btn tone="danger" onClick={() => syncPhotos(photos.filter((_, j) => j !== i))}>Remove</Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* care journal — read only here */}
        <div className="mb-7">
          <div className="flex items-baseline justify-between mb-2">
            <h3 style={{ fontFamily: serif, fontSize: 18, margin: 0 }}>Care journal</h3>
            <Btn tone="link" onClick={() => setPanel("care")}>Add entry</Btn>
          </div>
          {notes.length === 0 ? (
            <p style={{ fontFamily: sans, fontSize: 13, color: C.sage }}>No entries yet.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {notes.map((n) => (
                <li key={n.id} style={{ display: "flex", gap: 12, padding: "9px 0", borderTop: `1px solid ${C.rule}`, alignItems: "flex-start" }}>
                  <span style={{ fontFamily: sans, fontSize: 12, color: C.moss, minWidth: 88, fontVariantNumeric: "tabular-nums" }}>
                    {fmtDate(n.date)}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    {n.tag && <span style={{ marginRight: 7 }}><Tag>{n.tag}</Tag></span>}
                    <span style={{ fontFamily: sans, fontSize: 14, lineHeight: 1.5 }}>{n.text}</span>
                  </span>
                  <Btn tone="danger" onClick={() => onPatch({ notes: plant.notes.filter((x) => x.id !== n.id) })}>Delete</Btn>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* propagations — read only here */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <h3 style={{ fontFamily: serif, fontSize: 18, margin: 0 }}>Propagations</h3>
            <Btn tone="link" onClick={() => setPanel("prop")}>Log a cutting</Btn>
          </div>
          {props.length === 0 ? (
            <p style={{ fontFamily: sans, fontSize: 13, color: C.sage }}>Nothing propagating right now.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {props.map((pr) => (
                <li key={pr.id} style={{ padding: "10px 0", borderTop: `1px solid ${C.rule}` }}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span style={{ fontFamily: sans, fontSize: 12, color: C.moss, minWidth: 88, fontVariantNumeric: "tabular-nums" }}>
                      {fmtDate(pr.started)}
                    </span>
                    <span style={{ fontFamily: sans, fontSize: 14 }}>
                      {pr.count && `${pr.count} × `}{pr.method}
                    </span>
                    {pr.potted && <Tag>Potted {fmtDate(pr.potted)}</Tag>}
                    <span className="ml-auto flex gap-2">
                      {!pr.potted && (
                        <Btn tone="link" onClick={() => onPatch({ props: plant.props.map((x) => (x.id === pr.id ? { ...x, potted: today() } : x)) })}>
                          Mark potted
                        </Btn>
                      )}
                      <Btn tone="link" onClick={() => spinOff(pr)}>Make its own card</Btn>
                      <Btn tone="danger" onClick={() => onPatch({ props: plant.props.filter((x) => x.id !== pr.id) })}>Delete</Btn>
                    </span>
                  </div>
                  {pr.notes && <p style={{ fontFamily: sans, fontSize: 13, color: C.moss, margin: "4px 0 0 100px" }}>{pr.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between mt-7 pt-4" style={{ borderTop: `1px solid ${C.rule}` }}>
          <label className="flex items-center gap-2" style={{ fontFamily: sans, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={!!plant.publicOn} onChange={(e) => onPatch({ publicOn: e.target.checked })} />
            Show in the public view
          </label>
          {confirmDelete ? (
            <span className="flex items-center gap-2" style={{ fontFamily: sans, fontSize: 13 }}>
              Remove this plant and its photos?
              <Btn tone="danger" onClick={onDelete}>Yes, remove</Btn>
              <Btn tone="link" onClick={() => setConfirmDelete(false)}>Keep</Btn>
            </span>
          ) : (
            <Btn tone="danger" onClick={() => setConfirmDelete(true)}>Remove plant</Btn>
          )}
        </div>
      </div>

      {panel === "care" && (
        <CareEntryForm
          onCancel={() => setPanel(null)}
          onSave={async (entry) => {
            await onPatch({ notes: [...(plant.notes || []), entry] });
            setPanel(null);
          }}
        />
      )}

      {panel === "prop" && (
        <PropForm
          onCancel={() => setPanel(null)}
          onSave={async (entry) => {
            await onPatch({ props: [...(plant.props || []), entry] });
            setPanel(null);
          }}
        />
      )}

      {zoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(23,37,28,0.85)", cursor: "zoom-out" }}
          onClick={() => setZoom(null)}
        >
          <img src={zoom} alt="" style={{ maxWidth: "92%", maxHeight: "92%", borderRadius: 3 }} />
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
function CareEntryForm({ onCancel, onSave }) {
  const [date, setDate] = useState(today());
  const [tag, setTag] = useState("");
  const [text, setText] = useState("");

  return (
    <Modal onClose={onCancel}>
      <div style={{ padding: 22 }}>
        <h2 style={{ fontFamily: serif, fontSize: 22, margin: "0 0 4px" }}>Care entry</h2>
        <p style={{ fontFamily: sans, fontSize: 12, color: C.sage, margin: "0 0 18px" }}>
          Health and status live here — the newest tag shows in the ledger.
        </p>

        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Status" hint="optional">
            <input list="status-tags" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Thriving" style={inputStyle} />
            <datalist id="status-tags">
              {STATUS_TAGS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
        </div>

        <Field label="What you did or noticed">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Two new roots on the wet stick. Moved further from the radiator."
            style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
          />
        </Field>

        <div className="flex justify-end gap-2 mt-2">
          <Btn onClick={onCancel}>Cancel</Btn>
          <Btn
            tone="solid"
            disabled={!text.trim() && !tag.trim()}
            onClick={() => onSave({ id: uid(), date, tag: tag.trim(), text: text.trim() })}
          >
            Save entry
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
function PropForm({ onCancel, onSave }) {
  const [started, setStarted] = useState(today());
  const [method, setMethod] = useState("");
  const [count, setCount] = useState("1");
  const [notes, setNotes] = useState("");

  return (
    <Modal onClose={onCancel}>
      <div style={{ padding: 22 }}>
        <h2 style={{ fontFamily: serif, fontSize: 22, margin: "0 0 4px" }}>New propagation</h2>
        <p style={{ fontFamily: sans, fontSize: 12, color: C.sage, margin: "0 0 18px" }}>
          A cutting taken off this plant. Mark it potted later, or give it its own card.
        </p>

        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
          <Field label="Started">
            <input type="date" value={started} onChange={(e) => setStarted(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="How many">
            <input value={count} onChange={(e) => setCount(e.target.value)} placeholder="2" style={inputStyle} />
          </Field>
        </div>

        <Field label="Method">
          <input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Node cuttings in water" style={inputStyle} />
        </Field>

        <Field label="Notes" hint="optional">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Both have a visible root nub. Keeping them on the warm shelf."
            style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
          />
        </Field>

        <div className="flex justify-end gap-2 mt-2">
          <Btn onClick={onCancel}>Cancel</Btn>
          <Btn
            tone="solid"
            disabled={!method.trim()}
            onClick={() => onSave({ id: uid(), started, method: method.trim(), count: count || "1", notes: notes.trim(), potted: "" })}
          >
            Log cutting
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  scientific name suggestions from a common name                     */
/* ------------------------------------------------------------------ */
function NameSuggestions({ common, onPick }) {
  const [local, setLocal] = useState([]);
  const [remote, setRemote] = useState([]);
  const [state, setState] = useState("idle"); // idle | looking | done | failed

  useEffect(() => {
    const q = (common || "").trim();
    setLocal(lookupLocal(q));

    if (q.length < 3) {
      setRemote([]);
      setState("idle");
      return;
    }

    // Wait for a pause in typing before troubling the network.
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState("looking");
      try {
        setRemote(await lookupRemote(q, controller.signal));
        setState("done");
      } catch (e) {
        if (e.name !== "AbortError") {
          setRemote([]);
          setState("failed");
        }
      }
    }, 600);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [common]);

  // The curated list wins on ties — it knows the trade names.
  const known = new Set(local.map((l) => l.scientific.toLowerCase()));
  const merged = [...local, ...remote.filter((r) => !known.has(r.scientific.toLowerCase()))].slice(0, 8);

  if (merged.length === 0) {
    if (state === "looking") {
      return <p style={{ fontFamily: sans, fontSize: 12, color: C.sage, margin: "-10px 0 14px" }}>Looking…</p>;
    }
    return null;
  }

  return (
    <div style={{ margin: "-10px 0 16px" }}>
      <p style={{ fontFamily: sans, fontSize: 12, color: C.moss, margin: "0 0 6px" }}>
        Suggestions — tap one to use it, or type your own:
      </p>
      <div className="flex flex-wrap gap-2">
        {merged.map((m) => (
          <button
            key={m.scientific}
            type="button"
            onClick={() => onPick(splitName(m.scientific))}
            style={{
              fontFamily: serif,
              fontStyle: "italic",
              fontSize: 14,
              color: C.ink,
              background: C.sheet,
              border: `1px solid ${m.source === "list" ? C.moss : C.rule}`,
              borderRadius: 3,
              padding: "5px 10px",
              cursor: "pointer",
            }}
            title={m.source === "list" ? "From the houseplant list" : `From iNaturalist${m.common ? ` — ${m.common}` : ""}`}
          >
            <SciName scientific={m.scientific} size={14} color={C.ink} />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function PlantForm({ initial, onCancel, onSave }) {
  const [wateredText, setWateredText] = useState(initial ? fmtMMDD(initial.watered) : "");
  const [wateredBad, setWateredBad] = useState(false);
  const [f, setF] = useState(
    initial || {
      id: uid(),
      common: "",
      scientific: "",
      cultivar: "",
      watered: "",
      acquired: today(),
      location: "",
      notes: [],
      props: [],
      photoCount: 0,
      cover: "",
      bytes: 0,
    }
  );
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <Modal onClose={onCancel}>
      <div style={{ padding: 22 }}>
        <h2 style={{ fontFamily: serif, fontSize: 22, margin: "0 0 18px" }}>{initial ? "Edit details" : "Add a plant"}</h2>
        <Field label="Common name">
          <input value={f.common} onChange={set("common")} placeholder="Pink Princess Philodendron" style={inputStyle} />
        </Field>
        <Field label="Scientific name">
          <input
            value={f.scientific}
            onChange={set("scientific")}
            placeholder="Philodendron erubescens"
            style={{ ...inputStyle, fontFamily: serif, fontStyle: "italic", fontSize: 15 }}
          />
        </Field>
        <NameSuggestions common={f.common} onPick={(n) => setF({ ...f, scientific: n.scientific, cultivar: n.cultivar || f.cultivar })} />
        <Field label="Cultivar or variety" hint="optional">
          <input
            value={f.cultivar || ""}
            onChange={set("cultivar")}
            placeholder="Thai Constellation"
            style={inputStyle}
          />
        </Field>
        <Field label="Last watered" hint="MM/DD">
          <div className="flex gap-2 items-center">
            <input
              value={wateredText}
              onChange={(e) => {
                const text = e.target.value;
                setWateredText(text);
                const iso = parseMMDD(text);
                if (iso === null) {
                  setWateredBad(true);
                } else {
                  setWateredBad(false);
                  setF((cur) => ({ ...cur, watered: iso }));
                }
              }}
              placeholder="9/7"
              inputMode="numeric"
              style={{ ...inputStyle, width: 110, fontVariantNumeric: "tabular-nums" }}
            />
            <Btn
              onClick={() => {
                setF((cur) => ({ ...cur, watered: today() }));
                setWateredText(fmtMMDD(today()));
                setWateredBad(false);
              }}
            >
              Today
            </Btn>
            {wateredBad && (
              <span style={{ fontFamily: sans, fontSize: 12, color: C.warn }}>Use MM/DD</span>
            )}
          </div>
        </Field>

        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))" }}>
          <Field label="Date added" hint="when it joined the collection">
            <input type="date" value={f.acquired} onChange={set("acquired")} style={inputStyle} />
          </Field>
          <Field label="Room" hint="used for grouping">
            <input value={f.location} onChange={set("location")} placeholder="Office, east window" style={inputStyle} />
          </Field>
        </div>
        <p style={{ fontFamily: sans, fontSize: 12, color: C.sage, margin: "2px 0 18px" }}>
          Photos, care entries, and propagations are added on the plant's sheet after you save.
        </p>
        <div className="flex justify-end gap-2">
          <Btn onClick={onCancel}>Cancel</Btn>
          <Btn tone="solid" onClick={() => onSave(f)} disabled={!f.common.trim() && !f.scientific.trim()}>
            {initial ? "Save changes" : "Add plant"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
function Settings({ plants, usedBytes, account, onSignOut, publicCount, onPublish, onUnpublish, onRebuildThumbnails, onImportLocalPhotos, exportLabel, exportEmpty, onCopyForSheet, onDownloadCsv, onClose, onBackup, onRestore }) {
  const [restoreText, setRestoreText] = useState("");
  const [title, setTitle] = useState("The Living Collection");
  const [blurb, setBlurb] = useState("");
  const [showRooms, setShowRooms] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [orphans, setOrphans] = useState(null);
  const [importing, setImporting] = useState("");

  useEffect(() => {
    findOrphanedPhotos()
      .then((found) => setOrphans(found.length))
      .catch(() => setOrphans(0));
  }, []);
  const gardenUrl = `${window.location.origin}${window.location.pathname}#/garden`;
  const pct = Math.min(100, Math.round((usedBytes / SOFT_LIMIT) * 100));

  const doRestore = () => {
    try {
      const data = JSON.parse(restoreText);
      const list = Array.isArray(data) ? data : data.plants;
      if (!Array.isArray(list)) throw new Error();
      const wl = Array.isArray(data.wishlist) ? data.wishlist.map((w) => ({ ...w, id: w.id || uid() })) : null;
      onRestore(list.map((p) => ({ ...p, id: p.id || uid() })), wl);
    } catch (e) {
      alert("That isn't a backup file this app can read. Paste the full contents of a backup JSON.");
    }
  };

  return (
    <Modal onClose={onClose} wide>
      <div style={{ padding: 22 }}>
        <h2 style={{ fontFamily: serif, fontSize: 22, margin: "0 0 18px" }}>Settings</h2>

        <h3 style={{ fontFamily: sans, fontSize: 13, color: C.moss, margin: "0 0 6px" }}>Storage used</h3>
        <div style={{ height: 8, background: "#e2e6da", borderRadius: 2, overflow: "hidden", marginBottom: 5 }}>
          <div style={{ width: `${pct}%`, height: "100%", background: pct > 85 ? C.warn : C.moss }} />
        </div>
        <p style={{ fontFamily: sans, fontSize: 12, color: C.moss, margin: "0 0 22px" }}>
          {fmtBytes(usedBytes)} in the shared collection, almost all of it photos. The free Supabase tier holds 500 MB,
          which is well over a thousand pictures.
        </p>

        {orphans > 0 && (
          <div
            className="mb-6"
            style={{ border: `1px solid ${C.rule}`, borderRadius: 3, padding: "14px 16px", background: "#F3F1E4" }}
          >
            <p style={{ fontFamily: sans, fontSize: 13, color: C.ink, margin: "0 0 8px", lineHeight: 1.5 }}>
              This device still holds {orphans} {orphans === 1 ? "set" : "sets"} of photos from before the collection
              moved online. Backups don't include photos, so they were left behind here.
            </p>
            <Btn
              tone="solid"
              disabled={!!importing}
              onClick={async () => {
                setImporting("Starting…");
                try {
                  const result = await onImportLocalPhotos((done, total) => setImporting(`Uploading ${done} of ${total}…`));
                  setImporting("");
                  setOrphans(0);
                  alert(
                    result.moved > 0
                      ? `Uploaded ${result.moved} ${result.moved === 1 ? "set" : "sets"} of photos to the shared collection.`
                      : "Nothing needed uploading — those plants already have photos online."
                  );
                } catch (e) {
                  setImporting("");
                  alert("Upload failed partway. Check your connection and run it again — it picks up where it left off.");
                }
              }}
            >
              {importing || "Upload them to the shared collection"}
            </Btn>
            <p style={{ fontFamily: sans, fontSize: 12, color: C.moss, margin: "8px 0 0" }}>
              Run this on whichever phone had the photos. It never overwrites pictures already stored online.
            </p>
          </div>
        )}

        <div className="mb-6">
          <Btn
            disabled={rebuilding}
            onClick={async () => {
              setRebuilding(true);
              await onRebuildThumbnails();
              setRebuilding(false);
            }}
          >
            {rebuilding ? "Rebuilding…" : "Rebuild thumbnails"}
          </Btn>
          <p style={{ fontFamily: sans, fontSize: 12, color: C.sage, margin: "6px 0 0" }}>
            Re-cuts every cover image at full quality. Worth running once after an update that changes thumbnail size.
          </p>
        </div>

        <h3 style={{ fontFamily: sans, fontSize: 13, color: C.moss, margin: "0 0 6px" }}>Export</h3>
        <p style={{ fontFamily: sans, fontSize: 12, color: C.moss, margin: "0 0 10px" }}>
          Takes whatever the {exportLabel} tab is currently showing, including any search or sort you've applied.
        </p>
        <div className="flex flex-wrap gap-2 items-center mb-6">
          <Btn onClick={onCopyForSheet} disabled={exportEmpty}>Copy for Excel</Btn>
          <Btn onClick={onDownloadCsv} disabled={exportEmpty}>Download CSV</Btn>
        </div>

        <h3 style={{ fontFamily: sans, fontSize: 13, color: C.moss, margin: "0 0 6px" }}>Public view</h3>
        <p style={{ fontFamily: sans, fontSize: 12, color: C.moss, margin: "0 0 10px" }}>
          Publishing writes a separate, read-only copy of the {publicCount} {publicCount === 1 ? "plant" : "plants"} you've
          ticked on their sheets. Names, dates, and up to three photos each — never rooms unless you allow it, and never
          your wishlist, sources, or propagation notes. Nothing changes out there until you press Publish.
        </p>

        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Short introduction" hint="optional">
          <textarea
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
            placeholder="A few of the plants we keep, and when they arrived."
            style={{ ...inputStyle, minHeight: 56, resize: "vertical" }}
          />
        </Field>
        <label className="flex items-center gap-2 mb-3" style={{ fontFamily: sans, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={showRooms} onChange={(e) => setShowRooms(e.target.checked)} />
          Include which room each plant lives in
        </label>

        <div className="flex flex-wrap gap-2 items-center mb-2">
          <Btn
            tone="solid"
            disabled={publishing || publicCount === 0}
            onClick={async () => {
              setPublishing(true);
              try {
                await onPublish({ title, blurb, showRooms });
              } catch (e) {
                alert("Publishing failed. Check your connection and try again.");
              }
              setPublishing(false);
            }}
          >
            {publishing ? "Publishing…" : `Publish ${publicCount || ""}`}
          </Btn>
          <Btn onClick={() => onUnpublish().catch(() => alert("Couldn't empty the public view."))}>Take it down</Btn>
        </div>
        <p style={{ fontFamily: sans, fontSize: 12, color: C.sage, margin: "0 0 6px", wordBreak: "break-all" }}>
          {gardenUrl}
        </p>
        <p style={{ fontFamily: sans, fontSize: 12, color: C.moss, margin: "0 0 22px" }}>
          Anyone with that link can view it — there's no half-public. Tick plants on their individual sheets, then
          publish again to update.
        </p>

        {account && (
          <>
            <h3 style={{ fontFamily: sans, fontSize: 13, color: C.moss, margin: "0 0 6px" }}>Account</h3>
            <p style={{ fontFamily: sans, fontSize: 12, color: C.moss, margin: "0 0 10px" }}>
              Signed in as {account}. This collection is shared — whoever saves last wins, so avoid editing the same
              plant at the same moment.
            </p>
            <div className="mb-6">
              <Btn onClick={onSignOut}>Sign out</Btn>
            </div>
          </>
        )}

        <h3 style={{ fontFamily: sans, fontSize: 13, color: C.moss, margin: "0 0 6px" }}>Backup</h3>
        <p style={{ fontFamily: sans, fontSize: 12, color: C.moss, margin: "0 0 10px" }}>
          The free Supabase tier keeps no backups of its own, so export occasionally. The file holds every plant, note,
          propagation, and wishlist entry; photos aren't included.
        </p>
        <div className="flex flex-wrap gap-2 items-center mb-3">
          <Btn onClick={onBackup} disabled={!plants.length}>Download backup</Btn>
        </div>
        <textarea
          value={restoreText}
          onChange={(e) => setRestoreText(e.target.value)}
          placeholder="Paste a backup file here to restore it (this replaces the current collection)"
          style={{ ...inputStyle, minHeight: 90, fontFamily: "monospace", fontSize: 12 }}
        />
        <div className="flex justify-between mt-3">
          <Btn tone="danger" onClick={doRestore} disabled={!restoreText.trim()}>Replace collection with this backup</Btn>
          <Btn onClick={onClose}>Done</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
function EmptyWish({ onAdd }) {
  return (
    <div style={{ border: `1px dashed ${C.rule}`, borderRadius: 4, padding: "52px 22px", textAlign: "center", background: C.sheet }}>
      <p style={{ fontFamily: serif, fontSize: 22, margin: "0 0 8px" }}>Nothing on the list yet</p>
      <p style={{ fontFamily: sans, fontSize: 14, color: C.moss, margin: "0 0 20px" }}>
        Keep track of the plants you're hunting for. When one finally comes home, move it straight into the collection.
      </p>
      <Btn tone="solid" onClick={onAdd}>Add to wishlist</Btn>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function Wishlist({ rows, onEdit, onAcquire }) {
  const cols = ["", "Common name", "Scientific name", "First seen", "Where it would go", "Source or seller", "Priority", ""];
  return (
    <div style={{ overflowX: "auto", background: C.sheet, border: `1px solid ${C.rule}`, borderRadius: 4 }}>
      <table style={{ width: "100%", minWidth: 800, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th
                key={i}
                style={{
                  textAlign: "left",
                  fontFamily: sans,
                  fontSize: 12,
                  fontWeight: 500,
                  color: C.moss,
                  padding: "10px 13px",
                  borderBottom: `1px solid ${C.ink}`,
                  whiteSpace: "nowrap",
                }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => (
            <tr key={w.id} style={{ borderBottom: `1px solid ${C.rule}` }}>
              <td onClick={() => onEdit(w)} style={{ padding: "9px 13px", cursor: "pointer", width: 60 }}>
                {w.cover ? (
                  <img src={w.cover} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 2 }} />
                ) : (
                  <span style={{ display: "block", width: 44, height: 44, borderRadius: 2, border: `1px solid ${C.rule}` }} />
                )}
              </td>
              <td onClick={() => onEdit(w)} style={{ padding: "9px 13px", fontFamily: sans, fontSize: 14, cursor: "pointer" }}>
                {w.common || "Unnamed"}
              </td>
              <td onClick={() => onEdit(w)} style={{ padding: "9px 13px", cursor: "pointer" }}>
                <SciName scientific={w.scientific} cultivar={w.cultivar} size={15} />
              </td>
              <td style={{ padding: "9px 13px", fontFamily: sans, fontSize: 13, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {fmtDate(w.seen)}
              </td>
              <td style={{ padding: "9px 13px", fontFamily: sans, fontSize: 13 }}>{w.room || "—"}</td>
              <td style={{ padding: "9px 13px", fontFamily: sans, fontSize: 13 }}>{w.source || "—"}</td>
              <td style={{ padding: "9px 13px" }}>
                <Tag>{w.priority || "Someday"}</Tag>
              </td>
              <td style={{ padding: "9px 13px", whiteSpace: "nowrap" }}>
                <span className="flex gap-2 justify-end">
                  <Btn tone="link" onClick={() => onEdit(w)}>Edit</Btn>
                  <Btn tone="link" onClick={() => onAcquire(w)}>Got it</Btn>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function WishForm({ initial, onCancel, onSave, onDelete, onAcquire, flash }) {
  const [f, setF] = useState(
    initial || { id: uid(), common: "", scientific: "", cultivar: "", seen: today(), room: "", source: "", priority: "Someday", notes: "", photoCount: 0, cover: "", bytes: 0 }
  );
  const [photos, setPhotos] = useState(initial ? null : []);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    if (!initial) return;
    let alive = true;
    getJson(wishPhotoKey(initial.id), false, []).then((ps) => alive && setPhotos(Array.isArray(ps) ? ps : []));
    return () => {
      alive = false;
    };
  }, [initial]);

  // Photos are saved against the entry straight away, so they survive Cancel
  // the same way they do on a plant sheet.
  const syncPhotos = async (next) => {
    const prev = photos;
    setPhotos(next);
    try {
      await setJson(wishPhotoKey(f.id), next, false);
      const cover = next.length ? await thumbFrom(next[0]) : "";
      setF((cur) => ({ ...cur, photoCount: next.length, cover, bytes: JSON.stringify(next).length }));
    } catch (e) {
      setPhotos(prev);
      if (flash) flash("Photos didn't save. Check your connection.");
    }
  };

  const addPhotos = async (files) => {
    setBusy(true);
    try {
      const added = [];
      for (const file of Array.from(files)) added.push(await shrink(file, 1600, 0.82));
      await syncPhotos([...(photos || []), ...added]);
    } catch (e) {
      if (flash) flash("Those images didn't load.");
    }
    setBusy(false);
  };

  return (
    <Modal onClose={onCancel}>
      <div style={{ padding: 22 }}>
        <h2 style={{ fontFamily: serif, fontSize: 22, margin: "0 0 18px" }}>
          {initial ? "Edit wishlist entry" : "Add to wishlist"}
        </h2>

        <Field label="Common name">
          <input value={f.common} onChange={set("common")} placeholder="Silver Cloud Philodendron" style={inputStyle} />
        </Field>
        <Field label="Scientific name">
          <input
            value={f.scientific}
            onChange={set("scientific")}
            placeholder="Philodendron mamei"
            style={{ ...inputStyle, fontFamily: serif, fontStyle: "italic", fontSize: 15 }}
          />
        </Field>
        <NameSuggestions common={f.common} onPick={(n) => setF({ ...f, scientific: n.scientific, cultivar: n.cultivar || f.cultivar })} />
        <Field label="Cultivar or variety" hint="optional">
          <input value={f.cultivar || ""} onChange={set("cultivar")} placeholder="Albo Variegata" style={inputStyle} />
        </Field>

        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <Field label="First seen">
            <input type="date" value={f.seen} onChange={set("seen")} style={inputStyle} />
          </Field>
          <Field label="Where it would go">
            <input value={f.room} onChange={set("room")} placeholder="Dining room" style={inputStyle} />
          </Field>
          <Field label="Priority">
            <select value={f.priority} onChange={set("priority")} style={inputStyle}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Source or seller">
          <input value={f.source} onChange={set("source")} placeholder="Nursery, seller, or where you spotted it" style={inputStyle} />
        </Field>
        <Field label="Notes">
          <textarea
            value={f.notes}
            onChange={set("notes")}
            placeholder="What drew you to it, what a fair price looks like, who has one in stock."
            style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
          />
        </Field>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span style={{ fontFamily: sans, fontSize: 12, color: C.moss }}>
              Photos {photos ? `(${photos.length})` : ""}
            </span>
            <Btn tone="link" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}>
              {busy ? "Processing…" : "Add photos"}
            </Btn>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length) addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          {photos === null ? (
            <p style={{ fontFamily: sans, fontSize: 13, color: C.sage }}>Loading photos…</p>
          ) : photos.length === 0 ? (
            <p style={{ fontFamily: sans, fontSize: 13, color: C.sage }}>
              Reference shots — the listing photo, or one you took in a shop. They come with it if you buy it.
            </p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {photos.map((src, i) => (
                <div key={i} style={{ flexShrink: 0 }}>
                  <img
                    src={src}
                    alt=""
                    style={{
                      width: 96,
                      height: 120,
                      objectFit: "cover",
                      borderRadius: 2,
                      border: i === 0 ? `2px solid ${C.moss}` : `1px solid ${C.rule}`,
                    }}
                  />
                  <div className="flex justify-between" style={{ marginTop: 2 }}>
                    {i !== 0 ? (
                      <Btn tone="link" onClick={() => syncPhotos([src, ...photos.filter((_, j) => j !== i)])}>Cover</Btn>
                    ) : (
                      <span style={{ fontFamily: sans, fontSize: 11, color: C.moss, padding: "4px 2px" }}>Cover</span>
                    )}
                    <Btn tone="danger" onClick={() => syncPhotos(photos.filter((_, j) => j !== i))}>Remove</Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
          <span className="flex gap-2">
            {initial && <Btn tone="danger" onClick={() => onDelete(f.id)}>Remove</Btn>}
            {initial && (
              <Btn onClick={() => onAcquire(f)} title="Move this into the collection">
                Got it — add to collection
              </Btn>
            )}
          </span>
          <span className="flex gap-2">
            <Btn onClick={onCancel}>Cancel</Btn>
            <Btn tone="solid" onClick={() => onSave(f)} disabled={!f.common.trim() && !f.scientific.trim()}>
              {initial ? "Save changes" : "Add to wishlist"}
            </Btn>
          </span>
        </div>
      </div>
    </Modal>
  );
}
