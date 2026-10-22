/**
 * Classificar insumos (I.1a), a MESMA tela para o nível 1 e para a pessoa do parceiro. Três coisas, na ordem em que se usam:
 *  1. a CLASSIFICAÇÃO ASSISTIDA dos insumos que ainda não têm categoria: a prévia (sem gravar nada), aplicar (uma vez só, com o
 *     registro antes/depois de cada um) e desfazer um lote (só o que ninguém mexeu depois). Aplicar e desfazer são de quem tem
 *     `insumos.categorias`;
 *  2. a FILA DE REVISÃO: o que ficou sem categoria ou em "Outros / a classificar", com o motivo, a sugestão do nome e o valor em
 *     estoque, e a edição em lote (`insumos.editar`);
 *  3. os NOMES PARECIDOS (caixa, acento): só leitura, a casa junta ou renomeia.
 * Nada aqui mexe em preço, unidade, embalagem, saldo, ficha ou movimento; o CMV de período fechado não lê categoria.
 */

import Link from 'next/link';
import { COR } from '@/lib/erp/modulos';
import type { FilaDeRevisao, GrupoDeNomesParecidos, LoteDeClassificacao, PreviaDaClassificacao, ResumoDoQueFalta } from '@/lib/erp/classificar';
import type { OpcaoDeCategoria } from '@/lib/erp/categorias';
import { PageHeader } from '../../ui/cabecalho';
import { BotaoEnviar } from '../../ui/botoes';
import { Aviso, Painel, Selo } from '../../ui/superficies';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Paginacao } from '../../ui/paginacao';
import type { AcaoDeCadastro } from '../cadastro/estado';
import { inteiroDaUrl } from './executar-categorias';
import { AvisoDaClassificacao } from './aviso-classificar';
import { FormDaFila } from './form-classificar';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** A frase do `?feito=` da classificação. Só as chaves do mapa; os números são inteiros pequenos que a tela apenas mostra. */
function fraseDoFeito(q: { feito?: string; n?: string; outros?: string; mantidos?: string; iguais?: string }): { titulo: string; tom: 'ok' | 'alerta' } | null {
  const n = inteiroDaUrl(q.n);
  switch (q.feito) {
    case 'aplicado':
      return {
        tom: 'ok',
        titulo:
          n === null
            ? 'Classificação aplicada.'
            : `Classificação aplicada: ${plural(n, 'insumo recebeu categoria', 'insumos receberam categoria')}${inteiroDaUrl(q.outros) ? `, ${inteiroDaUrl(q.outros)} em Outros / a classificar para revisar` : ''}. Cada um tem o antes e o depois no histórico.`,
      };
    case 'nada':
      return { tom: 'ok', titulo: 'Nada a classificar: todos os insumos já têm categoria. Nada foi mudado.' };
    case 'revertido':
      return {
        tom: 'ok',
        titulo: `Lote desfeito: ${plural(n ?? 0, 'insumo voltou', 'insumos voltaram')} a ficar sem categoria${inteiroDaUrl(q.mantidos) ? `; ${plural(inteiroDaUrl(q.mantidos)!, 'foi mexido', 'foram mexidos')} por uma pessoa depois e ficou como está` : ''}.`,
      };
    case 'sem-lote':
      return { tom: 'alerta', titulo: 'Esse lote não existe mais ou já foi desfeito. Nada foi mudado.' };
    case 'recusado':
      return { tom: 'alerta', titulo: 'Só quem gere as categorias aplica ou desfaz a classificação assistida. Nada foi mudado.' };
    case 'lote':
      return {
        tom: 'ok',
        titulo: `${plural(n ?? 0, 'insumo classificado', 'insumos classificados')}${inteiroDaUrl(q.iguais) ? `; ${plural(inteiroDaUrl(q.iguais)!, 'já estava', 'já estavam')} nessa categoria` : ''}. Cada um tem o antes e o depois no histórico.`,
      };
    default:
      return null;
  }
}

const QUANDO = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

export function TelaClassificar({
  contexto,
  base,
  podeGerir,
  bloqueio,
  query,
  faltam,
  previa,
  lotes,
  fila,
  parecidos,
  categorias,
  acaoAplicar,
  acaoReverter,
  acaoEmLote,
  hrefDaPagina,
}: {
  contexto?: string;
  /** /erp/insumos ou /rodolfo/erp/<slug>/insumos */
  base: string;
  /** `insumos.categorias`: aplica e desfaz a classificação assistida. */
  podeGerir: boolean;
  bloqueio: string | null;
  query: { feito?: string; n?: string; outros?: string; mantidos?: string; iguais?: string };
  faltam: ResumoDoQueFalta;
  previa: PreviaDaClassificacao;
  lotes: LoteDeClassificacao[];
  fila: FilaDeRevisao;
  parecidos: GrupoDeNomesParecidos[];
  categorias: readonly OpcaoDeCategoria[];
  acaoAplicar: () => Promise<void>;
  acaoReverter: (form: FormData) => Promise<void>;
  acaoEmLote: AcaoDeCadastro;
  hrefDaPagina: (pagina: number) => string;
}) {
  const feito = fraseDoFeito(query);
  const ajustavel = podeGerir && !bloqueio;
  const de = (fila.pagina - 1) * 100 + 1;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        icone="classificar"
        cor={COR.insumo}
        titulo="Classificar insumos"
        subtitulo={`${contexto ? `${contexto} · ` : ''}${faltam.total === 0 ? 'todos os insumos ativos têm categoria' : `${plural(faltam.total, 'insumo ainda sem categoria definitiva', 'insumos ainda sem categoria definitiva')}`}`}
      />
      {feito && <Aviso tom={feito.tom} titulo={feito.titulo} />}
      <AvisoDaClassificacao resumo={faltam} />

      <Painel
        titulo="Classificação assistida"
        subtitulo="Dá uma categoria a cada insumo que ainda não tem, pelo nome. Nada mais muda: preço, unidade, embalagem, saldo e fichas ficam como estão."
      >
        {previa.total === 0 ? (
          <p className="text-sm text-suave">Todos os insumos já têm categoria. Não há nada para a classificação assistida fazer.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-suave">
              <span className="font-semibold text-texto">Prévia, sem gravar nada:</span> {plural(previa.total, 'insumo está', 'insumos estão')} sem categoria. Se você aplicar agora,
              {previa.paraRevisar > 0
                ? ` ${plural(previa.total - previa.paraRevisar, 'vai', 'vão')} para a categoria certa e ${plural(previa.paraRevisar, 'fica', 'ficam')} em Outros / a classificar, com o motivo, para você revisar.`
                : ' todos vão para a categoria que o nome indica.'}
            </p>
            <ul className="flex flex-wrap gap-2" aria-label="Quantos vão para cada categoria">
              {previa.porCategoria.map((c) => (
                <li key={c.chave ?? c.nome} className="rounded-[7px] border border-linha px-3 py-1.5 text-[13px]">
                  <span className="text-texto">{c.nome}</span> <span className="tabular-nums text-suave">· {c.n}</span>
                </li>
              ))}
            </ul>
            <details className="rounded-[10px] border border-linha">
              <summary className="flex min-h-11 cursor-pointer items-center px-4 text-[13px] font-medium text-texto">
                Ver os {previa.total} insumos e para onde cada um vai
              </summary>
              <ul role="list" className="max-h-96 divide-y divide-linha overflow-auto border-t border-linha">
                {previa.linhas.map((l) => (
                  <li key={l.id} className="px-4 py-2 text-[13px]">
                    <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-medium text-texto">{l.nome}{!l.ativo && <span className="text-suave"> (desativado)</span>}</span>
                      <span className={l.chave === 'OUTROS' ? 'text-atencao' : 'text-suave'}>→ {l.categoria}</span>
                    </p>
                    {l.motivo && <p className="text-[12px] text-suave">{l.motivo}</p>}
                  </li>
                ))}
              </ul>
            </details>
            {ajustavel ? (
              <form action={acaoAplicar} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <BotaoEnviar pendente="Classificando…" className="sm:min-w-64">
                  Classificar os {previa.total} insumos
                </BotaoEnviar>
                <p className="text-[12px] text-suave">Uma vez só: depois não sobra nenhum sem categoria. Dá para desfazer o lote (só o que ninguém mexeu).</p>
              </form>
            ) : (
              <p className="text-[13px] text-suave">{bloqueio ?? 'Aplicar a classificação é de quem gere as categorias (o dono da rede).'}</p>
            )}
          </div>
        )}

        {lotes.length > 0 && (
          <div className="mt-5 border-t border-linha pt-4">
            <h3 className="text-[13px] font-semibold text-texto">Lotes que ainda podem ser desfeitos</h3>
            <ul className="mt-2 divide-y divide-linha">
              {lotes.map((l) => (
                <li key={l.lote} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[13px]">
                    <span className="font-medium text-texto">{l.lote}</span>
                    <span className="text-suave">
                      {' '}
                      · {plural(l.nInsumos, 'insumo intocado', 'insumos intocados')}
                      {l.em ? ` · ${QUANDO.format(new Date(l.em)).replace(',', '')}` : ''}
                    </span>
                  </p>
                  {ajustavel && (
                    <form action={acaoReverter}>
                      <input type="hidden" name="lote" value={l.lote} />
                      <BotaoEnviar variante="secundario" pendente="Desfazendo…" className="sm:min-h-10">
                        Desfazer este lote
                      </BotaoEnviar>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-suave">Desfazer devolve a “sem categoria” só os que ainda são deste lote. O que uma pessoa já classificou depois fica como está.</p>
          </div>
        )}
      </Painel>

      <Painel
        titulo="Fila de revisão"
        subtitulo="Sem categoria ou em Outros / a classificar. Marque vários e classifique de uma vez."
        acessorio={fila.total > 0 ? <span className="text-[12px] tabular-nums text-suave">{plural(fila.total, 'insumo', 'insumos')}</span> : undefined}
        semRespiro
      >
        {fila.total === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-suave sm:px-5">A fila está vazia: todos os insumos ativos têm uma categoria definida.</p>
        ) : (
          <>
            <FormDaFila acao={acaoEmLote} linhas={fila.linhas} categorias={categorias} base={base} bloqueio={bloqueio} />
            <Paginacao
              de={de}
              ate={de + fila.linhas.length - 1}
              total={fila.total}
              singular="insumo"
              plural="insumos"
              anterior={fila.pagina > 1 ? hrefDaPagina(fila.pagina - 1) : null}
              proxima={fila.pagina < fila.paginas ? hrefDaPagina(fila.pagina + 1) : null}
            />
          </>
        )}
      </Painel>

      {parecidos.length > 0 && (
        <Painel
          titulo="Nomes parecidos"
          subtitulo="O sistema passou a tratar maiúscula, acento e espaço como o mesmo nome. Estes já existiam e não foram mexidos: junte ou renomeie."
        >
          <ul className="space-y-3">
            {parecidos.map((g) => (
              <li key={g.itens.map((i) => i.id).join('-')} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                {g.itens.map((i) => (
                  <Link key={i.id} href={`${base}/${i.id}`} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center sm:min-h-0 [@media(pointer:coarse)]:min-h-11`}>
                    {i.nome}
                    {i.ativo ? '' : ' (desativado)'}
                  </Link>
                ))}
              </li>
            ))}
          </ul>
        </Painel>
      )}
      <p className="text-[12px] text-suave">
        <Link href={`${base}/categorias`} className={LINK_DE_TEXTO}>
          Ver as categorias
        </Link>
        {' · '}
        <Link href={base} className={LINK_DE_TEXTO}>
          Voltar aos insumos
        </Link>
      </p>
    </div>
  );
}
