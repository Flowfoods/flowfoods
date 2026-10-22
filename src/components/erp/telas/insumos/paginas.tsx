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
import { COR } from '@/lib/erp/modulos';
import { UNIDADES, dinheiroParaCampo, quantidadeParaCampo } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { Painel } from '../../ui/superficies';
import type { AcaoDeCadastro } from '../cadastro/estado';
import { BotaoOuMotivo, Voltar } from '../cadastro/partes';
import { FormEmbalagem } from './form-embalagem';
import { FormInsumo, INSUMO_NOVO, type ValoresDoInsumo } from './form-insumo';
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
  categorias,
  envio,
}: {
  /** Ausente = novo. */
  insumo?: InsumoDetalhado;
  /** I.1a: as categorias que a casa oferece (as ativas, mais a que o insumo já tem). */
  categorias: readonly OpcaoDeCategoria[];
  /** I.1a: a chave deste envio, sorteada no servidor a cada abertura do formulário novo. */
  envio?: string;
  /** Novo vindo da importação de fichas ("Cadastrar “Picles”"): o nome já vem escrito. */
  nomeSugerido?: string;
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
    validades: insumo.validades,
    ...embalagemParaCampo(insumo, insumo.unidade),
  } : nomeSugerido ? { ...INSUMO_NOVO, nome: nomeSugerido.slice(0, 80) } : undefined;
  const volta = insumo ? `${base}/${insumo.id}` : base;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <TrilhaDaPagina itens={insumo ? [{ rotulo: insumo.nome, href: volta }, { rotulo: 'Editar' }] : [{ rotulo: 'Novo insumo' }]} />
      <Voltar href={volta}>{insumo ? `Voltar para ${insumo.nome}` : 'Voltar para a lista'}</Voltar>
      <PageHeader
        icone="insumo"
        cor={COR.insumo}
        titulo={insumo ? 'Editar insumo' : 'Novo insumo'}
        subtitulo={insumo ? `${contexto} · ${insumo.nome}` : `${contexto} · cadastro da rede, vale para todas as lojas`}
      />
      <FormInsumo
        acao={acao}
        modo={insumo ? 'editar' : 'criar'}
        base={base}
        aqui={insumo ? `${base}/${insumo.id}/editar` : `${base}/novo`}
        cancelar={volta}
        inicial={inicial}
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
