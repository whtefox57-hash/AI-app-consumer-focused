import React from "react";
import { createRoot } from "react-dom/client";
import "../../src/app/globals.css";
import { Cast } from "../../src/components/cast";

(window as Window & { __CAST_ASSET_BASE__?: string }).__CAST_ASSET_BASE__ =
  import.meta.env.BASE_URL;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Cast configured={false} designPreview />
  </React.StrictMode>,
);
