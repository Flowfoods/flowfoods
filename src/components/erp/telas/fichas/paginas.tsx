/**
 * Montagem das telas de ficha técnica comuns ao nível 1 e à pessoa do
 * parceiro: cabeçalho da lista (com "Nova ficha" e "Importar planilha"),
 * formulário de nova/editar e a tela de importar. As rotas só resolvem
 * contexto e permissão e passam dados e actions prontos.
 */

import { FileUp, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { FichaDetalhada, InsumoDoFormulario, PreparoDoFormulario } from '@/lib/erp/fichas';
import { formatarFator, itemParaCampo, rendimentoParaCampo } from '@/lib/erp/ficha-campos';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { TrilhaDaPagina } from '../../shell/trilha';
import type { AcaoDeCadastro } from '../cadastro/estado';
import { BotaoOuMotivo, Voltar } from '../cadastro/partes';
import type { AcaoDeImportacao } from './estado';
import { FormFicha, type ValoresDaFicha } from './form-ficha';
import { TelaImportarFichas } from './importar';
import { urlDaFoto } from './miniatura';
import { PREFIXO_DO_PREPARO } from './prefixo';

export function CabecalhoDasFichas({
  subtitulo,
  base,
  podeEditar,
  bloqueio,
  children,
}: {
  subtitulo: string;
  base: string;
  /** Só para quem cria e edita fichas. */
  podeEditar: boolean;
  bloqueio: string | null;
  children: ReactNode;
}) {
  return (
    <PageHeader
      icone="fichas"
      cor={COR.fichas}
      titulo="Fichas técnicas"
      subtitulo={subtitulo}
      acao={
        podeEditar ? (
          <>
            <BotaoOuMotivo href={`${base}/importar`} bloqueio={bloqueio}>
              <FileUp size={16} aria-hidden />
              Importar planilha
            </BotaoOuMotivo>
            <BotaoOuMotivo href={`${base}/nova`} bloqueio={bloqueio} variante="primario">
              <Plus size={16} aria-hidden />
              Nova ficha
            </BotaoOuMotivo>
          </>
        ) : undefined
      }
    >
      {children}
    </PageHeader>
  );
}

export function TelaFormFicha({
  ficha,
  base,
  contexto,
  acao,
  opcoes,
  preparos,
  bloqueio,
  novoInsumo,
}: {
  /** Ausente = nova. */
  ficha?: FichaDetalhada;
  base: string;
  contexto: string;
  acao: AcaoDeCadastro;
  opcoes: InsumoDoFormulario[];
  preparos: PreparoDoFormulario[];
  bloqueio: string | null;
  novoInsumo?: string;
}) {
  const rende = ficha && rendimentoParaCampo(ficha.rendimentoMilesimos, ficha.unidadeRendimento, ficha.tipo);
  const inicial: ValoresDaFicha | undefined = ficha && {
    nome: ficha.nome,
    tipo: ficha.tipo,
    descricao: ficha.descricao ?? '',
    modoPreparo: ficha.modoPreparo ?? '',
    passos: ficha.passosPreparo,
    rendimento: rende!.texto,
    rendimentoUnidade: rende!.em,
    itens: ficha.itens.map((i) => ({
      escolha: i.subfichaId ? `${PREFIXO_DO_PREPARO}${i.subfichaId}` : (i.insumoId ?? ''),
      ...itemParaCampo(i.quantidadeMilesimos, i.unidade),
      fator: i.fatorCorrecaoMilesimos === 1000 ? '' : formatarFator(i.fatorCorrecaoMilesimos),
    })),
    validades: ficha.validades,
  };
  const volta = ficha ? `${base}/${ficha.id}` : base;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <TrilhaDaPagina itens={ficha ? [{ rotulo: ficha.nome, href: volta }, { rotulo: 'Editar' }] : [{ rotulo: 'Nova ficha' }]} />
      <Voltar href={volta}>{ficha ? `Voltar para ${ficha.nome}` : 'Voltar para a lista'}</Voltar>
      <PageHeader
        icone="fichas"
        cor={COR.fichas}
        titulo={ficha ? 'Editar ficha' : 'Nova ficha técnica'}
        subtitulo={ficha ? `${contexto} · ${ficha.nome}` : `${contexto} · receita da rede, vale para todas as lojas`}
      />
      <FormFicha
        acao={acao}
        modo={ficha ? 'editar' : 'criar'}
        base={base}
        aqui={ficha ? `${base}/${ficha.id}/editar` : `${base}/nova`}
        cancelar={volta}
        opcoes={opcoes}
        preparos={preparos}
        inicial={inicial}
        fotoAtual={ficha?.foto ? urlDaFoto(base, ficha.id, ficha.foto) : null}
        versao={ficha?.versao}
        bloqueio={bloqueio}
        novoInsumo={novoInsumo}
      />
    </div>
  );
}

export function TelaImportar({
  base,
  contexto,
  acaoPrevia,
  acaoImportar,
  novoInsumo,
  bloqueio,
}: {
  base: string;
  contexto: string;
  acaoPrevia: AcaoDeImportacao;
  acaoImportar: AcaoDeImportacao;
  novoInsumo?: string;
  bloqueio: string | null;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: 'Importar planilha' }]} />
      <Voltar href={base}>Voltar para a lista</Voltar>
      <PageHeader
        icone="fichas"
        cor={COR.fichas}
        titulo="Importar fichas"
        subtitulo={`${contexto} · várias fichas de uma vez; reimportar não duplica`}
      />
      <TelaImportarFichas acaoPrevia={acaoPrevia} acaoImportar={acaoImportar} base={base} novoInsumo={novoInsumo} bloqueio={bloqueio} />
    </div>
  );
}
