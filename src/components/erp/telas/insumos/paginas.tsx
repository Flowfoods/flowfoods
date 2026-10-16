/**
 * Montagem das telas de insumo comuns ao nível 1 e à pessoa do parceiro:
 * cabeçalho da lista (com "Novo insumo"), formulário de novo/editar e a tela
 * de uma embalagem. As rotas só resolvem contexto e permissão e passam dados
 * e actions prontos.
 */

import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { InsumoDetalhado } from '@/lib/erp/insumos';
import { TIPOS } from '@/lib/erp/insumo-campos';
import { COR } from '@/lib/erp/modulos';
import { UNIDADES, dinheiroParaCampo, quantidadeParaCampo } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Painel } from '../../ui/superficies';
import Link from 'next/link';
import { BotaoOuMotivo } from './detalhe';
import type { AcaoDeInsumo } from './estado';
import { FormEmbalagem } from './form-embalagem';
import { FormInsumo, type ValoresDoInsumo } from './form-insumo';
import { FormSituacao } from './form-situacao';
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

function Voltar({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center sm:min-h-0`}>
      {children}
    </Link>
  );
}

export function TelaFormInsumo({
  insumo,
  base,
  contexto,
  acao,
  bloqueio,
}: {
  /** Ausente = novo. */
  insumo?: InsumoDetalhado;
  base: string;
  contexto: string;
  acao: AcaoDeInsumo;
  bloqueio: string | null;
}) {
  const inicial: ValoresDoInsumo | undefined = insumo && {
    nome: insumo.nome,
    tipo: insumo.tipo,
    unidade: insumo.unidade,
    conservacao: insumo.conservacao,
    ...embalagemParaCampo(insumo, insumo.unidade),
  };
  const volta = insumo ? `${base}/${insumo.id}` : base;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {insumo && <TrilhaDaPagina itens={[{ rotulo: insumo.nome, href: volta }, { rotulo: 'Editar' }]} />}
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
  acaoSalvar: AcaoDeInsumo;
  acaoSituacao?: AcaoDeInsumo;
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
