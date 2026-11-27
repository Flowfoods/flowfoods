import { TelaConsultoriaDelivery } from '@/components/erp/telas/consultoria-delivery';
import { BotaoAcao } from '@/components/erp/ui/botoes';
import { Painel } from '@/components/erp/ui/superficies';
import { exigirParceiro } from '@/lib/erp/contexto';
import { opcoesDeRecorteDaConsultoria, recorteDaConsultoria } from '@/lib/erp/liberacao';
import { lerConsultoriaDelivery } from '@/lib/integracoes/core/consultoria-delivery';
import { acaoLiberarConsultoria, acaoPausarConsultoria } from './actions';
import { FormularioDoRecorte } from './formulario';

export const dynamic = 'force-dynamic';

export default async function ConsultoriaNoBarney(props: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await props.params;
  const ctx = await exigirParceiro(slug);
  const filtros = await props.searchParams;
  const teste = ctx.parceiro.homologacaoDeIntegracao;
  const [resultado, recorte, opcoes] = await Promise.all([
    lerConsultoriaDelivery(ctx.cliente, ctx.alcance, { parceiroId: ctx.parceiro.id, homologacaoDeIntegracao: teste },
      { lojaId: filtros?.loja, fonteId: filtros?.fonte }),
    recorteDaConsultoria(ctx.cliente),
    ctx.podeEscrever ? opcoesDeRecorteDaConsultoria(ctx.cliente, teste ? 'TEST' : 'PRODUCAO') : [],
  ]);
  const liberada = recorte?.liberado ?? false;
  const inicio = `/rodolfo/erp/${encodeURIComponent(ctx.parceiro.slug)}`;
  return <TelaConsultoriaDelivery
    base={`${inicio}/consultoria-delivery`} inicio={inicio} resultado={resultado} teste={teste}
    administracao={<Painel titulo="Acesso à prévia" subtitulo={ctx.parceiro.nome}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-suave">{liberada ? 'Liberada para a origem selecionada' : 'Bloqueada neste parceiro'}</p>
          {ctx.podeEscrever && liberada && <BotaoAcao
            acao={acaoPausarConsultoria.bind(null, ctx.parceiro.slug)}
            confirmar="Pausar a prévia para este parceiro?"
          >Pausar prévia</BotaoAcao>}
        </div>
        {ctx.podeEscrever && (opcoes.length > 0 ? <FormularioDoRecorte
          acao={acaoLiberarConsultoria.bind(null, ctx.parceiro.slug)}
          opcoes={opcoes} atual={recorte?.consultoriaConexaoId ?? null} liberada={liberada}
        /> : <p className="text-sm text-suave">Nenhuma origem Analytics ativa neste ambiente.</p>)}
      </div>
    </Painel>}
  />;
}
