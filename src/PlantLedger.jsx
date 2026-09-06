import React, { useState, useEffect, useMemo, useRef } from "react";
import { getJson, setJson, delKey, requestPersistence } from "./storage.js";

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
const SOFT_LIMIT = 400 * 1024 * 1024; // a courtesy warning, not a hard ceiling

const PRIORITIES = ["Next purchase", "Watching", "Someday"];

const STATUS_TAGS = ["Thriving", "New growth", "Watered", "Repotted", "Fertilized", "Pests", "Struggling", "Dormant"];

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
      const scale = Math.min(1, 150 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.65));
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
export default function PlantLedger() {
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  // Cards suit a phone; the ledger grid suits a wider screen.
  const [view, setView] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 640 ? "sheets" : "ledger"
  );
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
      acquired: today(),
      location: item.room || "",
      notes: item.notes ? [{ id: uid(), date: today(), tag: "", text: item.notes }] : [],
      props: [],
      photoCount: 0,
      cover: "",
      bytes: 0,
      added: today(),
    };
    await persist([...plants, plant]);
    await persistWish(wishlist.filter((w) => w.id !== item.id));
    setEditingWish(null);
    setSection("collection");
    setOpenId(plant.id);
    flash("Moved into the collection.");
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
      ? plants.filter((p) => [p.common, p.scientific, p.location].join(" ").toLowerCase().includes(q))
      : plants.slice();
    const val = (p) => {
      if (sort.key === "lastNote") return latestNote(p) ? latestNote(p).date : "";
      if (sort.key === "props") return String((p.props || []).length).padStart(4, "0");
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
      ? wishlist.filter((w) => [w.common, w.scientific, w.room, w.source].join(" ").toLowerCase().includes(q))
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
      head = ["Common name", "Scientific name", "First seen", "Where it would go", "Source or seller", "Priority", "Notes"];
      body = wishRows.map((w) => [w.common || "", w.scientific || "", w.seen || "", w.room || "", w.source || "", w.priority || "", w.notes || ""]);
    } else {
      head = ["Common name", "Scientific name", "Acquired", "Room", "Last care note", "Latest status", "Propagations", "Photos"];
      body = filtered.map((p) => {
        const n = latestNote(p);
        return [
          p.common || "",
          p.scientific || "",
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

          <div className="flex items-center gap-1 ml-auto">
            <Btn tone="link" onClick={copyForSheet} disabled={section === "wishlist" ? !wishlist.length : !plants.length}>
              Copy for Excel
            </Btn>
            <span style={{ color: C.rule }}>|</span>
            <Btn
              tone="link"
              onClick={() => download(buildTable(","), section === "wishlist" ? "plant-wishlist.csv" : "plant-collection.csv", "text/csv")}
              disabled={section === "wishlist" ? !wishlist.length : !plants.length}
            >
              Download CSV
            </Btn>
          </div>
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
          onDelete={async (id) => {
            await persistWish(wishlist.filter((w) => w.id !== id));
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
  const cols = [
    { key: "common", label: "Common name" },
    { key: "scientific", label: "Scientific name" },
    { key: "acquired", label: "Acquired" },
    { key: "location", label: "Room" },
    { key: "lastNote", label: "Last note" },
    { key: "statusTag", label: "Latest status", sortable: false },
    { key: "props", label: "Props" },
    { key: "photoCount", label: "Photos" },
  ];
  const toggle = (k, sortable) =>
    sortable === false ? null : setSort((s) => (s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: 1 }));

  return (
    <div style={{ overflowX: "auto", background: C.sheet, border: `1px solid ${C.rule}`, borderRadius: 4 }}>
      <table style={{ width: "100%", minWidth: 820, borderCollapse: "collapse" }}>
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
                      <img src={p.cover} alt="" style={{ width: 26, height: 26, objectFit: "cover", borderRadius: 2, flexShrink: 0 }} />
                    ) : (
                      <span style={{ width: 26, height: 26, borderRadius: 2, border: `1px solid ${C.rule}`, flexShrink: 0 }} />
                    )}
                    {p.common || "Unnamed"}
                  </span>
                </td>
                <td style={{ padding: "9px 13px", fontFamily: serif, fontStyle: "italic", fontSize: 15, color: C.moss }}>
                  {p.scientific || "—"}
                </td>
                <td style={{ padding: "9px 13px", fontFamily: sans, fontSize: 13, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {fmtDate(p.acquired)}
                </td>
                <td style={{ padding: "9px 13px", fontFamily: sans, fontSize: 13 }}>{p.location || "—"}</td>
                <td style={{ padding: "9px 13px", fontFamily: sans, fontSize: 13, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {fmtDate(n ? n.date : "")}
                </td>
                <td style={{ padding: "9px 13px" }}>
                  <Tag>{n ? n.tag : ""}</Tag>
                </td>
                <td style={{ padding: "9px 13px", fontFamily: sans, fontSize: 13, color: C.moss }}>{(p.props || []).length || ""}</td>
                <td style={{ padding: "9px 13px", fontFamily: sans, fontSize: 13, color: C.moss }}>{p.photoCount || ""}</td>
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
            <div style={{ fontFamily: serif, fontStyle: "italic", fontSize: 16, lineHeight: 1.2 }}>
              {p.scientific || "Species unrecorded"}
            </div>
            <div style={{ fontFamily: sans, fontSize: 13, marginTop: 3 }}>{p.common || "Unnamed"}</div>
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
function PlantSheet({ plant, shared, usedBytes, onClose, onEdit, onDelete, onPatch, onSpinOff, flash }) {
  const [photos, setPhotos] = useState(null);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [noteTag, setNoteTag] = useState("");
  const [noteDate, setNoteDate] = useState(today());
  const [prop, setProp] = useState({ started: today(), method: "", count: "1", notes: "" });
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
      flash("Photos didn't save. Your device may be low on storage.");
    }
  };

  const addPhotos = async (files) => {
    if (usedBytes > SOFT_LIMIT) {
      flash("This collection is getting large. Consider trimming older photos.");
    }
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

  const addNote = async () => {
    if (!noteText.trim() && !noteTag.trim()) return;
    await onPatch({
      notes: [...(plant.notes || []), { id: uid(), date: noteDate, tag: noteTag.trim(), text: noteText.trim() }],
    });
    setNoteText("");
    setNoteTag("");
    setNoteDate(today());
  };

  const addProp = async () => {
    if (!prop.method.trim()) return;
    await onPatch({
      props: [
        ...(plant.props || []),
        { id: uid(), started: prop.started, method: prop.method.trim(), count: prop.count || "1", notes: prop.notes.trim(), potted: "" },
      ],
    });
    setProp({ started: today(), method: "", count: "1", notes: "" });
  };

  const spinOff = (pr) => {
    onSpinOff({
      id: uid(),
      common: plant.common ? `${plant.common} (prop)` : "Propagation",
      scientific: plant.scientific || "",
      acquired: pr.started,
      location: plant.location || "",
      notes: [{ id: uid(), date: today(), tag: "New growth", text: `Potted up from ${pr.method} started ${fmtDate(pr.started)} off the parent plant.` }],
      props: [],
      photoCount: 0,
      cover: "",
      bytes: 0,
      parent: plant.common || plant.scientific || "",
      added: today(),
    });
  };

  return (
    <Modal onClose={onClose} wide>
      <div style={{ padding: "20px 22px 24px" }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 style={{ fontFamily: serif, fontStyle: "italic", fontSize: 25, margin: 0, lineHeight: 1.15 }}>
              {plant.scientific || "Species unrecorded"}
            </h2>
            <p style={{ fontFamily: sans, fontSize: 15, margin: "4px 0 0" }}>
              {plant.common || "Unnamed"}
              {plant.parent && <span style={{ color: C.moss, fontSize: 13 }}> · from {plant.parent}</span>}
            </p>
          </div>
          <Btn onClick={onClose}>Close</Btn>
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
            <dt style={{ fontSize: 12, color: C.moss }}>Acquired</dt>
            <dd style={{ margin: 0 }}>{fmtDate(plant.acquired)}</dd>
          </div>
          <div>
            <dt style={{ fontSize: 12, color: C.moss }}>Room</dt>
            <dd style={{ margin: 0 }}>{plant.location || "—"}</dd>
          </div>
          <div>
            <dt style={{ fontSize: 12, color: C.moss }}>Added to deck</dt>
            <dd style={{ margin: 0 }}>{fmtDate(plant.added)}</dd>
          </div>
          <div>
            <dt style={{ fontSize: 12, color: C.moss }}>Latest status</dt>
            <dd style={{ margin: 0 }}>{latestNote(plant) && latestNote(plant).tag ? latestNote(plant).tag : "—"}</dd>
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

        {/* care journal */}
        <div className="mb-7">
          <h3 style={{ fontFamily: serif, fontSize: 18, margin: "0 0 4px" }}>Care journal</h3>
          <p style={{ fontFamily: sans, fontSize: 12, color: C.sage, margin: "0 0 10px" }}>
            Health and status live here — tag an entry and the newest tag shows in the ledger.
          </p>
          <div className="flex flex-wrap gap-2 items-start mb-4">
            <input type="date" value={noteDate} onChange={(e) => setNoteDate(e.target.value)} style={{ ...inputStyle, width: 145 }} />
            <input
              list="status-tags"
              value={noteTag}
              onChange={(e) => setNoteTag(e.target.value)}
              placeholder="Status"
              style={{ ...inputStyle, width: 130 }}
            />
            <datalist id="status-tags">
              {STATUS_TAGS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Two new roots on the wet stick. Moved further from the radiator."
              style={{ ...inputStyle, flex: "1 1 240px", minHeight: 60, resize: "vertical" }}
            />
            <Btn tone="solid" onClick={addNote} disabled={!noteText.trim() && !noteTag.trim()}>Save entry</Btn>
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

        {/* propagations */}
        <div>
          <h3 style={{ fontFamily: serif, fontSize: 18, margin: "0 0 4px" }}>Propagations</h3>
          <p style={{ fontFamily: sans, fontSize: 12, color: C.sage, margin: "0 0 10px" }}>
            Cuttings taken off this plant. When one roots and gets potted, give it its own card.
          </p>
          <div className="flex flex-wrap gap-2 items-start mb-4">
            <input type="date" value={prop.started} onChange={(e) => setProp({ ...prop, started: e.target.value })} style={{ ...inputStyle, width: 145 }} />
            <input
              value={prop.method}
              onChange={(e) => setProp({ ...prop, method: e.target.value })}
              placeholder="Node cutting in water"
              style={{ ...inputStyle, width: 190 }}
            />
            <input
              value={prop.count}
              onChange={(e) => setProp({ ...prop, count: e.target.value })}
              placeholder="How many"
              style={{ ...inputStyle, width: 95 }}
            />
            <input
              value={prop.notes}
              onChange={(e) => setProp({ ...prop, notes: e.target.value })}
              placeholder="Notes"
              style={{ ...inputStyle, flex: "1 1 180px" }}
            />
            <Btn tone="solid" onClick={addProp} disabled={!prop.method.trim()}>Log cutting</Btn>
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
                        <Btn
                          tone="link"
                          onClick={() =>
                            onPatch({ props: plant.props.map((x) => (x.id === pr.id ? { ...x, potted: today() } : x)) })
                          }
                        >
                          Mark potted
                        </Btn>
                      )}
                      <Btn tone="link" onClick={() => spinOff(pr)}>Make its own card</Btn>
                      <Btn tone="danger" onClick={() => onPatch({ props: plant.props.filter((x) => x.id !== pr.id) })}>Delete</Btn>
                    </span>
                  </div>
                  {pr.notes && (
                    <p style={{ fontFamily: sans, fontSize: 13, color: C.moss, margin: "4px 0 0 100px" }}>{pr.notes}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between mt-7 pt-4" style={{ borderTop: `1px solid ${C.rule}` }}>
          <Btn onClick={onEdit}>Edit details</Btn>
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
function PlantForm({ initial, onCancel, onSave }) {
  const [f, setF] = useState(
    initial || {
      id: uid(),
      common: "",
      scientific: "",
      acquired: today(),
      location: "",
      notes: [],
      props: [],
      photoCount: 0,
      cover: "",
      bytes: 0,
      added: today(),
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
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))" }}>
          <Field label="Acquired">
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
function Settings({ plants, usedBytes, onClose, onBackup, onRestore }) {
  const [restoreText, setRestoreText] = useState("");
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
          {fmtBytes(usedBytes)} on this device, almost all of it photos. There's no fixed ceiling — Android grants
          storage from free disk space — so the bar is a rough sense of scale, not a limit.
        </p>

        <h3 style={{ fontFamily: sans, fontSize: 13, color: C.moss, margin: "0 0 6px" }}>Backup</h3>
        <p style={{ fontFamily: sans, fontSize: 12, color: C.moss, margin: "0 0 10px" }}>
          Everything lives on this device only. Clearing this site's browser data, or uninstalling, takes the collection
          with it — so export now and then. The file holds every plant, note, propagation, and wishlist entry; photos
          aren't included.
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
  const cols = ["Common name", "Scientific name", "First seen", "Where it would go", "Source or seller", "Priority", ""];
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
              <td onClick={() => onEdit(w)} style={{ padding: "9px 13px", fontFamily: sans, fontSize: 14, cursor: "pointer" }}>
                {w.common || "Unnamed"}
              </td>
              <td onClick={() => onEdit(w)} style={{ padding: "9px 13px", fontFamily: serif, fontStyle: "italic", fontSize: 15, color: C.moss, cursor: "pointer" }}>
                {w.scientific || "—"}
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
function WishForm({ initial, onCancel, onSave, onDelete, onAcquire }) {
  const [f, setF] = useState(
    initial || { id: uid(), common: "", scientific: "", seen: today(), room: "", source: "", priority: "Someday", notes: "" }
  );
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

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
