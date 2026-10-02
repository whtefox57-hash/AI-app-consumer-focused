/** Shared public asset paths for the Next app and the GitHub Pages preview. */
export function assetPath(path: string) {
  const base =
    typeof window === "undefined"
      ? ""
      : (window as Window & { __CAST_ASSET_BASE__?: string })
          .__CAST_ASSET_BASE__ || "";
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}
