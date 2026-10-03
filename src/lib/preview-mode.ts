export function isTemporaryPreview() {
  return (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("session") === "1"
  );
}
