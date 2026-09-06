import React from "react";
import { createRoot } from "react-dom/client";
import PlantLedger from "./PlantLedger.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PlantLedger />
  </React.StrictMode>
);
