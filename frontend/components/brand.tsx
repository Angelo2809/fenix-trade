export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "compact" : ""}`}>
      <img src="/assets/fenix/logo.png" alt="" />
      <div>
        <span>Fenix</span>
        <small>PLATAFORMA DE INVESTIMENTOS</small>
      </div>
    </div>
  );
}
