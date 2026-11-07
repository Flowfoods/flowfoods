/** Datas de situação: o instante é formatado em São Paulo, nunca no fuso do navegador. */
const INSTANTE = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

export function InstanteDaIntegracao({ valor, vazio = 'Sem registro' }: { valor: string | null; vazio?: string }) {
  if (!valor) return <span>{vazio}</span>;
  const data = new Date(valor);
  if (!Number.isFinite(data.getTime())) return <span>Data não disponível</span>;
  return <time dateTime={data.toISOString()} className="tabular-nums">{INSTANTE.format(data)}</time>;
}

/** Dia civil validado pelo leitor; não transforma meia-noite UTC no dia anterior. */
export function diaDaIntegracao(valor: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : 'Dia não disponível';
}
