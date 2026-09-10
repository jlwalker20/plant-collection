import React, { useState } from "react";

const C = { paper: "#EFF1EA", sheet: "#F8F9F4", ink: "#17251C", moss: "#3F5B41", sage: "#8B9C84", rule: "#CFD5C6", warn: "#8A4B3A" };
const serif = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";
const sans = "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif";

export default function SignIn({ supabase, configured }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(error.message);
    setBusy(false);
  };

  const input = {
    width: "100%",
    fontFamily: sans,
    fontSize: 16, // 16px keeps Android from zooming the page on focus
    color: C.ink,
    background: C.sheet,
    border: `1px solid ${C.rule}`,
    borderRadius: 3,
    padding: "10px 12px",
    outline: "none",
    marginBottom: 12,
  };

  return (
    <div style={{ background: C.paper, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 340 }}>
        <h1 style={{ fontFamily: serif, fontSize: 28, margin: "0 0 6px", color: C.ink }}>The Living Collection</h1>
        <p style={{ fontFamily: sans, fontSize: 13, color: C.moss, margin: "0 0 24px" }}>
          Sign in to reach the shared collection.
        </p>

        {!configured ? (
          <p style={{ fontFamily: sans, fontSize: 13, color: C.warn }}>
            This build has no Supabase keys. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY as repository secrets and
            redeploy.
          </p>
        ) : (
          <>
            <input
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={input}
            />
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              style={input}
            />
            {error && (
              <p style={{ fontFamily: sans, fontSize: 13, color: C.warn, margin: "0 0 12px" }}>{error}</p>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={busy || !email.trim() || !password}
              style={{
                width: "100%",
                fontFamily: sans,
                fontSize: 15,
                padding: "11px 14px",
                borderRadius: 3,
                border: `1px solid ${C.moss}`,
                background: C.moss,
                color: C.sheet,
                cursor: busy ? "default" : "pointer",
                opacity: busy || !email.trim() || !password ? 0.5 : 1,
              }}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <p style={{ fontFamily: sans, fontSize: 12, color: C.sage, margin: "16px 0 0", lineHeight: 1.5 }}>
              Accounts are created by hand in the Supabase dashboard — there's no public sign-up, which is what keeps
              the collection to the two of you.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
