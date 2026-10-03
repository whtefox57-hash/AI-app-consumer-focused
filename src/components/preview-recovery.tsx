"use client";

export function PreviewRecovery({ message }: { message?: string }) {
  return (
    <main className="auth-wrap">
      <section
        className="auth-card preview-recovery-card"
        aria-labelledby="preview-recovery-title"
      >
        <div className="wordmark">
          cast<span>✳︎</span>
        </div>
        <h1 id="preview-recovery-title">Let’s reopen your preview.</h1>
        <p role="alert">{message || "Cast couldn’t open this preview."}</p>
        <button
          className="primary"
          onClick={() => {
            const url = new URL(location.href);
            url.searchParams.set("reload", String(Date.now()));
            location.assign(url.href);
          }}
        >
          Try again
        </button>
        <a className="preview-recovery-link" href="?session=1">
          Open a temporary preview
        </a>
        <p className="muted small">
          Temporary mode leaves your saved preview untouched. Changes in that
          mode last until you reload or close the page.
        </p>
        <p className="muted small">
          If this is an in-app browser, open the link in Chrome, Edge, Firefox,
          or Safari.
        </p>
      </section>
    </main>
  );
}
