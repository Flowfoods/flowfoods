/**
 * A tela do dia de uma loja (2.1), a MESMA no nível 1 e na pessoa do parceiro:
 * o formulário por canal, quem lançou e quando, o aviso de período fechado,
 * o "Remover" com motivo e as últimas alterações do dia (antes e depois).
 */

import Link from 'next/link';
import type { DiaDaLojaLido } from '@/lib/erp/faturamento';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { somarDias } from '@/lib/erp/contagem-campos';
import { CANAIS } from '@/lib/erp/canal-campos';
import { fraseDoNumero } from '@/lib/erp/faturamento-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { TrilhaDaPagina } from '../../shell/trilha';
import { PageHeader } from '../../ui/cabecalho';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Painel } from '../../ui/superficies';
import { ListaHistorico } from '../historico/lista-historico';
import { Voltar } from '../cadastro/partes';
import type { AcaoDoDia } from './estado';
import { FormDoDia, FormRemover, type CanalParaATela } from './form-dia';
import { dataLonga, quemLancou, textoDoValor } from './formato';

export function TelaDoDia({
  dia,
  base,
  feito,
  acao,
  remover,
  podeLancar,
  bloqueio,
}: {
  dia: DiaDaLojaLido;
  base: string;
  feito?: string;
  acao: AcaoDoDia;
  /** A action de remover um canal (já presa à loja e ao dia); ausente = sem permissão. */
  remover?: (canal: string) => AcaoDoDia;
  podeLancar: boolean;
  bloqueio: string | null;
}) {
  const hoje = hojeNoRio();
  const mes = dia.data.slice(0, 7);
  const voltar = `${base}/${dia.loja.id}/${dia.data}`;
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
      <Voltar href={`${base}?mes=${mes}&loja=${dia.loja.id}`}>Voltar para o mês</Voltar>
      <PageHeader icone="dre" cor={COR.dre} titulo={dia.loja.nome} subtitulo={`${dataLonga(dia.data)} · faturamento do dia`}>
        <nav aria-label="Outros dias" className="flex flex-wrap gap-x-5 gap-y-1">
          <Link href={`${base}/${dia.loja.id}/${ontem}`} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center sm:min-h-0`}>
            Dia anterior
          </Link>
          {amanha <= hoje && (
            <Link href={`${base}/${dia.loja.id}/${amanha}`} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center sm:min-h-0`}>
              Dia seguinte
            </Link>
          )}
        </nav>
      </PageHeader>
      {feito && <Aviso tom="ok" titulo={feito} />}
      {bloqueio && (
        <Aviso tom="alerta" titulo="Somente leitura.">
          {bloqueio}
        </Aviso>
      )}
      {dia.fechado && (
        <Aviso tom="alerta" titulo={`O período ${dia.fechado} já foi fechado no DRE.`}>
          Este dia só pode ser consultado: não aceita lançar, corrigir nem remover.
        </Aviso>
      )}
      {!podeLancar && !dia.fechado && !bloqueio && (
        <Aviso titulo="Você pode ver este dia.">Lançar é com quem tem “lançar faturamento” nesta loja.</Aviso>
      )}
      {!dia.loja.ativa && <Aviso tom="alerta" titulo="Loja desativada.">Os dias antigos continuam aqui, mas ela não recebe lançamento novo.</Aviso>}
      {canais.length === 0 ? (
        <Aviso titulo="Nenhum canal de venda nesta loja.">Quem cuida da rede escolhe os canais em Lojas e marcas.</Aviso>
      ) : (
        <FormDoDia acao={acao} canais={canais} voltar={voltar} bloqueio={bloqueio} somenteLeitura={!podeLancar || !dia.loja.ativa} fechado={dia.fechado} />
      )}

      {podeLancar && remover && !dia.fechado && !bloqueio && removiveis.length > 0 && (
        <Painel titulo="Lançou no dia ou na loja errada?" subtitulo="Para corrigir um número, é só salvar o dia de novo. Remover serve para o que não deveria existir.">
          <div className="space-y-3">
            {removiveis.map((c) => (
              <FormRemover key={c.canal} acao={remover(c.canal)} rotulo={CANAIS[c.canal].rotulo} versao={c.humano!.versao} voltar={voltar} />
            ))}
          </div>
        </Painel>
      )}

      <Painel titulo="Alterações deste dia" subtitulo="O antes e o depois de cada lançamento, com quem e quando." semRespiro>
        {dia.historico.length === 0 ? (
          <p className="px-4 py-6 text-sm text-suave sm:px-5">Nada lançado neste dia ainda.</p>
        ) : (
          <ListaHistorico linhas={dia.historico} compacta />
        )}
      </Painel>
    </div>
  );
}
