/**
 * Montagem das telas de insumo comuns ao nível 1 e à pessoa do parceiro:
 * cabeçalho da lista (com "Novo insumo"), formulário de novo/editar e a tela
 * de uma embalagem. As rotas só resolvem contexto e permissão e passam dados
 * e actions prontos.
 */

import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { InsumoDetalhado } from '@/lib/erp/insumos';
import type { OpcaoDeCategoria } from '@/lib/erp/categorias';
import { TIPOS } from '@/lib/erp/insumo-campos';
import { rotuloDaVolta } from '@/lib/erp/volta';
import { COR } from '@/lib/erp/modulos';
import { UNIDADES, dinheiroParaCampo, quantidadeParaCampo } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { Painel } from '../../ui/superficies';
import type { AcaoDeCadastro } from '../cadastro/estado';
import { BotaoOuMotivo, Voltar } from '../cadastro/partes';
import { FormEmbalagem } from './form-embalagem';
import { FormInsumo, type ValoresDoInsumo } from './form-insumo';
import { FormSituacao } from '../cadastro/form-situacao';
import { TrilhaDaPagina } from '../../shell/trilha';

export function CabecalhoDaLista({
  subtitulo,
  novoHref,
  bloqueio,
  children,
}: {
  subtitulo: string;
  /** Só para quem pode cadastrar. */
  novoHref?: string;
  bloqueio: string | null;
  /** Busca e filtros. */
  children: ReactNode;
}) {
  return (
    <PageHeader
      icone="insumo"
      cor={COR.insumo}
      titulo="Insumos"
      subtitulo={subtitulo}
      acao={
        novoHref ? (
          <BotaoOuMotivo href={novoHref} bloqueio={bloqueio} variante="primario">
            <Plus size={16} aria-hidden />
            Novo insumo
          </BotaoOuMotivo>
        ) : undefined
      }
    >
      {children}
    </PageHeader>
  );
}

function embalagemParaCampo(e: { conteudoMilesimos: number; precoEmbalagemCentavos: number; taxaEntregaCentavos: number }, unidade: keyof typeof UNIDADES) {
  const q = quantidadeParaCampo(e.conteudoMilesimos, unidade);
  return {
    conteudo: q.texto,
    escala: q.escala,
    preco: e.precoEmbalagemCentavos > 0 ? dinheiroParaCampo(e.precoEmbalagemCentavos) : '',
    semPreco: e.precoEmbalagemCentavos === 0,
    frete: e.taxaEntregaCentavos > 0 ? dinheiroParaCampo(e.taxaEntregaCentavos) : '',
  };
}

export function TelaFormInsumo({
  insumo,
  base,
  contexto,
  acao,
  bloqueio,
  nomeSugerido,
  lembrado,
  categorias,
  envio,
  volta,
  de = '',
  origemLista = false,
}: {
  /** L.1: a lista como estava (filtros, página e tamanho, já filtrados) e se a pessoa veio da caneta da linha. */
  de?: string;
  origemLista?: boolean;
  /** Ausente = novo. */
  insumo?: InsumoDetalhado;
  /** I.1a: as categorias que a casa oferece (as ativas, mais a que o insumo já tem). */
  categorias: readonly OpcaoDeCategoria[];
  /** I.1a: a chave deste envio, sorteada no servidor a cada abertura do formulário novo. */
  envio?: string;
  /** Novo vindo da importação de fichas ("Cadastrar “Picles”"): o nome já vem escrito. */
  nomeSugerido?: string;
  /** "Cadastrar outro insumo": tipo e unidade do último, vindos da URL (só valores da lista valem). */
  lembrado?: { tipo?: string; unidade?: string };
  /** I.1b: o caminho de volta JÁ VALIDADO (vindo de "Insumo que falta: cadastrar" numa nota ou ficha); só no cadastro novo. */
  volta?: string | null;
  base: string;
  contexto: string;
  acao: AcaoDeCadastro;
  bloqueio: string | null;
}) {
  const inicial: ValoresDoInsumo | undefined = insumo ? {
    nome: insumo.nome,
    tipo: insumo.tipo,
    unidade: insumo.unidade,
    categoriaId: insumo.categoria?.id ?? '',
    conservacao: insumo.conservacao,
    marcaReferencia: insumo.marcaReferencia ?? '',
    validades: insumo.validades,
    ...embalagemParaCampo(insumo, insumo.unidade),
  } : undefined;
  const aqui = insumo ? `${base}/${insumo.id}` : base;
  // L.1: da caneta da lista, "voltar" e "cancelar" levam à lista como estava; do detalhe, ao detalhe (que também guarda a lista).
  const daLista = `${base}${de ? `?${de}` : ''}`;
  const doDetalhe = `${aqui}${insumo && de ? `?de=${encodeURIComponent(de)}` : ''}`;
  const destinoDoCancelar = insumo ? (origemLista ? daLista : doDetalhe) : daLista;
  const paraVoltar = !insumo && volta ? volta : destinoDoCancelar;
  // "Recarregar" (depois de um conflito) não pode perder de onde a pessoa veio.
  const recarregarComEstado = (() => {
    const q = new URLSearchParams();
    if (de) q.set('de', de);
    if (insumo && origemLista) q.set('origem', 'lista');
    return q.size ? `?${q.toString()}` : '';
  })();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <TrilhaDaPagina itens={insumo ? [{ rotulo: insumo.nome, href: aqui }, { rotulo: 'Editar' }] : [{ rotulo: 'Novo insumo' }]} />
      <Voltar href={paraVoltar} recarregar={!insumo && !!volta}>{insumo ? (origemLista ? 'Voltar para a lista' : `Voltar para ${insumo.nome}`) : volta ? `Voltar para ${rotuloDaVolta(volta)}` : 'Voltar para a lista'}</Voltar>
      <PageHeader
        icone="insumo"
        cor={COR.insumo}
        titulo={insumo ? 'Editar insumo' : 'Novo insumo'}
        subtitulo={insumo ? `${contexto} · ${insumo.nome}` : volta ? `${contexto} · depois de salvar, você volta para ${rotuloDaVolta(volta)}` : `${contexto} · cadastro da rede, vale para todas as lojas`}
      />
      <FormInsumo
        acao={acao}
        modo={insumo ? 'editar' : 'criar'}
        base={base}
        aqui={`${insumo ? `${base}/${insumo.id}/editar` : `${base}/novo`}${recarregarComEstado}`}
        cancelar={destinoDoCancelar}
        volta={volta}
        de={de}
        origemLista={origemLista}
        aConfirmar={!!insumo?.conservacaoAConfirmar}
        inicial={inicial}
        nomeSugerido={nomeSugerido}
        lembrado={lembrado}
        versao={insumo?.versao}
        travaDaUnidade={insumo?.travaDaUnidade ?? null}
        bloqueio={bloqueio}
        categorias={categorias}
        envio={envio}
      />
    </div>
  );
}

export function TelaEmbalagem({
  insumo,
  varianteId,
  base,
  acaoSalvar,
  acaoSituacao,
  bloqueio,
}: {
  insumo: InsumoDetalhado;
  /** Ausente = nova. */
  varianteId?: string;
  base: string;
  acaoSalvar: AcaoDeCadastro;
  acaoSituacao?: AcaoDeCadastro;
  bloqueio: string | null;
}) {
  const v = varianteId ? insumo.variantes.find((x) => x.id === varianteId) : undefined;
  const volta = `${base}/${insumo.id}`;
  const u = UNIDADES[insumo.unidade];
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: insumo.nome, href: volta }, { rotulo: v ? v.nome : 'Nova embalagem' }]} />
      <Voltar href={volta}>Voltar para {insumo.nome}</Voltar>
      <PageHeader
        icone="insumo"
        cor={COR.insumo}
        titulo={v ? v.nome : 'Nova embalagem'}
        subtitulo={`${insumo.nome} · ${TIPOS[insumo.tipo]} · medido em ${u.nome.toLowerCase()}`}
      />
      <div className={`grid items-start gap-4 ${v ? 'lg:grid-cols-[minmax(0,1fr)_320px]' : ''}`}>
        <div className="min-w-0">
          <p className="mb-4 text-sm text-suave">
            Outra forma de comprar o mesmo insumo (caixa, fardo, outra marca). Quanto vem é sempre em {u.nome.toLowerCase()}
            {insumo.unidade === 'UN' ? '' : ` ou ${u.menor}`}, para dar para comparar o custo com a embalagem padrão.
          </p>
          <FormEmbalagem
            acao={acaoSalvar}
            unidade={insumo.unidade}
            insumoNome={insumo.nome}
            aqui={v ? `${volta}/embalagens/${v.id}` : `${volta}/embalagens/nova`}
            cancelar={volta}
            versao={v?.versao}
            inicial={v ? { nome: v.nome, codigoBarras: v.codigoBarras ?? '', ...embalagemParaCampo(v, insumo.unidade) } : undefined}
            bloqueio={bloqueio}
          />
        </div>
        {v && acaoSituacao && (
          <Painel titulo="Situação">
            {bloqueio ? (
              <p className="text-sm text-suave">{bloqueio}</p>
            ) : (
              <FormSituacao acao={acaoSituacao} ativo={v.ativo} oQue="embalagem" idBase="situacao-embalagem" />
            )}
          </Painel>
        )}
      </div>
    </div>
  );
}
