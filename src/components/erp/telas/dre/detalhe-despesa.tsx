/**
 * Uma despesa (2.2a): o que é, a competência e como o DRE a conta, o pagamento e
 * as alterações. Pagar, desfazer o pagamento e "não repete mais" não mudam o DRE e
 * valem também em período fechado; editar o valor, a competência, a linha ou a loja
 * não. A MESMA tela no nível 1 e na pessoa do parceiro.
 */

import Link from 'next/link';
import type { DespesaCompleta } from '@/lib/erp/despesas';
import { formatarData } from '@/lib/erp/compra-campos';
import { diasDaCompetencia, frasePagamento, rotuloDaCompetencia, ROTULO_DO_PAGAMENTO } from '@/lib/erp/despesa-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Linha, Painel, Selo, Vazio } from '../../ui/superficies';
import { BotaoOuMotivo } from '../cadastro/partes';
import { ListaHistorico } from '../historico/lista-historico';
import { FormPagar, FormRemoverDespesa, FormSimples } from './acoes-despesa';
import type { AcaoDeCadastro } from './estado';

export function TelaDaDespesa({
  d,
  base,
  hoje,
  feito,
  podeLancar,
  bloqueio,
  acoes,
}: {
  d: DespesaCompleta;
  /** `/erp/dre/despesas` ou `/rodolfo/erp/<slug>/dre/despesas`. */
  base: string;
  hoje: string;
  feito?: string;
  podeLancar: boolean;
  bloqueio: string | null;
  acoes: { pagar: AcaoDeCadastro; desfazer: AcaoDeCadastro; parar: AcaoDeCadastro; remover: AcaoDeCadastro };
}) {
  const x = d.despesa;
  const aqui = `${base}/${x.id}`;
  const dias = diasDaCompetencia(x.competencia);
  return (
    <div className="space-y-6">
      <PageHeader
        icone="compras"
        cor={COR.dre}
        titulo={x.descricao}
        subtitulo={`${x.linhaNome} · ${x.lojaNome ?? 'Rede'} · ${rotuloDaCompetencia(x.competencia)}`}
        acao={
          podeLancar ? (
            <BotaoOuMotivo href={`${aqui}/editar`} bloqueio={bloqueio} variante="primario">
              Editar
            </BotaoOuMotivo>
          ) : undefined
        }
      >
        <Link href={base} className={LINK_DE_TEXTO}>
          Voltar para as despesas
        </Link>
      </PageHeader>

      {bloqueio && (
        <Aviso tom="alerta" titulo="Somente leitura.">
          {bloqueio}
        </Aviso>
      )}
      {feito && <Aviso tom="ok" titulo={feito} />}
      {d.fechado && (
        <Aviso tom="alerta" titulo={`Esta despesa cai no período ${d.fechado}, já fechado no DRE.`}>
          Dá para pagar e mudar o vencimento. Valor, competência, linha e loja não mudam mais.
        </Aviso>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Painel titulo="Despesa">
          <dl className="space-y-2.5 text-sm">
            <Linha rotulo="Valor">
              <span className="font-display text-xl font-bold tabular-nums">{formatarDinheiro(x.valorCentavos)}</span>
            </Linha>
            <Linha rotulo="Linha do DRE">{x.linhaNome}{x.linhaOculta ? <span className="text-suave"> (oculta)</span> : null}</Linha>
            <Linha rotulo="Loja">{x.lojaNome ?? 'Rede (todas as lojas)'}</Linha>
            <Linha rotulo="Competência">{rotuloDaCompetencia(x.competencia)}</Linha>
            <Linha rotulo="Como o DRE conta">
              {dias === 1 ? 'Inteira no dia' : `Dia a dia: ${formatarDinheiro(x.valorCentavos)} em ${dias} dias`}
            </Linha>
            <Linha rotulo="Repete todo mês">{x.recorrente ? 'Sim' : 'Não'}</Linha>
            <Linha rotulo="Última alteração">{x.atualizadoPorNome ? `${x.atualizadoPorNome} · ` : ''}{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(x.atualizadoEm).replace(',', ' às')}</Linha>
          </dl>
          {(d.origem || d.filha) && (
            <p className="mt-4 border-t border-linha pt-3 text-[13px] text-suave">
              {d.origem && (
                <>
                  Repete{' '}
                  <Link href={`${base}/${d.origem.id}`} className={LINK_DE_TEXTO}>
                    {rotuloDaCompetencia(d.origem.competencia)}
                  </Link>
                  .{' '}
                </>
              )}
              {d.filha && (
                <>
                  Repetida em{' '}
                  <Link href={`${base}/${d.filha.id}`} className={LINK_DE_TEXTO}>
                    {rotuloDaCompetencia(d.filha.competencia)}
                  </Link>
                  .
                </>
              )}
            </p>
          )}
        </Painel>

        <Painel titulo="Conta a pagar" subtitulo="Não muda o DRE." acessorio={x.vencimento || x.pagaEm ? <Selo tom={d.pagamento === 'paga' ? 'ok' : d.pagamento === 'vencida' ? 'erro' : d.pagamento === 'vence-logo' ? 'alerta' : 'neutro'}>{ROTULO_DO_PAGAMENTO[d.pagamento]}</Selo> : undefined}>
          <dl className="space-y-2.5 text-sm">
            <Linha rotulo="Vencimento">{x.vencimento ? formatarData(x.vencimento) : 'Sem vencimento'}</Linha>
            <Linha rotulo="Pagamento">{x.pagaEm ? `Paga em ${formatarData(x.pagaEm)}` : x.vencimento ? frasePagamento(x, hoje) : 'Não anotado'}</Linha>
          </dl>
          {podeLancar && (
            <div className="mt-4 space-y-3 border-t border-linha pt-4">
              {x.pagaEm ? (
                <FormSimples acao={acoes.desfazer} versao={x.versao} aqui={aqui} bloqueio={bloqueio} rotulo="Desfazer o pagamento" pendente="Desfazendo…" />
              ) : (
                <FormPagar acao={acoes.pagar} versao={x.versao} hoje={hoje} aqui={aqui} bloqueio={bloqueio} />
              )}
            </div>
          )}
        </Painel>
      </div>

      {podeLancar && (
        <Painel titulo="Mudar ou tirar">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Link href={`${aqui}/editar`} className={classeDeBotao('secundario')}>
                Editar valor, competência ou linha
              </Link>
              {x.recorrente && <FormSimples acao={acoes.parar} versao={x.versao} aqui={aqui} bloqueio={bloqueio} rotulo="Não repete mais" pendente="Anotando…" />}
            </div>
            <FormRemoverDespesa acao={acoes.remover} versao={x.versao} aqui={aqui} bloqueio={bloqueio} />
          </div>
        </Painel>
      )}

      <Painel titulo="Alterações desta despesa" subtitulo="Quem mudou o quê, com antes e depois." semRespiro>
        {d.historico.length === 0 ? <Vazio titulo="Nada registrado ainda." /> : <ListaHistorico linhas={d.historico} />}
      </Painel>
    </div>
  );
}
