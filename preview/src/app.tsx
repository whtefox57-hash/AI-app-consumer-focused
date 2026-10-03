import React, { Component, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "../../src/app/globals.css";
import { Cast } from "../../src/components/cast";
import { PreviewRecovery } from "../../src/components/preview-recovery";

class PreviewBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <PreviewRecovery message="Something interrupted this preview. Try reopening it, or use temporary mode to leave your saved data untouched." />
    ) : (
      this.props.children
    );
  }
}

function Preview() {
  useEffect(() => {
    window.dispatchEvent(new Event("cast:startup-ready"));
  }, []);
  return (
    <PreviewBoundary>
      <Cast configured={false} designPreview />
    </PreviewBoundary>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Preview />
  </React.StrictMode>,
);
