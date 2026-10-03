(window as Window & { __CAST_ASSET_BASE__?: string }).__CAST_ASSET_BASE__ =
  import.meta.env.BASE_URL;

// Keep the HTML recovery screen available even if the app bundle cannot load.
void import("./app").catch(() => {
  window.dispatchEvent(new Event("cast:startup-failed"));
});
