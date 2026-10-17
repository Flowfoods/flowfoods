/**
 * Concluir o lote (3.1): a tela que o cozinheiro usa na bancada. Se os insumos ainda não saíram pela requisição, ela diz
 * o que falta e para onde ir (entregar ou encerrar o resto); com tudo entregue, o formulário: quanto saiu de verdade, o
 * motivo quando a diferença passa de 10%, a conservação que dá a validade e, para quem vê custos, o custo ao vivo.
 */

import Link from 'next/link';
import type { LoteDaLoja } from '@/lib/erp/producao';
import { fraseDoQueFalta } from '@/lib/erp/producao-campos';
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

export function TelaConcluir({ d, base, contexto, acao, hrefRequisicao, bloqueio }: { d: LoteDaLoja; base: string; contexto?: string; acao: AcaoDeEstoque; hrefRequisicao: string | null; bloqueio: string | null }) {
  const o = d.ordem;
  const aqui = `${base}/${d.loja.id}/${o.id}`;
  const falta = d.requisicao?.status === 'ATENDIDA' ? null : d.requisicao ? fraseDoQueFalta(d.itensDoLote.map((i) => ({ nome: i.nome, unidade: i.unidade, faltaMilesimos: i.faltaMilesimos })), d.requisicao.numero) : 'Este lote não tem a requisição dos insumos. Cancele e planeje de novo.';
  const conservacoes: ConservacaoParaEscolher[] = d.validadesAgora
    ? aceitas(d.validadesAgora).map((a) => ({ chave: a.conservacao, rotulo: CONSERVACOES[a.conservacao], minutos: a.minutos, duracao: formatarValidade(a.minutos), principal: a.principal }))
    : [];
  const custo = d.custo ? { totalCentavos: d.custo.totalCentavos, semPreco: d.custo.semPreco, previstoTexto: d.custo.previstoPorUnidade ? `${formatarFracao(d.custo.previstoPorUnidade)}/${UNIDADES[o.unidade].sigla}` : null } : null;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <TrilhaDaPagina itens={[{ rotulo: d.loja.nome, href: `${base}/${d.loja.id}` }, { rotulo: `Lote ${o.codigoLote}`, href: aqui }, { rotulo: 'Concluir' }]} />
      <Voltar href={aqui}>Voltar para o lote</Voltar>
      <PageHeader icone="producao" cor={COR.producao} titulo={`Concluir o lote ${o.codigoLote}`} subtitulo={[contexto, o.fichaNome, `planejado ${formatarQuantidade(o.planejadoMilesimos, o.unidade)}`].filter(Boolean).join(' · ')} />
      {falta ? (
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
        <FormConcluir acao={acao} versao={o.versao} planejadoMilesimos={o.planejadoMilesimos} unidade={o.unidade} conservacoes={conservacoes} custo={custo} recarregar={aqui} bloqueio={bloqueio ?? (d.aberto ? null : 'O estoque ainda não foi aberto.')} />
      )}
    </div>
  );
}
