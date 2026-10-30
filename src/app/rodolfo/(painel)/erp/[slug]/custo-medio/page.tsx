/**
 * N.1 — custo médio ponderado por loja (nível 1, FlowFoods): o impacto de ligar, loja por loja, e a troca.
 * Decisão de Rodolfo (23/10/2026): o estoque e o CMV de cada loja valem pelo custo médio dela; o último preço
 * da rede segue só para precificar fichas. Nada muda sozinho; períodos fechados não mudam.
 */

import { exigirParceiro } from '@/lib/erp/contexto';
import { impactoDoCustoMedio, type AlertaDoImpacto } from '@/lib/erp/custo-medio';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro, formatarQuantidade } from '@/lib/erp/unidades';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { Voltar } from '@/components/erp/telas/cadastro/partes';
import { Aviso, Painel, Selo, Vazio } from '@/components/erp/ui/superficies';
import { FormLigarCustoMedio } from './form';

export const dynamic = 'force-dynamic';

const DATA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const ALERTA: Record<AlertaDoImpacto, string> = {
  'valor-negativo': 'valor negativo com estoque',
  residuo: 'valor sem quantidade',
  'sem-custo': 'custo desconhecido',
  'sem-referencia': 'sem preço de referência',
};
const comSinal = (c: number) => `${c < 0 ? '−' : c > 0 ? '+' : ''}${formatarDinheiro(Math.abs(c))}`;
const LINHAS_A_MOSTRAR = 25;

export default async function CustoMedioPage({ params }: { params: { slug: string } }) {
  const { parceiro, cliente, bloqueio } = await exigirParceiro(params.slug);
  const lojas = await impactoDoCustoMedio(cliente);

  return (
    <div className="space-y-6">
      <Voltar href={'/rodolfo/erp/' + encodeURIComponent(parceiro.slug)}>Voltar para as áreas da rede</Voltar>
      <PageHeader
        icone="cadastro"
        cor={COR.rede}
        titulo="Custo médio por loja"
        subtitulo={`${parceiro.nome} · o estoque e o CMV de cada loja pelo custo médio dela; a ficha segue com o último preço da rede`}
      />
      {bloqueio && <Aviso tom="alerta" titulo={bloqueio} />}
      {lojas.length === 0 && <Vazio titulo="Nenhuma loja cadastrada." />}
      {lojas.map((l) => {
        const diferenca = l.livroCentavos - l.referenciaCentavos;
        return (
          <Painel
            key={l.lojaId}
            titulo={l.nome}
            subtitulo={l.ligadoDesde ? `Custo médio desde ${DATA.format(l.ligadoDesde)} · diferença de base na troca ${comSinal(l.ponteCentavos ?? 0)}` : 'Ainda no método antigo (último preço da rede)'}
            acessorio={l.ligadoDesde ? <Selo tom="ok">Ligado</Selo> : <Selo>Desligado</Selo>}
          >
            <div className="space-y-4">
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-[12px] font-semibold text-suave">Valor do livro da loja</dt>
                  <dd className="mt-1 tabular-nums text-texto">{formatarDinheiro(l.livroCentavos)}</dd>
                </div>
                <div>
                  <dt className="text-[12px] font-semibold text-suave">Pela regra antiga</dt>
                  <dd className="mt-1 tabular-nums text-texto">{formatarDinheiro(l.referenciaCentavos)}</dd>
                </div>
                <div>
                  <dt className="text-[12px] font-semibold text-suave">Diferença de base</dt>
                  <dd className="mt-1 tabular-nums text-texto">{comSinal(diferenca)}</dd>
                </div>
              </dl>
              {l.pendentes > 0 && <p className="text-[13px] text-atencao">{l.pendentes === 1 ? '1 item ficou fora da comparação' : `${l.pendentes} itens ficaram fora da comparação`} (custo desconhecido ou sem preço de referência).</p>}
              {l.linhas.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[34rem] text-[13px]">
                    <thead>
                      <tr className="border-b border-linha text-left text-[12px] text-suave">
                        <th className="py-2 pr-3 font-semibold">Insumo</th>
                        <th className="py-2 pr-3 text-right font-semibold">Quantidade</th>
                        <th className="py-2 pr-3 text-right font-semibold">Livro</th>
                        <th className="py-2 pr-3 text-right font-semibold">Regra antiga</th>
                        <th className="py-2 text-right font-semibold">Diferença</th>
                      </tr>
                    </thead>
                    <tbody>
                      {l.linhas.slice(0, LINHAS_A_MOSTRAR).map((x) => (
                        <tr key={x.insumoId} className="border-b border-linha/60 align-top">
                          <td className="py-2 pr-3">
                            <span className="text-texto">{x.nome}</span>
                            {x.alertas.length > 0 && <span className="mt-0.5 block text-[12px] text-atencao">{x.alertas.map((a) => ALERTA[a]).join(' · ')}</span>}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatarQuantidade(x.quantidadeMilesimos, x.unidade)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatarDinheiro(x.livroCentavos)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{x.referenciaCentavos === null ? '—' : formatarDinheiro(x.referenciaCentavos)}</td>
                          <td className="py-2 text-right tabular-nums">{x.diferencaCentavos === null ? '—' : comSinal(x.diferencaCentavos)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {l.linhas.length > LINHAS_A_MOSTRAR && <p className="mt-2 text-[12px] text-suave">Mostrando as {LINHAS_A_MOSTRAR} maiores diferenças de {l.linhas.length} itens.</p>}
                </div>
              )}
              {!l.ligadoDesde && !bloqueio && <FormLigarCustoMedio slug={parceiro.slug} lojaId={l.lojaId} loja={l.nome} />}
            </div>
          </Painel>
        );
      })}
    </div>
  );
}
