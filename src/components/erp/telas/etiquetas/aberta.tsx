// Scanner avoid-ai-design, SD4d (P2) aceito: "Leite integral · aberta 23/10/2026 às 14:05 por Ana" é a linha de apoio do cabeçalho, no padrão "A · B" das telas da 1.1–3.3.
/**
 * Uma embalagem aberta (3.4): o que foi aberto, quando (a hora é a do registro, automática), por quem, o lote do fornecedor e a
 * validade EFETIVA com a regra em palavras (o prazo depois de aberto ou o vencimento do lote, o que vier antes; sem prazo, sem
 * data). Abaixo, a emissão da etiqueta com a prévia e as já emitidas. A abertura não muda: errou, registra outra.
 */

import type { AberturaParaEtiqueta } from '@/lib/erp/etiquetas';
import { diaPorExtenso, fraseDaValidadeDaAbertura, quandoNaTela } from '@/lib/erp/etiqueta-campos';
import { COR } from '@/lib/erp/modulos';
import { CONSERVACOES, formatarValidade } from '@/lib/erp/validade';
import { PageHeader } from '../../ui/cabecalho';
import { Aviso, Linha, Painel } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { Voltar } from '../cadastro/partes';
import type { AcaoDeEstoque } from '../estoque/estado';
import { serializar } from './conteudo';
import { FormEmitir } from './form-emitir';
import { ListaDeEmissoes, SeloDaValidade } from './partes';

export function TelaEmbalagemAberta({ d, base, contexto, feito, acao, envio, bloqueio }: { d: AberturaParaEtiqueta; base: string; contexto?: string; feito?: string; acao: AcaoDeEstoque; envio: string; bloqueio: string | null }) {
  const a = d.abertura;
  const daLoja = `${base}/${d.loja.id}`;
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <TrilhaDaPagina itens={[{ rotulo: d.loja.nome, href: daLoja }, { rotulo: a.nome }]} />
      <Voltar href={daLoja}>Voltar para as etiquetas</Voltar>
      <PageHeader icone="insumo" cor={COR.etiquetas} titulo={a.nome} subtitulo={[contexto, `aberta ${quandoNaTela(a.abertoEm)} por ${a.abertoPor}`].filter(Boolean).join(' · ')}>
        <div className="flex flex-wrap items-center gap-2">
          <SeloDaValidade situacao={a.situacao} />
        </div>
      </PageHeader>
      {feito && <Aviso tom="ok" titulo={feito} />}
      <Aviso tom={a.regra === 'PRAZO_NAO_INFORMADO' ? 'alerta' : 'neutro'} titulo={fraseDaValidadeDaAbertura({ regra: a.regra, validadeEm: a.validadeEm, vencimentoLote: a.vencimentoLote, prazoMin: a.prazoMin, conservacao: a.conservacao })}>
        {a.regra === 'PRAZO_NAO_INFORMADO' ? 'Peça a quem cuida dos insumos para informar quanto ele dura depois de aberto nessa conservação.' : undefined}
      </Aviso>
      <Painel titulo="A abertura" subtitulo="Registrada uma vez, com a hora de quando foi registrada">
        <dl className="space-y-2 text-sm tabular-nums">
          <Linha rotulo="Aberta em">{quandoNaTela(a.abertoEm)}</Linha>
          <Linha rotulo="Por">{a.abertoPor}</Linha>
          <Linha rotulo="Onde vai ficar">{CONSERVACOES[a.conservacao]}</Linha>
          <Linha rotulo="Prazo depois de aberto">{a.prazoMin ? formatarValidade(a.prazoMin) : 'não informado'}</Linha>
          <Linha rotulo="Lote do fornecedor">{a.codigoLote ?? 'não informado'}</Linha>
          <Linha rotulo="Vencimento do lote">{a.vencimentoLote ? diaPorExtenso(a.vencimentoLote) : 'não informado'}</Linha>
          {a.marca && <Linha rotulo="Marca">{a.marca}</Linha>}
          {a.quanto && <Linha rotulo="Quanto foi aberto">{a.quanto}</Linha>}
          <Linha rotulo="Usar até">{a.validadeEm ? (a.regra === 'VENCIMENTO_DO_LOTE' && a.vencimentoLote ? diaPorExtenso(a.vencimentoLote) : quandoNaTela(a.validadeEm)) : 'sem data'}</Linha>
        </dl>
      </Painel>
      <FormEmitir acao={acao} envioInicial={envio} previa={serializar(d.previa)} origem="ABERTA" unidade={a.unidade} recarregar={`${daLoja}/aberta/${a.id}`} bloqueio={bloqueio} />
      <ListaDeEmissoes emissoes={d.emissoes} base={daLoja} />
    </div>
  );
}
