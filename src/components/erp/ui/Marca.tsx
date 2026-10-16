/**
 * Assinatura das áreas privadas: FlowFoods com o vermelho só no "Foods" e o
 * rótulo da área ("ERP", "Barney"). Mesma peça no shell e no /entrar (fora
 * do shell, o token cai no valor do tema escuro: o /entrar continua igual).
 */
export function Marca({ rotulo, compacta = false }: { rotulo: string; compacta?: boolean }) {
  if (compacta) {
    return (
      <span className="font-display text-lg font-bold tracking-tight" aria-label={`FlowFoods ${rotulo}`}>
        F<span className="text-assinatura">F</span>
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap font-display text-lg font-bold tracking-tight">
      Flow<span className="text-assinatura">Foods</span>
      <span className="ml-2 align-middle font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-suave">
        {rotulo}
      </span>
    </span>
  );
}
