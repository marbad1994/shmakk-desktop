import "./Titlebar.css";

export function Titlebar() {
  const isDarwin = /Mac|iPhone|iPad|iPod/.test(navigator.platform);

  return (
    <div className={`titlebar ${isDarwin ? "titlebar-darwin" : "titlebar-system"}`}>
      {isDarwin && (
        <div className="traffic-lights">
          <button
            className="tl-dot tl-close"
            onClick={() => window.api?.window.close()}
            aria-label="Close"
          />
          <button
            className="tl-dot tl-min"
            onClick={() => window.api?.window.minimize()}
            aria-label="Minimize"
          />
          <button
            className="tl-dot tl-max"
            onClick={() => window.api?.window.maximize()}
            aria-label="Maximize"
          />
        </div>
      )}
      <div className="titlebar-drag" />
      <div className="titlebar-center">
        <span className="titlebar-brand">shmakk</span>
      </div>
      <div className="titlebar-drag" />
      {!isDarwin && (
        <div className="tb-controls">
          <button className="tb-btn" onClick={() => window.api?.window.minimize()} aria-label="Minimize" title="Minimize">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button className="tb-btn" onClick={() => window.api?.window.maximize()} aria-label="Maximize" title="Maximize">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          </button>
          <button className="tb-btn tb-close" onClick={() => window.api?.window.close()} aria-label="Close" title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
