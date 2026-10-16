/**
 * Entregar uma requisição (1.8): a tela do estoquista, celular primeiro. O
 * pedido em cima (setor, para quando, quem pediu, observação), item a item o
 * que sai agora com o livro ao lado, e o rodapé fixo "Entregar e dar baixa".
 */

import type { RequisicaoDaLoja } from '@/lib/erp/requisicao';
import { numeroDaRequisicao, rotuloDoSetor, textoDoParaDia } from '@/lib/erp/requisicao-campos';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { Aviso } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { Voltar } from '../cadastro/partes';
import type { AcaoDeEstoque } from '../estoque/estado';
import { FormEntrega } from './form-entrega';
import { SeloDoAtraso } from './partes';

export function TelaEntregar({ d, base, contexto, acao }: { d: RequisicaoDaLoja; base: string; contexto?: string; acao: AcaoDeEstoque }) {
  const r = d.requisicao;
  const daLoja = `${base}/${d.loja.id}`;
  const quadro = `${daLoja}/requisicoes`;
  const aqui = `${quadro}/${r.id}`;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <TrilhaDaPagina itens={[{ rotulo: d.loja.nome, href: daLoja }, { rotulo: 'Requisições', href: quadro }, { rotulo: numeroDaRequisicao(r.numero), href: aqui }, { rotulo: 'Entregar' }]} />
      <Voltar href={aqui}>Voltar para a requisição</Voltar>
      <PageHeader
        icone="estoque"
        cor={COR.estoque}
        titulo={`Entregar ${numeroDaRequisicao(r.numero)}`}
        subtitulo={[contexto, rotuloDoSetor(r.setor), textoDoParaDia(r.paraDia, d.hoje), `pedida por ${r.pedidaPorNome ?? '—'}`].filter(Boolean).join(' · ')}
        acao={<SeloDoAtraso dias={d.atrasoDias} />}
      />
      {r.observacao && <Aviso tom="neutro" titulo="Observação de quem pediu:">{r.observacao}</Aviso>}
      <p className="text-sm text-suave">Confira e diga quanto sai de cada um agora. A baixa no livro acontece ao entregar, pelo custo de hoje. Saiu menos? O resto fica pendente, ou encerre.</p>
      <FormEntrega acao={acao} versao={r.versao} itens={d.itens} recarregar={`${aqui}/atender`} />
    </div>
  );
}
