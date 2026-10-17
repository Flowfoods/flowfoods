/**
 * Montagem das telas de compras comuns ao nível 1 e à pessoa do parceiro:
 * lançar/editar nota e novo/editar fornecedor. As rotas só resolvem contexto
 * e permissão e passam dados e actions prontos.
 */

import type { FormularioDeNota, FornecedorDetalhado, NotaDetalhada } from '@/lib/erp/compras';
import { valoresDaNota } from '@/lib/erp/compras';
import { formatarDocumento, hojeNoRio } from '@/lib/erp/compra-campos';
import { COR } from '@/lib/erp/modulos';
import type { AvisoDePeriodos } from '@/lib/erp/periodo-fechado-campos';
import { PageHeader } from '../../ui/cabecalho';
import { TrilhaDaPagina } from '../../shell/trilha';
import { Aviso } from '../../ui/superficies';
import { Voltar } from '../cadastro/partes';
import type { AcaoDeNota } from './estado';
import { FormFornecedor } from './form-fornecedor';
import { FormNota, type ValoresDaNota } from './form-nota';

export function TelaFormNota({
  nota,
  base,
  contexto,
  opcoes,
  lojaSugerida,
  acao,
  bloqueio,
  periodos,
  novoFornecedor,
  novoInsumo,
}: {
  /** Ausente = lançar. */
  nota?: NotaDetalhada;
  base: string;
  contexto: string;
  opcoes: FormularioDeNota;
  /** A loja da visão do topo, quando é uma loja. */
  lojaSugerida?: string;
  acao: AcaoDeNota;
  bloqueio: string | null;
  periodos: AvisoDePeriodos;
  novoFornecedor?: string;
  novoInsumo?: string;
}) {
  const hoje = hojeNoRio();
  const inicial: ValoresDaNota = nota
    ? valoresDaNota(nota)
    : {
        lojaId: lojaSugerida && opcoes.lojas.some((l) => l.id === lojaSugerida) ? lojaSugerida : opcoes.lojas.length === 1 ? opcoes.lojas[0].id : '',
        fornecedorId: '',
        numero: '',
        serie: '',
        data: hoje,
        frete: '',
        total: '',
        itens: [],
      };
  const volta = nota ? `${base}/${nota.id}` : base;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <TrilhaDaPagina itens={nota ? [{ rotulo: nota.rotulo, href: volta }, { rotulo: 'Editar' }] : [{ rotulo: 'Lançar nota' }]} />
      <Voltar href={volta}>{nota ? 'Voltar para a nota' : 'Voltar para as notas'}</Voltar>
      <PageHeader
        icone="compras"
        cor={COR.compras}
        titulo={nota ? 'Editar nota' : 'Lançar nota'}
        subtitulo={nota ? `${contexto} · ${nota.rotulo} · ${nota.fornecedorNome}` : `${contexto} · o custo dos insumos passa a ser o desta compra`}
      />
      {opcoes.fornecedores.length === 0 && (
        <Aviso tom="alerta" titulo="Nenhum fornecedor cadastrado.">
          {novoFornecedor ? 'Cadastre quem vende antes de lançar a nota.' : 'Peça a quem cuida das compras para cadastrar quem vende; depois a nota entra.'}
        </Aviso>
      )}
      <FormNota
        acao={acao}
        modo={nota ? 'editar' : 'lancar'}
        base={base}
        aqui={nota ? `${base}/${nota.id}/editar` : `${base}/nova`}
        cancelar={volta}
        opcoes={opcoes}
        inicial={inicial}
        versao={nota?.versao}
        hoje={hoje}
        bloqueio={bloqueio}
        periodos={periodos}
        novoFornecedor={novoFornecedor}
        novoInsumo={novoInsumo}
      />
    </div>
  );
}

export function TelaFormFornecedor({
  fornecedor,
  base,
  contexto,
  acao,
  bloqueio,
}: {
  fornecedor?: FornecedorDetalhado;
  base: string;
  contexto: string;
  acao: AcaoDeNota;
  bloqueio: string | null;
}) {
  const volta = fornecedor ? `${base}/${fornecedor.id}` : base;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <TrilhaDaPagina itens={fornecedor ? [{ rotulo: fornecedor.nome, href: volta }, { rotulo: 'Editar' }] : [{ rotulo: 'Novo fornecedor' }]} />
      <Voltar href={volta}>{fornecedor ? `Voltar para ${fornecedor.nome}` : 'Voltar para os fornecedores'}</Voltar>
      <PageHeader
        icone="fornecedor"
        cor={COR.compras}
        titulo={fornecedor ? 'Editar fornecedor' : 'Novo fornecedor'}
        subtitulo={fornecedor ? `${contexto} · ${fornecedor.nome}` : `${contexto} · cadastro da rede, vale para todas as lojas`}
      />
      <FormFornecedor
        acao={acao}
        modo={fornecedor ? 'editar' : 'criar'}
        base={base}
        aqui={fornecedor ? `${base}/${fornecedor.id}/editar` : `${base}/novo`}
        cancelar={volta}
        inicial={fornecedor ? { nome: fornecedor.nome, documento: formatarDocumento(fornecedor.documento) ?? '', contato: fornecedor.contato ?? '' } : undefined}
        versao={fornecedor?.versao}
        bloqueio={bloqueio}
      />
    </div>
  );
}
