/**
 * Plano de contas (2.2a, decisão 137): as linhas do DRE e os nomes que a casa usa.
 * Só quem define o plano e o período do DRE (a rede inteira) mexe. Renomear mantém a
 * linha (as despesas já lançadas mostram o nome novo); ocultar tira a linha do
 * formulário de despesa mas ela continua no DRE de qualquer período em que tem valor;
 * linha nunca se apaga e o grupo dela não muda depois de criada (oculte e crie outra).
 */

import type { LinhaDoPlano } from '@/lib/erp/dre-plano';
import { chaveDaLinha, GRUPOS_DE_DESPESA, linhasLancaveisDoGrupo, PLANO_PADRAO, ROTULO_DO_GRUPO } from '@/lib/erp/dre-plano';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { Aviso, Contagem, Painel, Selo } from '../../ui/superficies';
import type { AcaoLocal } from './estado';
import { FormNovaLinha, FormOcultar, FormRenomear } from './form-plano';

export function TelaDoPlano({ plano, contexto, acoes, bloqueio }: { plano: LinhaDoPlano[]; contexto: string; acoes: { criar: AcaoLocal; renomear: AcaoLocal; ocultar: AcaoLocal }; bloqueio: string | null }) {
  const calculadas = plano.filter((l) => l.calculada && !l.codigo?.startsWith('grupo:'));
  const doPadrao = (l: LinhaDoPlano) => !!l.codigo && PLANO_PADRAO.some((p) => p.codigo === l.codigo);
  return (
    <div className="space-y-6">
      <PageHeader icone="cadastro" cor={COR.dre} titulo="Plano de contas" subtitulo={`${contexto} · as linhas do DRE e os nomes que a casa usa`} />
      {bloqueio && (
        <Aviso tom="alerta" titulo="Somente leitura.">
          {bloqueio}
        </Aviso>
      )}

      <Painel titulo="Nova linha" subtitulo="Para o que não cabe nas linhas prontas. O grupo não muda depois: se errar, oculte a linha e crie outra.">
        <FormNovaLinha acao={acoes.criar} bloqueio={bloqueio} />
      </Painel>

      {GRUPOS_DE_DESPESA.map((g) => {
        const linhas = linhasLancaveisDoGrupo(plano, g);
        return (
          <Painel key={g} titulo={ROTULO_DO_GRUPO[g]} acessorio={<Contagem>{linhas.length}</Contagem>} semRespiro>
            <ul className="divide-y divide-linha">
              {linhas.map((l) => (
                <li key={chaveDaLinha(l)} className="grid gap-x-4 gap-y-2 px-4 py-3 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-sm font-medium ${l.ativa ? 'text-texto' : 'text-suave line-through'}`}>{l.nome}</span>
                      {!l.ativa && <Selo>Oculta</Selo>}
                      {!doPadrao(l) && <Selo>Da casa</Selo>}
                    </div>
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-[13px] text-suave underline decoration-linha-forte underline-offset-4 hover:text-texto">Renomear</summary>
                      <div className="mt-2 max-w-xl">
                        <FormRenomear acao={acoes.renomear} chave={chaveDaLinha(l)} nome={l.nome} versao={l.versao} bloqueio={bloqueio} />
                      </div>
                    </details>
                  </div>
                  <FormOcultar acao={acoes.ocultar} chave={chaveDaLinha(l)} ocultar={l.ativa} versao={l.versao} bloqueio={bloqueio} nome={l.nome} />
                </li>
              ))}
            </ul>
          </Painel>
        );
      })}

      <Painel titulo="Calculadas pelo sistema" subtitulo="Não se renomeiam, não se ocultam e não recebem despesa." semRespiro>
        <ul className="divide-y divide-linha">
          {calculadas.map((l) => (
            <li key={l.codigo} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
              <span>{l.nome}</span>
              <span className="text-[12px] text-suave">{l.grupo === 'RECEITA' ? 'vem do faturamento' : l.codigo === 'cmv' ? 'chega na 2.3' : l.codigo === 'taxas-ifood' ? 'estimada pela taxa do iFood' : 'resultado calculado'}</span>
            </li>
          ))}
        </ul>
      </Painel>
    </div>
  );
}
