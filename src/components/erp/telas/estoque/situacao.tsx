// Scanner avoid-ai-design, SD4d (P2) aceito: "Seco · contou Ana", "Desde 16/10 · 7 insumos com saldo" e "custo de referência de hoje · 1 sem preço" são linhas de apoio da tabela densa, no padrão "A · B" das telas da 1.1–1.5. (O ignore do scanner não aceita id com minúscula.)
/**
 * Estoque por loja (1.6), a MESMA tela no nível 1 e na pessoa do parceiro:
 * cada loja do alcance com a situação do estoque — não aberto (com o "Abrir
 * estoque" para quem ajusta saldo), contagem de abertura em andamento (quanto
 * falta) ou aberto (desde quando, quantos insumos com saldo e o valor pelo
 * custo de referência de hoje). Corporativo: tabela no desktop, lista no
 * celular, número tabular à direita.
 */

import Link from 'next/link';
import type { SituacaoDaLoja } from '@/lib/erp/estoque';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { classeDeBotao } from '../../ui/estilos';
import { LinkDeAjuda } from '../../ui/link-de-ajuda';
import { Aviso, Barra, Painel, Selo, Vazio } from '../../ui/superficies';
import type { AcaoDeEstoque } from './estado';
import { FormAbrirEstoque } from './formularios';

const DATA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });

export function SeloDoEstado({ l }: { l: Pick<SituacaoDaLoja, 'estado'> }) {
  if (l.estado === 'ABERTO') return <Selo tom="ok">Aberto</Selo>;
  if (l.estado === 'EM_CONTAGEM') return <Selo tom="alerta">Em contagem</Selo>;
  return <Selo>Não aberto</Selo>;
}

function Detalhe({ l }: { l: SituacaoDaLoja }) {
  if (l.aberto) {
    return (
      <span>
        Desde {DATA.format(l.aberto.desde)} · {l.aberto.itensComSaldo} {l.aberto.itensComSaldo === 1 ? 'insumo com saldo' : 'insumos com saldo'}
      </span>
    );
  }
  if (l.contagem) {
    const faltam = l.contagem.total - l.contagem.contados;
    return (
      <span className="block max-w-xs">
        <span className="block">
          {l.contagem.contados} de {l.contagem.total} contados{faltam > 0 ? ` · faltam ${faltam}` : ''}
        </span>
        <span className="mt-1.5 block">
          <Barra valor={l.contagem.contados} total={l.contagem.total} tom="alerta" rotulo={`${l.contagem.contados} de ${l.contagem.total} insumos contados`} />
        </span>
      </span>
    );
  }
  return <span>{l.ativa ? 'A primeira contagem vira o saldo inicial.' : 'Loja desativada.'}</span>;
}

function Valor({ l }: { l: SituacaoDaLoja }) {
  if (!l.aberto) return <span className="text-suave">—</span>;
  return (
    <span>
      <span className="font-semibold text-texto">{formatarDinheiro(l.aberto.valorCentavos)}</span>
      {l.aberto.pendentes > 0 && <span className="block text-[12px] text-suave">+ {l.aberto.pendentes} sem preço</span>}
    </span>
  );
}

function Acao({ l, base, abrir, podeAbrir, podeContar, bloqueio }: { l: SituacaoDaLoja; base: string; abrir: (lojaId: string) => AcaoDeEstoque; podeAbrir: (lojaId: string) => boolean; podeContar: (lojaId: string) => boolean; bloqueio: string | null }) {
  if (l.estado === 'ABERTO') {
    return (
      <Link href={`${base}/${l.id}`} className={classeDeBotao('secundario', 'w-full sm:w-auto')}>
        Ver o saldo
      </Link>
    );
  }
  if (l.estado === 'EM_CONTAGEM') {
    return podeContar(l.id) && !bloqueio ? (
      <Link href={`${base}/${l.id}/abertura`} className={classeDeBotao('secundario', 'w-full sm:w-auto')}>
        Continuar a contagem
      </Link>
    ) : (
      <Link href={`${base}/${l.id}`} className={classeDeBotao('fantasma', 'w-full sm:w-auto')}>
        Ver o andamento
      </Link>
    );
  }
  if (!l.ativa) return null;
  if (podeAbrir(l.id) && !bloqueio) return <FormAbrirEstoque acao={abrir(l.id)} variante="secundario" />;
  return <span className="text-[12px] text-suave">Só gerente ou dona abrem.</span>;
}

export function TelaSituacaoDoEstoque({
  lojas,
  base,
  contexto,
  feito,
  abrir,
  podeAbrir,
  podeContar,
  bloqueio,
}: {
  lojas: SituacaoDaLoja[];
  base: string;
  /** "Rede Completa", a loja da visão ou o nome do parceiro (N1). */
  contexto: string;
  feito?: string;
  abrir: (lojaId: string) => AcaoDeEstoque;
  podeAbrir: (lojaId: string) => boolean;
  podeContar: (lojaId: string) => boolean;
  bloqueio: string | null;
}) {
  const abertas = lojas.filter((l) => l.aberto);
  const total = abertas.reduce((s, l) => s + l.aberto!.valorCentavos, 0);
  const pendentes = abertas.reduce((s, l) => s + l.aberto!.pendentes, 0);
  const algumaFechada = lojas.some((l) => l.estado !== 'ABERTO' && l.ativa);
  const acao = { base, abrir, podeAbrir, podeContar, bloqueio };
  return (
    <div className="space-y-6">
      <PageHeader
        icone="estoque"
        cor={COR.estoque}
        titulo="Visão geral"
        subtitulo={`${contexto} · estoque por loja · ${abertas.length} de ${lojas.length} ${lojas.length === 1 ? 'loja aberta' : 'lojas abertas'}`}
      />
      {feito && <Aviso tom="ok" titulo={feito} />}
      {bloqueio && <Aviso tom="alerta" titulo="Somente leitura.">{bloqueio}</Aviso>}

      {abertas.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-[14px] border border-linha bg-painel px-4 py-3.5 sm:px-5">
            <div className="text-[12px] font-medium text-suave">Valor em estoque · lojas abertas</div>
            <div className="mt-2 font-display text-[28px] font-bold leading-none tabular-nums">{formatarDinheiro(total)}</div>
            <div className="mt-1.5 text-[12px] text-suave">{pendentes > 0 ? `pelo custo de referência de hoje · ${pendentes} sem preço fora da soma` : 'pelo custo de referência de hoje'}</div>
          </div>
        </div>
      )}

      <Painel semRespiro>
        {lojas.length === 0 ? (
          <Vazio titulo="Nenhuma loja no seu acesso.">Peça a quem cuida da equipe para incluir as lojas em que você trabalha.</Vazio>
        ) : (
          <>
            <ul className="divide-y divide-linha md:hidden">
              {lojas.map((l) => (
                <li key={l.id} className="space-y-3 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`${base}/${l.id}`} className="font-medium text-texto underline-offset-4 hover:underline">
                        {l.nome}
                      </Link>
                      <div className="mt-1 text-[13px] tabular-nums text-suave">
                        <Detalhe l={l} />
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm tabular-nums">
                      <SeloDoEstado l={l} />
                      {l.aberto && (
                        <div className="mt-1.5">
                          <Valor l={l} />
                        </div>
                      )}
                    </div>
                  </div>
                  <Acao l={l} {...acao} />
                </li>
              ))}
            </ul>
            <table className="hidden w-full text-sm md:table">
              <caption className="sr-only">Situação do estoque de cada loja do seu acesso.</caption>
              <thead>
                <tr className="bg-forte text-left text-[12px] text-suave">
                  <th scope="col" className="h-10 pl-5 pr-3 font-semibold">
                    Loja
                  </th>
                  <th scope="col" className="h-10 px-3 font-semibold">
                    Situação
                  </th>
                  <th scope="col" className="h-10 px-3 font-semibold">
                    Andamento
                  </th>
                  <th scope="col" className="h-10 px-3 text-right font-semibold">
                    Valor
                  </th>
                  <th scope="col" className="h-10 px-3 pr-5 text-right font-semibold">
                    <span className="sr-only">Ação</span>
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {lojas.map((l) => (
                  <tr key={l.id} className="border-t border-linha align-middle">
                    <td className="py-3 pl-5 pr-3">
                      <Link href={`${base}/${l.id}`} className="font-medium text-texto underline-offset-4 hover:underline">
                        {l.nome}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <SeloDoEstado l={l} />
                    </td>
                    <td className="px-3 py-3 text-suave">
                      <Detalhe l={l} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Valor l={l} />
                    </td>
                    <td className="px-3 py-3 pr-5 text-right">
                      <Acao l={l} {...acao} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Painel>

      {algumaFechada && (
        <p>
          <LinkDeAjuda secao="abertura">Como abre o estoque de uma loja</LinkDeAjuda>
        </p>
      )}
    </div>
  );
}
