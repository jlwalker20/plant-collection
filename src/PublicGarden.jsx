import React, { useEffect, useState } from "react";
import { fetchPublished } from "./publish.js";

const C = { paper: "#EFF1EA", sheet: "#F8F9F4", ink: "#17251C", moss: "#3F5B41", sage: "#8B9C84", rule: "#CFD5C6" };
const serif = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";
const sans = "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif";

function fmtDate(d) {
  if (!d) return "";
  const p = String(d).split("-");
  if (p.length !== 3) return d;
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][parseInt(p[1], 10) - 1];
  return `${m || p[1]} ${parseInt(p[2], 10)}, ${p[0]}`;
}

export default function PublicGarden() {
  const [state, setState] = useState({ status: "loading" });
  const [open, setOpen] = useState(null);

  useEffect(() => {
    fetchPublished()
      .then((row) => {
        if (!row || !row.payload) return setState({ status: "empty" });
        setState({ status: "ready", data: row.payload, at: row.published_at });
      })
      .catch(() => setState({ status: "error" }));
  }, []);

  if (state.status === "loading") {
    return <Shell><p style={{ fontFamily: sans, color: C.moss }}>Loading…</p></Shell>;
  }
  if (state.status !== "ready") {
    return (
      <Shell>
        <p style={{ fontFamily: serif, fontSize: 22, color: C.ink, margin: "0 0 6px" }}>Nothing published yet</p>
        <p style={{ fontFamily: sans, fontSize: 14, color: C.moss, margin: 0 }}>
          There's no public collection at this address right now.
        </p>
      </Shell>
    );
  }

  const { title, blurb, plants, showRooms } = state.data;

  return (
    <Shell>
      <header style={{ borderBottom: `2px solid ${C.ink}`, paddingBottom: 14, marginBottom: 22 }}>
        <h1 style={{ fontFamily: serif, fontSize: 30, lineHeight: 1.05, margin: 0, color: C.ink }}>{title}</h1>
        {blurb && (
          <p style={{ fontFamily: sans, fontSize: 14, color: C.moss, margin: "8px 0 0", maxWidth: 560, lineHeight: 1.5 }}>{blurb}</p>
        )}
        <p style={{ fontFamily: sans, fontSize: 12, color: C.sage, margin: "8px 0 0" }}>
          {plants.length} {plants.length === 1 ? "plant" : "plants"} · updated {fmtDate(String(state.at).slice(0, 10))}
        </p>
      </header>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(205px, 1fr))" }}>
        {plants.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpen(p)}
            style={{ textAlign: "left", background: C.sheet, border: `1px solid ${C.rule}`, borderRadius: 3, padding: 10, cursor: "pointer" }}
          >
            <div
              style={{
                aspectRatio: "4 / 5",
                background: p.photos[0] ? `#e6e9df url(${p.photos[0]}) center/cover` : "#e6e9df",
                borderRadius: 2,
                marginBottom: 10,
              }}
            />
            <div style={{ fontFamily: serif, fontStyle: "italic", fontSize: 16, lineHeight: 1.2, color: C.ink }}>
              {p.scientific || "Species unrecorded"}
            </div>
            <div style={{ fontFamily: sans, fontSize: 13, marginTop: 3, color: C.ink }}>{p.common || "Unnamed"}</div>
            {showRooms && p.room && (
              <div style={{ fontFamily: sans, fontSize: 12, color: C.moss, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.rule}` }}>
                {p.room}
              </div>
            )}
          </button>
        ))}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto"
          style={{ background: "rgba(23,37,28,0.5)", padding: "20px 10px" }}
          onClick={(e) => e.target === e.currentTarget && setOpen(null)}
        >
          <div className="w-full" style={{ maxWidth: 620, background: C.sheet, border: `1px solid ${C.rule}`, borderRadius: 4, padding: 22 }}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 style={{ fontFamily: serif, fontStyle: "italic", fontSize: 24, margin: 0, color: C.ink }}>
                  {open.scientific || "Species unrecorded"}
                </h2>
                <p style={{ fontFamily: sans, fontSize: 15, margin: "4px 0 0", color: C.ink }}>{open.common}</p>
                {open.added && (
                  <p style={{ fontFamily: sans, fontSize: 12, color: C.moss, margin: "6px 0 0" }}>
                    In the collection since {fmtDate(open.added)}
                    {showRooms && open.room ? ` · ${open.room}` : ""}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(null)}
                style={{ fontFamily: sans, fontSize: 13, padding: "7px 13px", borderRadius: 3, border: `1px solid ${C.rule}`, background: "transparent", color: C.ink, cursor: "pointer" }}
              >
                Close
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {open.photos.map((src, i) => (
                <img key={i} src={src} alt="" style={{ width: 240, borderRadius: 2, flexShrink: 0 }} />
              ))}
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{ background: C.paper, minHeight: "100vh" }}>
      <div className="mx-auto" style={{ maxWidth: 1080, padding: "28px 18px 60px" }}>{children}</div>
    </div>
  );
}
