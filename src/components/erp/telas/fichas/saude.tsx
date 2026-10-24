/**
 * Saúde do cardápio (24/10/2026, referência: "Ficha técnica completa" da Nina)
 * — no topo da lista de fichas, só para quem vê preços. Responde "quantos pratos
 * já posso precificar, e o que falta nos outros?", com:
 *  - por canal, uma barra empilhada dentro / acima / sem dados (com as palavras:
 *    a cor nunca é o único sinal) e o atalho para a lista já filtrada;
 *  - o número principal (pratos prontos) e "o que falta", em passos numerados
 *    na ordem de resolver: custo → meta → preço.
 * As contas são as da lista (nenhuma fórmula nova); sem dados não vira zero.
 */

import Link from 'next/link';
import { CANAIS } from '@/lib/erp/canal-campos';
import { FILTROS_DE_FICHA_PADRAO, queryDosFiltrosDeFicha } from '@/lib/erp/ficha-campos';
import type { SaudeDoCanal, SaudeDoCardapio } from '@/lib/erp/saude-do-cardapio';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Barra, Painel } from '../../ui/superficies';

const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
/** "na Loja", "no Delivery", "no iFood". */
const noCanal = (c: SaudeDoCanal['canal']) => `${c === 'LOJA' ? 'na' : 'no'} ${CANAIS[c].curto}`;

function filtroDoCanal(base: string, s: SaudeDoCanal): string {
  return `${base}?${queryDosFiltrosDeFicha({ ...FILTROS_DE_FICHA_PADRAO, cmv: { canal: s.canal, status: 'semDados' } })}`;
}

function BarraDoCanal({ s }: { s: SaudeDoCanal }) {
  const semDados = s.semCusto + s.semMeta + s.semPreco;
  const partes = [
    { n: s.dentro, cor: 'bg-ok', rotulo: 'dentro da meta' },
    { n: s.acima, cor: 'bg-atencao', rotulo: 'acima da meta' },
    { n: semDados, cor: 'bg-texto/15', rotulo: 'sem dados' },
  ].filter((p) => p.n > 0);
  return (
    <div
      role="img"
      aria-label={`${CANAIS[s.canal].rotulo}: ${partes.map((p) => `${p.n} ${p.rotulo}`).join(', ') || 'nenhum prato oferecido'}`}
      className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-texto/5"
    >
      {partes.map((p) => (
        <span key={p.rotulo} className={`h-full first:rounded-l-full last:rounded-r-full ${p.cor}`} style={{ width: `${(p.n / Math.max(1, s.ofertados)) * 100}%` }} />
      ))}
    </div>
  );
}

export function PainelDeSaude({ saude, base, configuracaoHref }: { saude: SaudeDoCardapio; base: string; configuracaoHref: string }) {
  if (saude.pratos === 0) return null;
  const semMeta = saude.canais.reduce((n, c) => n + c.semMeta, 0);
  const semPreco = saude.canais.reduce((n, c) => n + c.semPreco, 0);
  const canalSemPreco = saude.canais.find((c) => c.semPreco > 0);
  const passos = [
    saude.custoIncompleto > 0 && {
      titulo: `Completar o custo de ${plural(saude.custoIncompleto, 'prato', 'pratos')}`,
      texto: 'Falta preço em algum insumo da receita. Sem custo completo não há CMV nem sugestão.',
      href: `${base}?${queryDosFiltrosDeFicha({ ...FILTROS_DE_FICHA_PADRAO, incompleto: true })}`,
      acao: 'Ver os incompletos',
    },
    semMeta > 0 && {
      titulo: 'Definir a meta de CMV dos canais',
      texto: 'Sem meta não há farol nem preço sugerido. A meta vale para todos os pratos do canal.',
      href: configuracaoHref,
      acao: 'Abrir a Precificação',
    },
    semPreco > 0 && canalSemPreco && {
      titulo: `Escolher o preço que falta (${semPreco.toLocaleString('pt-BR')})`,
      texto: 'O custo e a meta já estão lá: a ficha mostra a sugestão; o preço é escolha sua.',
      href: filtroDoCanal(base, canalSemPreco),
      acao: `Ver os sem preço ${noCanal(canalSemPreco.canal)}`,
    },
  ].filter(Boolean) as { titulo: string; texto: string; href: string; acao: string }[];

  return (
    <Painel titulo="Saúde do cardápio" subtitulo={`${plural(saude.pratos, 'prato ativo', 'pratos ativos')} · CMV ao preço que você definiu, canal a canal`}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <ul className="space-y-4">
          {saude.canais.map((s) => {
            const semDados = s.semCusto + s.semMeta + s.semPreco;
            return (
              <li key={s.canal}>
                <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px]">
                  <span className="font-semibold text-texto">{CANAIS[s.canal].rotulo}</span>
                  <span className="text-suave tabular-nums">
                    {s.ofertados === 0
                      ? 'nenhum prato oferecido'
                      : [s.dentro && `${s.dentro} dentro da meta`, s.acima && `${s.acima} acima`, semDados && `${semDados} sem dados`].filter(Boolean).join(' · ')}
                  </span>
                </div>
                {s.ofertados > 0 && <BarraDoCanal s={s} />}
                {semDados > 0 && (
                  <Link href={filtroDoCanal(base, s)} className={`${LINK_DE_TEXTO} mt-1 inline-flex min-h-11 items-center text-[12px] sm:min-h-0`}>
                    Ver os sem dados {noCanal(s.canal)}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>

        <div className="rounded-[10px] border border-linha bg-fundo/60 px-4 py-4">
          <p className="text-[12px] font-medium text-suave">Pratos prontos para decidir o preço</p>
          <p className="mt-1 text-[34px] font-semibold leading-none text-texto">
            {saude.prontos}
            <span className="ml-1 text-[16px] font-medium text-suave">de {saude.pratos}</span>
          </p>
          <div className="mt-3">
            <Barra valor={saude.prontos} total={saude.pratos} tom={saude.prontos === saude.pratos ? 'ok' : 'alerta'} rotulo={`${saude.prontos} de ${saude.pratos} pratos com CMV calculado em todos os canais que oferecem`} />
          </div>
          {passos.length === 0 ? (
            <p className="mt-3 text-[13px] text-suave">Tudo pronto: cada prato tem CMV calculado nos canais em que vende.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {passos.map((p, n) => (
                <li key={p.titulo} className="flex gap-3">
                  <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-linha-forte text-[12px] font-semibold text-texto">
                    {n + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-texto">{p.titulo}</p>
                    <p className="text-[12px] leading-relaxed text-suave">{p.texto}</p>
                    <Link href={p.href} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center text-[12px] sm:min-h-0`}>
                      {p.acao}
                    </Link>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Painel>
  );
}
