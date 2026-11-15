/** Janela de módulo (UX-MOD-2): enquanto a tela chega do servidor, a janela já aberta diz que está carregando. */
export default function CarregandoNaJanela() {
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">Carregando a tela.</span>
      <div aria-hidden className="h-8 w-56 max-w-full rounded-campo bg-forte" />
      <div aria-hidden className="h-4 w-80 max-w-full rounded-campo bg-forte" />
      <div aria-hidden className="h-40 rounded-cartao border border-linha bg-painel" />
    </div>
  );
}
