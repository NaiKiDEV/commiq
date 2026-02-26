import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./App";
import "./index.css";

if (import.meta.env.DEV) {
  const { setupOtel } = await import("./otel");
  setupOtel();
}

const root = createRoot(document.getElementById("root")!);
root.render(
  <HashRouter>
    <App />
  </HashRouter>,
);
