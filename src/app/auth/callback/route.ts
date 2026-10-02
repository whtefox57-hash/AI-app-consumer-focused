import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
export async function GET(request: NextRequest) {
  const origin = process.env.APP_URL || request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const client = await db();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error)
      console.error(
        "Authentication link verification failed:",
        error.code || error.name,
      );
    if (!error)
      return NextResponse.redirect(
        new URL(
          request.nextUrl.searchParams.get("reset") === "1"
            ? "/auth/reset"
            : "/",
          origin,
        ),
      );
  }
  return NextResponse.redirect(
    new URL("/?authError=Unable%20to%20verify%20this%20sign-in%20link", origin),
  );
}
