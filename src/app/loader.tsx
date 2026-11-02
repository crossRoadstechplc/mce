// Shared loading UI. Pure markup + CSS, so it works in Server and Client Components.

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spin" style={{ width: size, height: size }} aria-hidden="true" />;
}

/** Full-screen loading state with the app mark, e.g. while signing in or out. */
export function LoadingScreen({ label, overlay = false }: { label: string; overlay?: boolean }) {
  return (
    <div className={overlay ? "loadscreen overlay" : "loadscreen"} role="status" aria-live="polite">
      <div className="loadmark">
        <svg viewBox="0 0 64 64" width="44" height="44" aria-hidden="true">
          <rect width="64" height="64" rx="14" fill="#3A7AC2" />
          <rect x="11" y="27" width="17" height="27" rx="2" fill="#E4EFFA" />
          <rect x="31" y="11" width="22" height="43" rx="2" fill="#FFFFFF" />
        </svg>
        <span className="ring" />
      </div>
      <span className="loadlabel">{label}</span>
    </div>
  );
}
