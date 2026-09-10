import React, { useEffect, useState } from "react";
import { supabase, isConfigured } from "./supabaseClient.js";
import SignIn from "./SignIn.jsx";
import PlantLedger from "./PlantLedger.jsx";
import PublicGarden from "./PublicGarden.jsx";

const isGardenRoute = () => window.location.hash.replace(/^#/, "").startsWith("/garden");

export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [garden, setGarden] = useState(isGardenRoute);

  // #/garden is the public view. It never asks anyone to sign in.
  useEffect(() => {
    const onHash = () => setGarden(isGardenRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!isConfigured) {
      setChecking(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (garden) return <PublicGarden />;

  if (checking) {
    return (
      <div style={{ background: "#EFF1EA", minHeight: "100vh", padding: 40, fontFamily: "system-ui, sans-serif", color: "#3F5B41" }}>
        Opening…
      </div>
    );
  }

  if (!session) return <SignIn supabase={supabase} configured={isConfigured} />;

  return (
    <PlantLedger
      account={session.user.email}
      onSignOut={() => supabase.auth.signOut()}
    />
  );
}
