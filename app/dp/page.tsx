import Link from 'next/link'

export default function DepartamentoPessoal() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Plus Jakarta Sans', sans-serif; }
        .dp-root {
          min-height: 100vh;
          background: #0f1623;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2rem;
          padding: 2rem;
        }
        .dp-root::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(52,211,153,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(52,211,153,0.03) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
        }
        .dp-card {
          position: relative;
          z-index: 1;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(52,211,153,0.15);
          border-radius: 20px;
          padding: 3rem;
          text-align: center;
          max-width: 480px;
          width: 100%;
        }
        .dp-icon {
          font-size: 48px;
          margin-bottom: 1.5rem;
          display: block;
        }
        .dp-title {
          font-size: 24px;
          font-weight: 700;
          color: white;
          margin-bottom: 0.75rem;
          letter-spacing: -0.02em;
        }
        .dp-desc {
          font-size: 14px;
          color: rgba(255,255,255,0.4);
          line-height: 1.7;
          margin-bottom: 2rem;
        }
        .dp-back {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 0.65rem 1.25rem;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          color: rgba(255,255,255,0.6);
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.2s;
          font-family: inherit;
        }
        .dp-back:hover {
          background: rgba(255,255,255,0.08);
          color: white;
          border-color: rgba(255,255,255,0.2);
        }
      `}</style>
      <div className="dp-root">
        <div className="dp-card">
          <span className="dp-icon">🚧</span>
          <div className="dp-title">Departamento Pessoal</div>
          <div className="dp-desc">
            Este módulo está em desenvolvimento.<br />
            Em breve estará disponível com gestão de colaboradores, folha de pagamento, férias e controle de ponto.
          </div>
          <Link href="/" className="dp-back">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Voltar ao início
          </Link>
        </div>
      </div>
    </>
  )
}
