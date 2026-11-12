import Link from 'next/link';
import type { ContextoDoParceiro } from '@/lib/erp/contexto';
import { COR } from '@/lib/erp/modulos';
import { lerConferenciaFinancial, type ResultadoConferenciaFinancial } from '@/lib/integracoes/core/conferencia-financial';
import { ROTULO_DO_ESTADO } from '@/lib/integracoes/core/estados';
import { montarExemploConferenciaFinancial } from '@/lib/integracoes/ifood/financial-v3-exemplo-conferencia';
import { modeloManifestoFinancial } from '@/lib/integracoes/ifood/financial-v3-modelo-manifesto';
import { Voltar } from '@/components/erp/telas/cadastro/partes';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { Campo, CAMPO } from '@/components/erp/ui/campos';
import { classeDeBotao, LINK_DE_TEXTO } from '@/components/erp/ui/estilos';
import { Aviso, Painel, Selo, Vazio } from '@/components/erp/ui/superficies';
import { ExemploDeConferencia } from './exemplo-conferencia-financial';
import { EnvioFontesFinancial, type ConexaoParaEnvio } from './envio-fontes-financial';
import { RecibosFontesFinancial } from './recibos-fontes-financial';
import { formatarCompetenciaFinancial } from './medidas-conferencia-financial';

type Consulta = Extract<ResultadoConferenciaFinancial, { ok: true }>;
type Busca = Record<string, string | string[] | undefined>;
type ContextoDaConferencia = Pick<ContextoDoParceiro, 'cliente' | 'alcance'> & {
  parceiro: Pick<ContextoDoParceiro['parceiro'], 'id' | 'homologacaoDeIntegracao'>;
};

const falhasDoEnvio: Record<string, string> = {
  '400': 'Selecione a loja, a conexão e a competência e envie os dois arquivos preenchidos.',
  '403': 'O envio exige acesso de escrita na central e liberação para esta loja.',
  '409': 'Confira se a conexão e o módulo Financial continuam disponíveis para esta loja.',
  '413': 'Cada arquivo pode ter até 2 MiB.',
  '415': 'Escolha o CSV.gz e o manifesto JSON no formulário da central.',
  '422': 'Confira a identificação, as contagens, as páginas de eventos e as vigências do manifesto com o arquivo mensal.',
};

function conexoesParaEnvio(consulta: Consulta, parceiroId: string): ConexaoParaEnvio[] {
  const { loja, competencia, ambiente } = consulta;
  if (!loja) return [];
  return consulta.conexoes.flatMap(c => {
    if (!c.merchantDoModelo) return [];
    const modelo = modeloManifestoFinancial({ parceiroId, lojaId: loja.id, conexaoId: c.id,
      merchantId: c.merchantDoModelo, competencia, ambiente });
    const json = Buffer.from(JSON.stringify(modelo, null, 2), 'utf8').toString('base64');
    return [{ id: c.id, nome: c.nome, modeloHref: `data:application/json;charset=utf-8;base64,${json}` }];
  });
}

function ConsultaDaLoja({ consulta, base }: { consulta: Consulta; base: string }) {
  const { lojas, loja, competencia, ambiente, conexoes } = consulta;
  if (!loja) return <Painel semRespiro><Vazio titulo="Nenhuma loja disponível">A consulta precisa de uma loja no seu acesso.</Vazio></Painel>;
  return <>
    <Painel titulo="Selecionar loja e competência">
      <form key={`${loja.id}/${competencia}`} action={base} method="get" aria-label="Consultar financeiro por loja e competência"
        className="grid min-w-0 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
        <Campo id="financial-loja" rotulo="Loja">
          <select id="financial-loja" name="loja" defaultValue={loja.id} required className={CAMPO}>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </Campo>
        <Campo id="financial-competencia" rotulo="Competência">
          <input id="financial-competencia" name="competencia" type="month" defaultValue={competencia} required className={CAMPO} />
        </Campo>
        <button type="submit" className={classeDeBotao('primario')}>Consultar</button>
      </form>
    </Painel>
    <Painel titulo="Fontes da competência" subtitulo={`${loja.nome} · ${formatarCompetenciaFinancial(competencia)}`}
      acessorio={<Selo>{consulta.fonteMensal === 'SEM_DADOS' ? 'Sem dados' : 'Recebido para conferência'}</Selo>}>
      <p className="text-sm text-texto">{consulta.fonteMensal === 'SEM_DADOS'
        ? 'Ainda não há uma fonte Financial conciliada para esta loja neste mês.'
        : 'O ERP recebeu fontes declaradas para esta loja e mês. A conciliação dos valores está pendente.'}</p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] text-suave">
        <li>Arquivo mensal e eventos financeiros para conferir o saldo com impacto no repasse.</li>
        <li>Liquidações para confrontar o saldo de repasse com os eventos.</li>
        <li>Cobranças e configuração vigente da loja para conferir comissão e taxa de pagamento.</li>
        <li>Títulos de antecipação para conferir o desconto em reais e o percentual efetivo.</li>
      </ul>
    </Painel>
    <Painel titulo="Cadastro atual das conexões" subtitulo={`Ambiente do parceiro · ${ambiente === 'TEST' ? 'Teste' : 'Produção'}`}>
      {conexoes.length === 0 ? <p className="text-sm text-suave">Nenhuma conexão iFood cadastrada nesta loja e ambiente.</p>
        : <ul className="divide-y divide-linha">
          {conexoes.map(c => <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 first:pt-0 last:pb-0">
            <span className="min-w-0 break-words text-sm font-medium">{c.nome}</span>
            <span className="text-[13px] text-suave">{c.estado === 'ATIVA' ? 'Conexão ativa' : 'Conexão desligada'} · Financial {c.estadoFinancial ? ROTULO_DO_ESTADO[c.estadoFinancial].toLocaleLowerCase('pt-BR') : 'sem módulo cadastrado'}</span>
          </li>)}
        </ul>}
    </Painel>
  </>;
}

export async function TelaConferenciaFinancial({ ctx, central, busca, permitirEnvio = false }: {
  ctx: ContextoDaConferencia;
  central: string;
  busca: Busca;
  permitirEnvio?: boolean;
}) {
  const base = `${central}/financial`;
  const consulta = await lerConferenciaFinancial(ctx.cliente, ctx.alcance,
    { parceiroId: ctx.parceiro.id, homologacaoDeIntegracao: ctx.parceiro.homologacaoDeIntegracao },
    { lojaId: busca.loja, competencia: busca.competencia, ...(busca.pagina !== undefined && { paginaRecibos: busca.pagina }),
      ...(ctx.alcance.nivel === 'FLOWFOODS' && busca.recibo !== undefined && { reciboId: busca.recibo }) });
  const parametros = new URLSearchParams();
  if (consulta.ok && consulta.loja) {
    parametros.set('loja', consulta.loja.id);
    parametros.set('competencia', consulta.competencia);
  }
  const retorno = parametros.size ? `${base}?${parametros}` : base;
  const cenario = busca.exemplo;
  const falha = ctx.alcance.nivel === 'FLOWFOODS' && typeof busca.erroEnvio === 'string' && Object.hasOwn(falhasDoEnvio, busca.erroEnvio)
    ? falhasDoEnvio[busca.erroEnvio] : undefined;
  const reciboVisivel = ctx.alcance.nivel === 'FLOWFOODS' && consulta.ok && typeof busca.recibo === 'string'
    ? consulta.recibos.itens.find(r => r.id === busca.recibo) : undefined;
  const envio = permitirEnvio && ctx.alcance.nivel === 'FLOWFOODS' && consulta.ok && cenario === undefined
    ? conexoesParaEnvio(consulta, ctx.parceiro.id) : [];
  const selecionada = busca.conexao === undefined ? envio[0] : envio.find(c => c.id === busca.conexao);
  const retornoDaConexao = selecionada ? `${retorno}&conexao=${encodeURIComponent(selecionada.id)}` : retorno;
  const valido = cenario === 'conforme' || cenario === 'divergente' || cenario === 'incompleto';
  const exemplo = consulta.ok && consulta.loja && valido ? await montarExemploConferenciaFinancial(cenario) : null;
  const hrefDaCentral = consulta.ok && consulta.loja ? `${central}?loja=${encodeURIComponent(consulta.loja.id)}` : central;
  return <div className="min-w-0 space-y-5">
    <Voltar href={exemplo ? retorno : hrefDaCentral}>{exemplo ? 'Voltar à consulta da loja' : 'Voltar para Integrações'}</Voltar>
    <PageHeader icone="canais" cor={ctx.alcance.nivel === 'FLOWFOODS' ? COR.parceiros : COR.rede}
      titulo={exemplo ? 'Exemplo de conferência Financial' : 'Conferência financeira do iFood'}
      subtitulo={exemplo ? `${exemplo.nomeLoja} · ${formatarCompetenciaFinancial(exemplo.competencia)}` : 'Repasses, taxas e antecipações por loja e competência'} />
    {!consulta.ok ? <>
      <Aviso tom="alerta" titulo="Consulta indisponível">{consulta.mensagem}</Aviso>
      {(consulta.motivo === 'filtro-invalido' || consulta.motivo === 'sem-permissao') && <Link href={base} className={classeDeBotao('secundario')}>Limpar filtros</Link>}
    </> : exemplo ? <ExemploDeConferencia exemplo={exemplo} retorno={retorno} />
      : consulta.loja && cenario !== undefined ? <>
        <Aviso tom="alerta" titulo="Cenário inválido">Escolha um dos exemplos disponíveis na consulta.</Aviso>
        <Link href={retorno} className={classeDeBotao('secundario')}>Voltar à consulta da loja</Link>
      </> : <>
        {falha && <div id="aviso-envio"><Aviso tom="alerta" titulo="Confira o envio">{falha}</Aviso></div>}
        {reciboVisivel && <Aviso titulo="Recibo disponível na consulta">Pacote recebido para conferência. Recibo {reciboVisivel.id}.</Aviso>}
        <ConsultaDaLoja consulta={consulta} base={base} />
        {consulta.loja && <RecibosFontesFinancial consulta={consulta} retorno={retornoDaConexao} destaque={reciboVisivel?.id} />}
        {consulta.loja && envio.length > 0 && <Painel id="envio-fontes" titulo="Registrar fontes para conferência"
          subtitulo="Envio manual pela central FlowFoods · até 2 MiB por arquivo.">
          <div className="space-y-4">
            <div className="text-sm"><p className="font-semibold">Conexão iFood</p>
              {envio.length === 1 && selecionada ? <p className="mt-1">{selecionada.nome}</p>
                : <nav aria-label="Escolher conexão iFood para envio" className="mt-1 flex flex-wrap gap-2">
                  {envio.map(c => <Link key={c.id} prefetch={false} aria-current={selecionada?.id === c.id ? 'page' : undefined}
                    href={`${retorno}&conexao=${encodeURIComponent(c.id)}#envio-fontes`}
                    className={classeDeBotao(selecionada?.id === c.id ? 'primario' : 'secundario')}>{c.nome}</Link>)}
                </nav>}
            </div>
            {selecionada ? <EnvioFontesFinancial key={retornoDaConexao} conexao={selecionada} base={base}
              loja={consulta.loja.id} competencia={consulta.competencia} retorno={retornoDaConexao} />
              : <Aviso tom="alerta" titulo="Escolha uma conexão disponível">O modelo e o envio usam a conexão selecionada.</Aviso>}
          </div>
        </Painel>}
        {consulta.loja && <Link prefetch={false} href={`${retorno}&exemplo=conforme`} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center`}>Ver exemplo com dados simulados</Link>}
      </>}
  </div>;
}
