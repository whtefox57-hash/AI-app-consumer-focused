"use client";
import { createBrowserClient } from "@supabase/ssr";
import { previewApi } from "./preview-store";
let designPreview = false;
export function setDesignPreview(enabled: boolean) {
  designPreview = enabled;
}
export function browserDb() {
  if (designPreview)
    throw new Error(
      "Authentication is unavailable in the design preview. Your local preview data stays in this browser.",
    );
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (designPreview) return previewApi<T>(path, options);
  const response = await fetch(`/api/${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
