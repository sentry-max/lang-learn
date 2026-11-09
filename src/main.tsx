// First, so the splash animates as soon as this bundle runs.
import "@presentation/components/ui/logo/LogoSplashLoader";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyStoredAppearance } from "@presentation/appearance";
import "./index.css";

applyStoredAppearance();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
