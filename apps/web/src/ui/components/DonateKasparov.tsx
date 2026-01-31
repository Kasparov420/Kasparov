import React from "react";

export default function DonateKasparov() {
  return (
    <div style={{textAlign:'center', marginTop: 32, marginBottom: 12}}>
      <a
        href="https://kas.coffee/kasparov"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-block',
          background: 'linear-gradient(90deg,#4DD4AC,#22c55e)',
          color: '#fff',
          fontWeight: 700,
          fontSize: 16,
          borderRadius: 12,
          padding: '12px 28px',
          textDecoration: 'none',
          boxShadow: '0 4px 24px rgba(34,197,94,0.12)',
          transition: 'all .2s',
        }}
        onMouseOver={e => (e.currentTarget.style.background = 'linear-gradient(90deg,#22c55e,#4DD4AC)')}
        onMouseOut={e => (e.currentTarget.style.background = 'linear-gradient(90deg,#4DD4AC,#22c55e)')}
      >
        ☕ Support Kasparov on kas.coffee
      </a>
    </div>
  );
}
