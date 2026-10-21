/**
 * Concluir o lote (3.1): a tela que o cozinheiro usa na bancada. Se os insumos ainda não saíram pela requisição, ela diz
 * o que falta e para onde ir (entregar ou encerrar o resto); com tudo entregue, o formulário: quanto saiu de verdade, o
 * motivo quando a diferença passa de 10%, a conservação que dá a validade e, para quem vê custos, o custo ao vivo.
 */

import Link from 'next/link';
import type { LoteDaLoja } from '@/lib/erp/producao';
import { fechadoNaData, type AvisoDePeriodos } from '@/lib/erp/periodo-fechado-campos';
import { fraseDoQueFalta } from '@/lib/erp/producao-campos';
import { fraseDoLoteComOutro } from '@/lib/erp/producao-equipe-campos';
import { COR } from '@/lib/erp/modulos';
import { aceitas, CONSERVACOES, formatarValidade } from '@/lib/erp/validade';
import { formatarFracao, formatarQuantidade, UNIDADES } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { Voltar } from '../cadastro/partes';
import type { AcaoDeEstoque } from '../estoque/estado';
import { FormConcluir, type ConservacaoParaEscolher } from './form-concluir';

export function TelaConcluir({
  d,
  base,
  contexto,
  acao,
  hrefRequisicao,
  periodos,
  bloqueio,
  gerencia = false,
  voltar,
}: {
  d: LoteDaLoja;
  base: string;
  contexto?: string;
  acao: AcaoDeEstoque;
  hrefRequisicao: string | null;
  periodos: AvisoDePeriodos;
  bloqueio: string | null;
  /** 3.3: a gerência conclui o lote de qualquer pessoa; a cozinha, só o próprio (ou o que ninguém pegou). */
  gerencia?: boolean;
  /** 3.3: veio da tela da cozinha: volta para ela depois de concluir. */
  voltar?: 'tarefas';
}) {
  const o = d.ordem;
  // A conclusão entra no estoque com a data de hoje: período de hoje fechado no DRE, não dá (o servidor confere de novo).
  const fechadoHoje = fechadoNaData(periodos.fechados, d.hoje)?.nome ?? null;
  const aqui = `${base}/${d.loja.id}/${o.id}`;
  const tarefas = `${base}/tarefas/${d.loja.id}`;
  // 3.3: o lote que está com outra pessoa só ela ou a gerência conclui (o servidor confere de novo).
  const comOutro = d.responsavel && !d.responsavel.comigo && !gerencia ? fraseDoLoteComOutro(d.responsavel.nome, d.responsavel.desde, d.hoje, 'concluir') : null;
  const falta = d.requisicao?.status === 'ATENDIDA' ? null : d.requisicao ? fraseDoQueFalta(d.itensDoLote.map((i) => ({ nome: i.nome, unidade: i.unidade, faltaMilesimos: i.faltaMilesimos })), d.requisicao.numero) : 'Este lote não tem a requisição dos insumos. Cancele e planeje de novo.';
  const conservacoes: ConservacaoParaEscolher[] = d.validadesAgora
    ? aceitas(d.validadesAgora).map((a) => ({ chave: a.conservacao, rotulo: CONSERVACOES[a.conservacao], minutos: a.minutos, duracao: formatarValidade(a.minutos), principal: a.principal }))
    : [];
  const custo = d.custo ? { totalCentavos: d.custo.totalCentavos, semPreco: d.custo.semPreco, previstoTexto: d.custo.previstoPorUnidade ? `${formatarFracao(d.custo.previstoPorUnidade)}/${UNIDADES[o.unidade].sigla}` : null } : null;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <TrilhaDaPagina itens={[{ rotulo: d.loja.nome, href: `${base}/${d.loja.id}` }, { rotulo: `Lote ${o.codigoLote}`, href: aqui }, { rotulo: 'Concluir' }]} />
      {voltar === 'tarefas' ? <Voltar href={tarefas}>Voltar para as tarefas</Voltar> : <Voltar href={aqui}>Voltar para o lote</Voltar>}
      <PageHeader icone="producao" cor={COR.producao} titulo={`Concluir o lote ${o.codigoLote}`} subtitulo={[contexto, o.fichaNome, `planejado ${formatarQuantidade(o.planejadoMilesimos, o.unidade)}`].filter(Boolean).join(' · ')} />
      {d.responsavel && !comOutro && <p className="text-[14px] text-suave">{d.responsavel.comigo ? 'Este lote está com você.' : `Este lote está com ${d.responsavel.nome}: ele fica como quem fez, e você como quem concluiu.`}</p>}
      {comOutro ? (
        <Aviso tom="alerta" titulo={comOutro} />
      ) : falta ? (
        <Aviso tom="alerta" titulo={falta}>
          {hrefRequisicao && d.requisicao ? (
            <Link href={`${hrefRequisicao}/${d.requisicao.id}`} className={LINK_DE_TEXTO}>
              Abrir a requisição
            </Link>
          ) : (
            'Peça ao estoque para entregar.'
          )}
        </Aviso>
      ) : (
        <FormConcluir acao={acao} voltar={voltar} versao={o.versao} planejadoMilesimos={o.planejadoMilesimos} unidade={o.unidade} conservacoes={conservacoes} custo={custo} recarregar={aqui} fechadoHoje={fechadoHoje} hrefPeriodos={periodos.href} bloqueio={bloqueio ?? (d.aberto ? null : 'O estoque ainda não foi aberto.')} />
      )}
    </div>
  );
}
