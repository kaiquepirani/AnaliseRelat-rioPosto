import Link from 'next/link'

export default function Home() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .hub-root {
          min-height: 100vh;
          background: #0f1623;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-family: 'Plus Jakarta Sans', sans-serif;
          padding: 2rem;
          position: relative;
          overflow: hidden;
        }

        /* Grade de fundo sutil */
        .hub-root::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(74,171,219,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(74,171,219,0.04) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
        }

        /* Brilho central */
        .hub-root::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -60%);
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(45,58,107,0.4) 0%, transparent 70%);
          pointer-events: none;
        }

        .hub-inner {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3rem;
          width: 100%;
          max-width: 860px;
        }

        /* Cabeçalho */
        .hub-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          text-align: center;
        }

        .hub-logo-wrap {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .hub-logo {
          height: 64px;
          width: auto;
          object-fit: contain;
          filter: drop-shadow(0 0 12px rgba(74,171,219,0.3));
        }

        .hub-logo-divider {
          width: 1px;
          height: 40px;
          background: rgba(255,255,255,0.15);
        }

        .hub-logo-text {
          display: flex;
          flex-direction: column;
          text-align: left;
        }

        .hub-logo-title {
          font-size: 17px;
          font-weight: 700;
          color: white;
          letter-spacing: -0.01em;
          line-height: 1.2;
        }

        .hub-logo-sub {
          font-size: 12px;
          color: #4AABDB;
          font-weight: 500;
          letter-spacing: 0.04em;
          margin-top: 2px;
        }

        .hub-tagline {
          font-size: 13px;
          color: rgba(255,255,255,0.3);
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        /* Cards dos sistemas */
        .hub-cards {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.25rem;
          width: 100%;
        }

        .hub-card {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          padding: 2rem;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          text-decoration: none;
          transition: all 0.25s ease;
          overflow: hidden;
          cursor: pointer;
        }

        .hub-card::before {
          content: '';
          position: absolute;
          inset: 0;
          opacity: 0;
          transition: opacity 0.25s ease;
          border-radius: 16px;
        }

        .hub-card-combustivel::before {
          background: linear-gradient(135deg, rgba(45,58,107,0.6) 0%, rgba(74,171,219,0.15) 100%);
        }

        .hub-card-dp::before {
          background: linear-gradient(135deg, rgba(16,140,100,0.4) 0%, rgba(52,211,153,0.12) 100%);
        }

        .hub-card-em-breve::before {
          background: linear-gradient(135deg, rgba(60,60,80,0.4) 0%, rgba(100,100,120,0.1) 100%);
        }

        .hub-card:hover::before { opacity: 1; }

        .hub-card:hover {
          border-color: rgba(255,255,255,0.16);
          transform: translateY(-3px);
          box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        }

        .hub-card-em-breve {
          cursor: default;
          opacity: 0.5;
        }
        .hub-card-em-breve:hover {
          transform: none;
          box-shadow: none;
          border-color: rgba(255,255,255,0.08);
        }

        .hub-card-top {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
        }

        .hub-card-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          flex-shrink: 0;
        }

        .hub-card-combustivel .hub-card-icon {
          background: rgba(74,171,219,0.15);
          border: 1px solid rgba(74,171,219,0.2);
        }

        .hub-card-dp .hub-card-icon {
          background: rgba(52,211,153,0.15);
          border: 1px solid rgba(52,211,153,0.2);
        }

        .hub-card-em-breve .hub-card-icon {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .hub-card-badge {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          padding: 3px 8px;
          border-radius: 20px;
        }

        .hub-card-combustivel .hub-card-badge {
          background: rgba(74,171,219,0.15);
          color: #4AABDB;
          border: 1px solid rgba(74,171,219,0.25);
        }

        .hub-card-dp .hub-card-badge {
          background: rgba(52,211,153,0.15);
          color: #34d399;
          border: 1px solid rgba(52,211,153,0.25);
        }

        .hub-card-em-breve .hub-card-badge {
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.3);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .hub-card-body {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          flex: 1;
        }

        .hub-card-title {
          font-size: 18px;
          font-weight: 700;
          color: white;
          letter-spacing: -0.01em;
          line-height: 1.2;
        }

        .hub-card-desc {
          font-size: 13px;
          color: rgba(255,255,255,0.45);
          line-height: 1.6;
          font-weight: 400;
        }

        .hub-card-footer {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 1rem;
          border-top: 1px solid rgba(255,255,255,0.06);
        }

        .hub-card-features {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .hub-card-feature {
          font-size: 10px;
          font-weight: 600;
          color: rgba(255,255,255,0.3);
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 6px;
          padding: 2px 7px;
          letter-spacing: 0.02em;
        }

        .hub-card-arrow {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255,255,255,0.4);
          transition: all 0.2s ease;
          flex-shrink: 0;
        }

        .hub-card:hover .hub-card-arrow {
          color: white;
          border-color: rgba(255,255,255,0.3);
          background: rgba(255,255,255,0.06);
        }

        /* Rodapé */
        .hub-footer {
          font-size: 11px;
          color: rgba(255,255,255,0.15);
          font-weight: 500;
          letter-spacing: 0.04em;
        }

        @media (max-width: 640px) {
          .hub-cards { grid-template-columns: 1fr; }
          .hub-logo { height: 48px; }
          .hub-card { padding: 1.5rem; }
          .hub-card-title { font-size: 16px; }
        }
      `}</style>

      <div className="hub-root">
        <div className="hub-inner">

          {/* Cabeçalho */}
          <div className="hub-header">
            <div className="hub-logo-wrap">
              <img src="/logo.png" alt="ETCO Tur" className="hub-logo" />
              <div className="hub-logo-divider" />
              <div className="hub-logo-text">
                <div className="hub-logo-title">ETCO Empresa de Turismo</div>
                <div className="hub-logo-sub">e Transporte Coletivo Ltda</div>
              </div>
            </div>
            <div className="hub-tagline">Selecione o sistema</div>
          </div>

          {/* Cards */}
          <div className="hub-cards">

            {/* Abastecimentos */}
            <Link href="/dashboard" className="hub-card hub-card-combustivel">
              <div className="hub-card-top">
                <div className="hub-card-icon">⛽</div>
                <span className="hub-card-badge">Ativo</span>
              </div>
              <div className="hub-card-body">
                <div className="hub-card-title">Gestão de Combustível</div>
                <div className="hub-card-desc">
                  Controle de abastecimentos da frota, análise de extratos por posto, alertas de placas e confronto de viagens.
                </div>
              </div>
              <div className="hub-card-footer">
                <div className="hub-card-features">
                  <span className="hub-card-feature">Extratos PDF/Excel</span>
                  <span className="hub-card-feature">Frota</span>
                  <span className="hub-card-feature">Alertas</span>
                  <span className="hub-card-feature">Confronto</span>
                </div>
                <div className="hub-card-arrow">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              </div>
            </Link>

            {/* Departamento Pessoal */}
            <Link href="/dp" className="hub-card hub-card-dp">
              <div className="hub-card-top">
                <div className="hub-card-icon">👥</div>
                <span className="hub-card-badge">Em construção</span>
              </div>
              <div className="hub-card-body">
                <div className="hub-card-title">Departamento Pessoal</div>
                <div className="hub-card-desc">
                  Gestão de colaboradores, folha de pagamento, férias, controle de ponto e documentação da equipe.
                </div>
              </div>
              <div className="hub-card-footer">
                <div className="hub-card-features">
                  <span className="hub-card-feature">Colaboradores</span>
                  <span className="hub-card-feature">Folha</span>
                  <span className="hub-card-feature">Férias</span>
                  <span className="hub-card-feature">Ponto</span>
                </div>
                <div className="hub-card-arrow">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              </div>
            </Link>

          </div>

          <div className="hub-footer">ETCO Tur · Sistema de Gestão Interno</div>
        </div>
      </div>
    </>
  )
}
