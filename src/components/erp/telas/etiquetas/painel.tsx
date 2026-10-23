// Scanner avoid-ai-design, SD4d (P2) aceito: "lote 261023-01 · 4,6 kg · concluído 23/10/2026 às 14:05" é a linha de apoio, no padrão "A · B" das telas da 1.1–3.3.
/**
 * Etiquetas de uma loja (3.4), a aba Imprimir: o que está esperando a impressora (emitido, ainda válido, sem envio aceito pela
 * Zebra e sem "Já imprimi"), os lotes produzidos concluídos e as embalagens abertas dos últimos 7 dias (ou o lote procurado
 * pelo código), cada um com a validade em palavras; o vencido diz "venceu: não use", não "sem etiqueta ainda" (rodada 1).
 * Toda linha é um alvo de toque inteiro. Nenhum valor em R$: a cozinha imprime sem ver custo.
 */

import Link from 'next/link';
import type { PainelDeEtiquetas } from '@/lib/erp/etiquetas';
import { FORMATOS, quandoNaTela, type Formato } from '@/lib/erp/etiqueta-campos';
import { COR } from '@/lib/erp/modulos';
import { CONSERVACOES } from '@/lib/erp/validade';
import { PageHeader } from '../../ui/cabecalho';
import { classeDeBotao } from '../../ui/estilos';
import { BuscaEmFormulario } from '../../ui/filtros';
import { Aviso, Contagem, Painel, Vazio } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { SeloDaValidade } from './partes';

const LINHA = 'ff-transicao flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-3 hover:bg-texto/[0.03] sm:px-5';

const etiquetas = (n: number) => `${n} ${n === 1 ? 'etiqueta' : 'etiquetas'}`;
const emissoes = (n: number, vencido = false) => (vencido ? 'venceu: não use' : n === 0 ? 'sem etiqueta ainda' : `${n} ${n === 1 ? 'emissão' : 'emissões'}`);

export function TelaPainelDeEtiquetas({ p, base, contexto, feito, podeAbrir }: { p: PainelDeEtiquetas; base: string; contexto?: string; feito?: string; /** O nível 1 não abre embalagem (quem abre assina a etiqueta). */ podeAbrir: boolean }) {
  const aqui = `${base}/${p.loja.id}`;
  return (
    <div className="space-y-5">
      <TrilhaDaPagina itens={[{ rotulo: p.loja.nome }]} />
      <PageHeader
        icone="etiquetas"
        cor={COR.etiquetas}
        titulo="Etiquetas"
        subtitulo={[contexto, p.loja.nome, p.busca ? `lote com “${p.busca}”` : 'últimos 7 dias'].filter(Boolean).join(' · ')}
        acao={
          podeAbrir ? (
            <Link href={`${aqui}/abrir`} className={classeDeBotao('primario')}>
              Abrir embalagem
            </Link>
          ) : undefined
        }
      >
        <BuscaEmFormulario nome="lote" valor={p.busca} rotulo="Procurar o lote produzido pelo código" placeholder="Código do lote (ex.: 261023-01)" />
      </PageHeader>
      {feito && <Aviso tom="ok" titulo={feito} />}

      {p.fila.length > 0 && (
        <Painel titulo="Esperando a impressora" subtitulo="Emitidas nos últimos 2 dias: saem daqui quando a Zebra aceita ou quando alguém toca em “Já imprimi”" acessorio={<Contagem>{p.fila.length}</Contagem>} semRespiro>
          <ul className="divide-y divide-linha">
            {p.fila.map((e) => (
              <li key={e.id}>
                <Link href={`${aqui}/${e.id}`} className={LINHA}>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-texto [overflow-wrap:anywhere]">{e.nomeSnapshot}</span>
                    <span className="block text-[12px] tabular-nums text-suave">
                      {e.codigo} · {etiquetas(e.quantas ?? 1)} {FORMATOS[e.formato as Formato]?.rotulo ?? ''} · emitida {quandoNaTela(e.impressaEm)}
                      {e.emitidaPorNome ? ` por ${e.emitidaPorNome}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold text-texto underline decoration-linha-forte underline-offset-4">Imprimir</span>
                </Link>
              </li>
            ))}
          </ul>
        </Painel>
      )}

      <Painel titulo="Lotes produzidos" subtitulo={p.busca ? 'Concluídos, com o código procurado' : 'Concluídos nos últimos 7 dias, o mais novo primeiro'} acessorio={<Contagem>{p.lotes.length}</Contagem>} semRespiro>
        {p.lotes.length === 0 ? (
          <Vazio titulo={p.busca ? 'Nenhum lote concluído com esse código.' : 'Nenhum lote concluído nos últimos 7 dias.'}>
            {p.busca ? 'Confira o código impresso no pote ou limpe a busca.' : 'A etiqueta do lote nasce quando ele é concluído na Produção.'}
          </Vazio>
        ) : (
          <ul className="divide-y divide-linha">
            {p.lotes.map((l) => (
              <li key={l.id}>
                <Link href={`${aqui}/lote/${l.id}`} className={LINHA}>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-texto [overflow-wrap:anywhere]">{l.nome}</span>
                    <span className="block text-[12px] tabular-nums text-suave">
                      lote {l.codigo} · {l.quanto} · {l.conservacao ? CONSERVACOES[l.conservacao].toLowerCase() : 'conservação não informada'} · concluído {l.concluidaEm ? quandoNaTela(l.concluidaEm) : 'sem data'}
                      {l.quemFez ? ` · fez ${l.quemFez}` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center gap-2 text-[12px] text-suave">
                    <SeloDaValidade situacao={l.situacao} />
                    {emissoes(l.emissoes, l.vencido)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Painel>

      <Painel titulo="Embalagens abertas" subtitulo="Abertas nos últimos 7 dias: a validade conta da abertura" acessorio={<Contagem>{p.aberturas.length}</Contagem>} semRespiro>
        {p.aberturas.length === 0 ? (
          <Vazio titulo="Nenhuma embalagem aberta registrada nos últimos 7 dias.">{podeAbrir ? 'Ao abrir uma embalagem, registre aqui: a hora entra sozinha e a etiqueta sai com a validade.' : 'Quem abre a embalagem na cozinha registra a abertura.'}</Vazio>
        ) : (
          <ul className="divide-y divide-linha">
            {p.aberturas.map((a) => (
              <li key={a.id}>
                <Link href={`${aqui}/aberta/${a.id}`} className={LINHA}>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-texto [overflow-wrap:anywhere]">{a.nome}</span>
                    <span className="block text-[12px] tabular-nums text-suave">
                      aberta {quandoNaTela(a.abertoEm)} por {a.abertoPor} · {CONSERVACOES[a.conservacao].toLowerCase()} · {a.lote ? `lote ${a.lote}` : 'lote não informado'}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center gap-2 text-[12px] text-suave">
                    <SeloDaValidade situacao={a.situacao} />
                    {emissoes(a.emissoes, a.vencido)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Painel>
    </div>
  );
}
