"use client";
import { useState } from "react";
import { browserDb } from "@/lib/browser-db";
export default function Reset() {
  const [message, setMessage] = useState("");
  return (
    <main className="auth-wrap">
      <form
        className="auth-card"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const { error } = await browserDb().auth.updateUser({
            password: String(form.get("password")),
          });
          setMessage(
            error?.message || "Password updated. You can return to Cast.",
          );
        }}
      >
        <span className="wordmark">
          cast<span>✳</span>
        </span>
        <h1>A fresh start.</h1>
        <label>
          New password
          <input
            name="password"
            type="password"
            minLength={10}
            required
            autoComplete="new-password"
          />
        </label>
        <button className="primary">Update password</button>
        <p role="status">{message}</p>
        <a href="/">Return to Cast</a>
      </form>
    </main>
  );
}
