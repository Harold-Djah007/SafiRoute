export function WaybillJourney() {
  return (
    <div className="waybill-journey" aria-label="Waybill moving from sale to verified delivery">
      <div className="waybill-journey-copy">
        <p className="waybill-journey-kicker">LIVE WAYBILL FLOW</p>
        <p className="waybill-journey-title">Sale → signed → verified</p>
        <p className="waybill-journey-subtitle">Saved on this phone first. HQ receives it when signal returns.</p>
      </div>
      <div className="waybill-journey-stage" aria-hidden="true">
        <svg className="waybill-route" viewBox="0 0 420 150" preserveAspectRatio="none">
          <path className="waybill-route-track" d="M32 111 C 92 34, 147 126, 215 70 S 329 29, 390 62" pathLength="100" />
          <path className="waybill-route-live" d="M32 111 C 92 34, 147 126, 215 70 S 329 29, 390 62" pathLength="100" />
          <circle cx="32" cy="111" r="7" className="waybill-route-node" />
          <circle cx="390" cy="62" r="7" className="waybill-route-node waybill-route-node-end" />
        </svg>
        <div className="waybill-journey-paper">
          <span className="waybill-paper-head">WAYBILL</span>
          <span className="waybill-paper-line" />
          <span className="waybill-paper-line short" />
          <span className="waybill-paper-check">✓</span>
        </div>
        <div className="waybill-journey-pin">
          <span />
        </div>
        <div className="waybill-journey-verified">✓</div>
      </div>
    </div>
  );
}
