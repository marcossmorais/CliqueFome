import '../../admin.css';

/**
 * Esqueleto específico da Gestão de pedidos (tela mais visitada do
 * painel) — substitui o genérico de `(painel)/loading.tsx` só aqui, no
 * formato real de 2 colunas (Em andamento / Prontos) com cards fantasma.
 */
export default function CarregandoPedidos() {
  return (
    <div className="area ativo" aria-hidden="true">
      <div className="esqueleto esqueleto-bloco" style={{ height: 44 }} />
      <div className="pedidos-colunas">
        {Array.from({ length: 2 }).map((_, coluna) => (
          <div key={coluna} className="pedidos-coluna">
            <div className="esqueleto esqueleto-linha" style={{ width: '50%', height: 20 }} />
            <div className="pedidos-lista" style={{ marginTop: 10 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="esqueleto esqueleto-cartao" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
