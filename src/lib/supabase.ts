import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { AppError } from "./ai";
export function configured() {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}
export async function db() {
  if (!configured())
    throw new AppError(
      503,
      "Accounts are not connected. The owner must configure Supabase.",
    );
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (items) => {
          for (const { name, value, options } of items)
            store.set(name, value, options);
        },
      },
    },
  );
}
export async function authenticated() {
  const supabase = await db();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new AppError(401, "Sign in to continue.");
  return { supabase, user };
}
export function admin() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new AppError(
      503,
      "The account administrator and scheduler are not configured.",
    );
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export function checked<
  T extends { data: unknown; error: { message: string } | null },
>(result: T): NonNullable<T["data"]> {
  if (result.error)
    throw new AppError(
      400,
      "The database could not save this change. Check the record and try again.",
    );
  return result.data as NonNullable<T["data"]>;
}
