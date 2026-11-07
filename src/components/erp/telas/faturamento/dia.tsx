/**
 * A tela do dia de uma loja (2.1), a MESMA no nível 1 e na pessoa do parceiro:
 * o formulário por canal, quem lançou e quando, o aviso de período fechado,
 * o "Remover" com motivo e as últimas alterações do dia (antes e depois).
 */

import { HistoricoRecolhivel } from '../historico/historico-recolhivel';
import Link from 'next/link';
import type { DiaDaLojaLido } from '@/lib/erp/faturamento';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { somarDias } from '@/lib/erp/contagem-campos';
import { CANAIS } from '@/lib/erp/canal-campos';
import { fraseDoNumero } from '@/lib/erp/faturamento-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { comVoltaParaAHome, type VoltaParaAHome } from '@/lib/erp/volta';
import { TrilhaDaPagina } from '../../shell/trilha';
import { AvisoDoPeriodoFechado } from '../../ui/aviso-periodo-fechado';
import { PageHeader } from '../../ui/cabecalho';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso } from '../../ui/superficies';
import { PainelComPonto, PontoDeAjuda } from '../../ui/ponto-de-ajuda';
import { ListaHistorico } from '../historico/lista-historico';
import { Voltar } from '../cadastro/partes';
import type { AcaoDoDia } from './estado';
import { FormDoDia, FormRemover, type CanalParaATela } from './form-dia';
import { dataLonga, quemLancou, textoDoValor } from './formato';
import { SeloOrigemAnalytics } from './selo-origem-analytics';

export function TelaDoDia({
  dia,
  base,
  feito,
  acao,
  remover,
  podeLancar,
  verPeriodos,
  bloqueio,
  volta,
  hrefIntegracao,
}: {
  dia: DiaDaLojaLido;
  base: string;
  feito?: string;
  acao: AcaoDoDia;
  /** A action de remover um canal (já presa à loja e ao dia); ausente = sem permissão. */
  remover?: (canal: string) => AcaoDoDia;
  podeLancar: boolean;
  /** Abre a tela Períodos (`dre.ver`): o aviso de período fechado só leva até lá se levar a algum lugar. */
  verPeriodos: boolean;
  bloqueio: string | null;
  /**
   * Decisão 518: a volta para a Home, já conferida (`voltaParaAHome`). Viaja no Voltar para o mês, nos dias vizinhos e no
   * formulário, para o mês continuar oferecendo "Voltar para o início" depois de salvar. Nula = a tela de sempre.
   */
  volta?: VoltaParaAHome | null;
  hrefIntegracao?: string;
}) {
  const hoje = hojeNoRio();
  const mes = dia.data.slice(0, 7);
  const voltar = comVoltaParaAHome(`${base}/${dia.loja.id}/${dia.data}`, volta);
  const canais: CanalParaATela[] = dia.canais.map((c) => {
    const h = c.humano;
    const zerado = h && h.valorCentavos === 0 && h.pedidos === 0 && h.clientes === 0;
    const integracao = c.valendo?.fonte === 'INTEGRACAO' ? c.valendo : null;
    return {
      canal: c.canal,
      inicial: h
        ? zerado
          ? { valor: '', pedidos: '', clientes: '', naoVendeu: true }
          : { valor: textoDoValor(h.valorCentavos), pedidos: String(h.pedidos), clientes: String(h.clientes), naoVendeu: false }
        : { valor: '', pedidos: '', clientes: '', naoVendeu: false },
      versao: h?.versao ?? '',
      quem: h ? quemLancou(h) : null,
      desligado: !c.ativo,
      integracao: integracao
        ? {
            resumo: fraseDoNumero(integracao),
            clientes: integracao.clientes === null
              ? 'Clientes atendidos: sem dado.'
              : `Clientes atendidos: ${integracao.clientes.toLocaleString('pt-BR')} (${integracao.fonteClientes === 'HUMANO' ? 'informados pela casa' : 'da integração'}).`,
            conferencia: integracao.conferencia
              ? `${fraseDoNumero(integracao.conferencia)}, ${integracao.conferencia.diferencaCentavos === 0 ? 'sem diferença' : `diferença de ${formatarDinheiro(Math.abs(integracao.conferencia.diferencaCentavos))}`}`
              : null,
          }
        : null,
    };
  });
  const ontem = somarDias(dia.data, -1);
  const amanha = somarDias(dia.data, 1);
  const removiveis = dia.canais.filter((c) => c.humano);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: `${dia.loja.nome} · ${dataLonga(dia.data)}` }]} />
      <Voltar href={comVoltaParaAHome(`${base}?mes=${mes}&loja=${dia.loja.id}`, volta)}>Voltar para o mês</Voltar>
      <PageHeader icone="dre" cor={COR.dre} titulo={dia.loja.nome} subtitulo={`${dataLonga(dia.data)} · faturamento do dia`}>
        <nav aria-label="Outros dias" className="flex flex-wrap gap-x-5 gap-y-1">
          <Link href={comVoltaParaAHome(`${base}/${dia.loja.id}/${ontem}`, volta)} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center sm:min-h-0`}>
            Dia anterior
          </Link>
          {amanha <= hoje && (
            <Link href={comVoltaParaAHome(`${base}/${dia.loja.id}/${amanha}`, volta)} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center sm:min-h-0`}>
              Dia seguinte
            </Link>
          )}
        </nav>
      </PageHeader>
      <SeloOrigemAnalytics origem={dia.origemAnalytics ?? null} hrefIntegracao={hrefIntegracao} />
      {feito && <Aviso tom="ok" titulo={feito} />}
      {bloqueio && (
        <Aviso tom="alerta" titulo="Somente leitura.">
          {bloqueio}
        </Aviso>
      )}
      {dia.fechado && (
        <div className="space-y-1">
          <AvisoDoPeriodoFechado periodo={dia.fechado} href={verPeriodos ? `${base.replace(/\/faturamento$/, '')}/dre/periodos` : null} frase="Este dia só pode ser consultado: não aceita lançar, corrigir nem remover." />
          {/* Decisão 519: o aviso diz o que não dá e a saída; o porquê fica no card. */}
          <PontoDeAjuda ponto="periodo-fechado" comRotulo />
        </div>
      )}
      {!podeLancar && !dia.fechado && !bloqueio && (
        <Aviso titulo="Você pode ver este dia.">Lançar é com quem tem “lançar faturamento” nesta loja.</Aviso>
      )}
      {!dia.loja.ativa && <Aviso tom="alerta" titulo="Loja desativada.">Os dias antigos continuam aqui, mas ela não recebe lançamento novo.</Aviso>}
      {canais.length === 0 ? (
        <Aviso titulo="Nenhum canal de venda nesta loja.">Quem cuida da rede escolhe os canais em Lojas e marcas.</Aviso>
      ) : (
        <FormDoDia acao={acao} canais={canais} voltar={voltar} volta={volta?.href} bloqueio={bloqueio} somenteLeitura={!podeLancar || !dia.loja.ativa} fechado={dia.fechado} />
      )}

      {podeLancar && remover && !dia.fechado && !bloqueio && removiveis.length > 0 && (
        // Decisão 519: corrigir × remover mora no ponto "remover"; sem ele, o subtítulo de antes.
        <PainelComPonto
          ponto="remover"
          titulo="Lançou no dia ou na loja errada?"
          subtituloSemPonto="Para corrigir um número, é só salvar o dia de novo. Remover serve para o que não deveria existir."
        >
          <div className="space-y-3">
            {removiveis.map((c) => (
              <FormRemover
                key={c.canal}
                acao={remover(c.canal)}
                rotulo={CANAIS[c.canal].rotulo}
                versao={c.humano!.versao}
                voltar={voltar}
                volta={volta?.href}
                depois={c.valendo?.fonte === 'INTEGRACAO' ? c.valendo.fonteClientes === 'HUMANO' ? 'integracao-clientes' : 'integracao' : c.ativo && dia.loja.ativa ? 'pode-faltar' : 'sem-lancamento'}
              />
            ))}
          </div>
        </PainelComPonto>
      )}

      <HistoricoRecolhivel chave={`${base}/${dia.loja.id}/${dia.data}`} quantidade={dia.historico.length} titulo="Alterações deste dia" subtitulo="O antes e o depois de cada lançamento, com quem e quando." semRespiro>
        {dia.historico.length === 0 ? (
          <p className="px-4 py-6 text-sm text-suave sm:px-5">Nada lançado neste dia ainda.</p>
        ) : (
          <ListaHistorico linhas={dia.historico} compacta />
        )}
      </HistoricoRecolhivel>
    </div>
  );
}
