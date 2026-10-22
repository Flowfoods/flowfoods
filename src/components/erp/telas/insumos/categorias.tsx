/**
 * Categorias de insumo (I.1a), a MESMA tela para o nível 1 e para a pessoa do parceiro: a lista da casa, na ordem em que o
 * formulário as oferece, com quantos insumos há em cada uma. Quem tem `insumos.categorias` cria, renomeia, reordena, desativa
 * e exclui (só sem uso); quem só vê, lê. A categoria é da REDE: vale para todas as lojas (a loja personaliza só a meta, na I.2).
 */

import { COR } from '@/lib/erp/modulos';
import type { LinhaDeCategoria } from '@/lib/erp/categorias';
import type { ResumoDoQueFalta } from '@/lib/erp/classificar';
import { fraseDaCategoria } from './executar-categorias';
import { PageHeader } from '../../ui/cabecalho';
import { Aviso, Painel, Selo } from '../../ui/superficies';
import type { AcaoDeCadastro } from '../cadastro/estado';
import { AvisoDaClassificacao } from './aviso-classificar';
import { AcoesDaCategoria, FormNovaCategoria, type AcoesDaLinha } from './form-categorias';

export function TelaCategorias({
  categorias,
  contexto,
  base,
  podeGerir,
  bloqueio,
  feito,
  nomeDaFeita,
  faltam,
  podeClassificar,
  acaoCriar,
  acoesDe,
}: {
  categorias: LinhaDeCategoria[];
  contexto?: string;
  /** /erp/insumos ou /rodolfo/erp/<slug>/insumos */
  base: string;
  /** `insumos.categorias`: cria, renomeia, reordena, desativa e exclui. */
  podeGerir: boolean;
  bloqueio: string | null;
  /** `?feito=` e o nome da categoria de `?cat=` (lido do banco): a URL só escolhe a frase. */
  feito?: string;
  nomeDaFeita: string | null;
  faltam: ResumoDoQueFalta;
  podeClassificar: boolean;
  acaoCriar: AcaoDeCadastro;
  acoesDe: (id: string) => AcoesDaLinha;
}) {
  const frase = fraseDaCategoria(feito, nomeDaFeita);
  const moveis = categorias.filter((c) => !c.sistema);
  const ativas = categorias.filter((c) => c.ativa).length;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        icone="categorias"
        cor={COR.insumo}
        titulo="Categorias de insumo"
        subtitulo={`${contexto ? `${contexto} · ` : ''}cadastro da rede, vale para todas as lojas · ${ativas} ${ativas === 1 ? 'ativa' : 'ativas'}`}
      />
      {frase && <Aviso tom="ok" titulo={frase} />}
      <AvisoDaClassificacao resumo={faltam} href={podeClassificar ? `${base}/classificar` : undefined} />

      {podeGerir && (
        <Painel titulo="Nova categoria" subtitulo="Uma categoria só para a sua casa, além das dez do plano">
          <FormNovaCategoria acao={acaoCriar} bloqueio={bloqueio} />
        </Painel>
      )}

      <Painel
        titulo="Categorias da casa"
        subtitulo="A natureza do insumo para o CMV, não o setor nem a conservação: coxa de frango é Proteína, mesmo congelada"
        semRespiro
      >
        {categorias.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-suave sm:px-5">Ainda não há categorias. Recarregue a página para criar as dez padrão.</p>
        ) : (
          <ol className="divide-y divide-linha">
            {categorias.map((c) => {
              const posicao = moveis.findIndex((m) => m.id === c.id);
              return (
                <li key={c.id} className="px-4 py-3 sm:px-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className={`text-[15px] font-semibold ${c.ativa ? 'text-texto' : 'text-suave'}`}>{c.nome}</span>
                        {c.sistema && <Selo>Do sistema</Selo>}
                        {!c.ativa && <Selo>Desativada</Selo>}
                      </p>
                      <p className="mt-0.5 text-[12px] tabular-nums text-suave">
                        {c.nInsumos === 0
                          ? 'Nenhum insumo'
                          : `${c.nInsumos} ${c.nInsumos === 1 ? 'insumo' : 'insumos'}${c.nAtivos !== c.nInsumos ? ` (${c.nAtivos} ${c.nAtivos === 1 ? 'ativo' : 'ativos'})` : ''}`}
                      </p>
                    </div>
                    {podeGerir && !bloqueio && (
                      <AcoesDaCategoria categoria={c} acoes={acoesDe(c.id)} primeira={posicao <= 0} ultima={posicao === moveis.length - 1} />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Painel>
      {!podeGerir && (
        <p className="text-[13px] text-suave">Quem cuida das categorias é o dono da rede. Você pode classificar cada insumo na hora de cadastrar ou editar.</p>
      )}
    </div>
  );
}
