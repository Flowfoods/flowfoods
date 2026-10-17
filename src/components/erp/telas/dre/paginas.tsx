/**
 * Montagem das telas de despesa, período e plano comuns ao nível 1 e à pessoa do
 * parceiro (2.2a). As rotas só resolvem o contexto e a permissão, e passam as
 * actions já amarradas; a leitura passa pelo portão e pelo alcance, então despesa
 * de outra loja, da rede (para quem tem só lojas) ou de outro parceiro é 404.
 */

import { randomBytes } from 'node:crypto';
import { notFound } from 'next/navigation';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { dinheiroParaCampo } from '@/lib/erp/unidades';
import { tipoDaCompetencia, ehFiltroDeSituacao, lerMesDaLista, type FiltroDeSituacao } from '@/lib/erp/despesa-campos';
import { faltaLancar, lojasParaDespesa, listarDespesas, obterDespesa, podeVerDespesas, recorrentesEmFalta } from '@/lib/erp/despesas';
import { recusaDoFechamento, situacaoDoFechamento } from '@/lib/erp/dre-fechamento';
import { situacaoDasMetas } from '@/lib/erp/dre-metas';
import { chaveDaLinha } from '@/lib/erp/dre-plano';
import { COR } from '@/lib/erp/modulos';
import { situacaoDosPeriodos } from '@/lib/erp/periodos';
import { planoDoParceiro } from '@/lib/erp/plano';
import { pode, type Alcance } from '@/lib/erp/permissoes';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import type { Visao } from '@/lib/erp/visao';
import { PageHeader } from '../../ui/cabecalho';
import { TrilhaDaPagina } from '../../shell/trilha';
import { FiltroEmLinks } from '../../ui/filtros';
import { Aviso } from '../../ui/superficies';
import { Voltar } from '../cadastro/partes';
import { TelaDaDespesa } from './detalhe-despesa';
import { TelaDeDespesas } from './despesas';
import { fraseDaDespesa, fraseDoMesPassado, fraseDoPeriodo, type AcaoDeCadastro, type AcaoLocal, type AcaoMesPassado } from './estado';
import { FormDespesa, type InicialDaDespesa } from './form-despesa';
import { FormMesPassado } from './form-mes-passado';
import { TelaDoPlano } from './plano';
import { TelaDoFechamento } from './periodo-fechamento';
import { TelaDosPeriodos } from './periodos';

type Query = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

export interface ContextoDaTela {
  cliente: ClienteDoParceiro;
  alcance: Alcance;
  bloqueio: string | null;
  /** "Rede Completa", o nome da loja ou o parceiro (nível 1). */
  contexto: string;
  /** `/erp` ou `/rodolfo/erp/<slug>`. */
  raiz: string;
}

export async function PaginaDasDespesas({ c, lojasDoAlcance, query }: { c: ContextoDaTela; lojasDoAlcance: { id: string; nome: string }[]; query: Query }) {
  const hoje = hojeNoRio();
  const mes = lerMesDaLista(um(query.mes), hoje);
  const situacao: FiltroDeSituacao = ehFiltroDeSituacao(um(query.situacao)) ? (um(query.situacao) as FiltroDeSituacao) : 'todas';
  const daUrl = um(query.loja);
  const lojaId = daUrl && lojasDoAlcance.some((l) => l.id === daUrl) ? daUrl : undefined;
  const pagina = Number(um(query.pagina)) || 1;
  const lista = await listarDespesas(c.cliente, c.alcance, { mes, situacao, lojaId, pagina }, hoje);
  const faltam = podeVerDespesas(c.alcance)
    ? (await c.cliente.transacao((tx) => faltaLancar(tx, c.alcance, `${hoje.slice(0, 7)}-01`, hoje, hoje))).filter((f) => !lojaId || f.lojaId === lojaId)
    : [];
  const feito = fraseDaDespesa(um(query.feito)) ?? fraseDoMesPassado(um(query.feito), um(query.criadas));
  return (
    <TelaDeDespesas
      lista={lista}
      base={`${c.raiz}/dre/despesas`}
      raiz={c.raiz}
      contexto={c.contexto}
      hoje={hoje}
      mes={mes}
      situacao={situacao}
      lojaId={lojaId}
      lojas={lojasDoAlcance}
      podeLancar={pode(c.alcance, 'despesas.lancar')}
      podeVerDre={pode(c.alcance, 'dre.ver')}
      faltaLancar={faltam.map((f) => ({ descricao: f.descricao, mesAlvo: f.mesAlvo }))}
      feito={feito}
      bloqueio={c.bloqueio}
    />
  );
}

/** Os formulários de lançar: o de uma despesa, ou o das que repetem todo mês. */
export async function PaginaDeNovaDespesa({ c, visao, query, acoes }: { c: ContextoDaTela; visao: Visao; query: Query; acoes: { lancar: AcaoDeCadastro; mesPassado: AcaoMesPassado } }) {
  const hoje = hojeNoRio();
  const base = `${c.raiz}/dre/despesas`;
  const doMesPassado = um(query.modo) === 'mes-passado';
  const escolha = (
    <FiltroEmLinks
      rotulo="O que lançar"
      opcoes={[
        { href: `${base}/nova`, rotulo: 'Uma despesa', ativo: !doMesPassado },
        { href: `${base}/nova?modo=mes-passado`, rotulo: 'As do mês passado', ativo: doMesPassado },
      ]}
    />
  );
  if (doMesPassado) {
    const atual = hoje.slice(0, 7);
    const pedido = um(query.mes);
    const mes = pedido && /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) && pedido <= atual && pedido >= '2020-02' ? pedido : atual;
    const itens = await c.cliente.transacao((tx) => recorrentesEmFalta(tx, c.alcance, mes));
    const meses = [atual, mesAnterior(atual), mesAnterior(mesAnterior(atual))];
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <TrilhaDaPagina itens={[{ rotulo: 'Lançar as do mês passado' }]} />
        <Voltar href={base}>Voltar para as despesas</Voltar>
        <PageHeader icone="compras" cor={COR.dre} titulo="Lançar as do mês passado" subtitulo={`${c.contexto} · as que repetem todo mês`}>
          <div className="flex flex-wrap items-center gap-3">
            {escolha}
            <FiltroEmLinks rotulo="Mês a lançar" opcoes={meses.map((m) => ({ href: `${base}/nova?modo=mes-passado&mes=${m}`, rotulo: m === atual ? 'Este mês' : mesCurto(m), ativo: m === mes }))} />
          </div>
        </PageHeader>
        {itens.length === 0 ? (
          <Aviso tom="ok" titulo="Nada falta lançar neste mês.">
            As despesas que repetem todo mês já têm o lançamento dele. Para uma despesa nova, use “Uma despesa”.
          </Aviso>
        ) : (
          <FormMesPassado
            acao={acoes.mesPassado}
            itens={itens.map((i) => ({ origemId: i.origemId, descricao: i.descricao, linhaNome: i.linhaNome, lojaNome: i.lojaNome, linhaOculta: i.linhaOculta, valorCentavos: i.valorCentavos, vencimento: i.vencimento }))}
            mes={mes}
            envio={randomBytes(16).toString('hex')}
            voltar={base}
            bloqueio={c.bloqueio}
          />
        )}
      </div>
    );
  }
  const [plano, lj] = await Promise.all([planoDoParceiro(c.cliente), lojasParaDespesa(c.cliente, c.alcance)]);
  const linhas = plano.filter((l) => !l.calculada && l.ativa).map((l) => ({ chave: chaveDaLinha(l), nome: l.nome, grupo: l.grupo }));
  const lojaDaVisao = visao.tipo === 'loja' && lj.lojas.some((l) => l.id === visao.lojaId) ? visao.lojaId : lj.lojas.length === 1 && !lj.podeRede ? lj.lojas[0].id : '';
  const inicial: InicialDaDespesa = { lojaId: lojaDaVisao, linha: '', descricao: '', valor: '', tipo: 'mes', dia: hoje.split('-').reverse().join('/'), mes: hoje.slice(0, 7), de: '', ate: '', recorrente: false, vencimento: '' };
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: 'Lançar despesa' }]} />
      <Voltar href={base}>Voltar para as despesas</Voltar>
      <PageHeader icone="compras" cor={COR.dre} titulo="Lançar despesa" subtitulo={`${c.contexto} · aluguel, salário, luz e outras`}>
        {escolha}
      </PageHeader>
      <FormDespesa acao={acoes.lancar} linhas={linhas} lojas={lj.lojas} podeRede={lj.podeRede} inicial={inicial} hoje={hoje} envio={randomBytes(16).toString('hex')} versao="" voltar={base} rotuloDoBotao="Lançar despesa" bloqueio={c.bloqueio} />
    </div>
  );
}

function mesAnterior(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesCurto = (m: string) => `${MESES_CURTOS[Number(m.slice(5)) - 1]}/${m.slice(2, 4)}`;

export async function PaginaDaDespesa({ c, id, query, acoes }: { c: ContextoDaTela; id: string; query: Query; acoes: { pagar: AcaoDeCadastro; desfazer: AcaoDeCadastro; parar: AcaoDeCadastro; remover: AcaoDeCadastro } }) {
  const hoje = hojeNoRio();
  const d = await obterDespesa(c.cliente, c.alcance, id, hoje);
  if (!d) notFound();
  return (
    <>
      <TrilhaDaPagina itens={[{ rotulo: d.despesa.descricao }]} />
      <TelaDaDespesa d={d} base={`${c.raiz}/dre/despesas`} hoje={hoje} feito={fraseDaDespesa(um(query.feito))} podeLancar={pode(c.alcance, 'despesas.lancar')} bloqueio={c.bloqueio} acoes={acoes} />
    </>
  );
}

export async function PaginaDeEditarDespesa({ c, id, acao }: { c: ContextoDaTela; id: string; acao: AcaoDeCadastro }) {
  const hoje = hojeNoRio();
  const d = await obterDespesa(c.cliente, c.alcance, id, hoje);
  if (!d) notFound();
  const x = d.despesa;
  const [plano, lj] = await Promise.all([planoDoParceiro(c.cliente), lojasParaDespesa(c.cliente, c.alcance)]);
  // A linha e a loja que a despesa já tem entram na lista mesmo ocultas ou desativadas (não se perde o que já está lá).
  const linhas = plano.filter((l) => !l.calculada && (l.ativa || chaveDaLinha(l) === x.linhaChave)).map((l) => ({ chave: chaveDaLinha(l), nome: l.nome, grupo: l.grupo }));
  const lojas = x.lojaId && !lj.lojas.some((l) => l.id === x.lojaId) ? [...lj.lojas, { id: x.lojaId, nome: x.lojaNome ?? '', ativa: false }] : lj.lojas;
  const tipo = tipoDaCompetencia(x.competencia);
  const br = (s: string) => s.split('-').reverse().join('/');
  const inicial: InicialDaDespesa = {
    lojaId: x.lojaId ?? '',
    linha: x.linhaChave,
    descricao: x.descricao,
    valor: dinheiroParaCampo(x.valorCentavos),
    tipo,
    dia: br(x.competencia.inicio),
    mes: x.competencia.inicio.slice(0, 7),
    de: br(x.competencia.inicio),
    ate: br(x.competencia.fim),
    recorrente: x.recorrente,
    vencimento: x.vencimento ? br(x.vencimento) : '',
  };
  const voltar = `${c.raiz}/dre/despesas/${x.id}`;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: x.descricao, href: voltar }, { rotulo: 'Editar' }]} />
      <Voltar href={voltar}>Voltar para a despesa</Voltar>
      <PageHeader icone="compras" cor={COR.dre} titulo="Editar despesa" subtitulo={`${x.descricao} · ${c.contexto}`} />
      {d.fechado && (
        <Aviso tom="alerta" titulo={`Esta despesa cai no período ${d.fechado}, já fechado no DRE.`}>
          Valor, competência, linha e loja não mudam mais; descrição, vencimento e “repete todo mês” sim.
        </Aviso>
      )}
      <FormDespesa acao={acao} linhas={linhas} lojas={lojas} podeRede={lj.podeRede || x.lojaId === null} inicial={inicial} hoje={hoje} envio="" versao={x.versao} voltar={voltar} rotuloDoBotao="Salvar" bloqueio={c.bloqueio} periodoFechado={!!d.fechado} />
    </div>
  );
}

export async function PaginaDosPeriodos({ c, podeMudar, acao }: { c: ContextoDaTela; podeMudar: boolean; acao: AcaoLocal }) {
  const s = await situacaoDosPeriodos(c.cliente);
  return <TelaDosPeriodos s={s} raiz={c.raiz} contexto={c.contexto} podeMudar={podeMudar} podeVerDre={pode(c.alcance, 'dre.ver')} podeFechar={recusaDoFechamento(c.alcance) === null} acao={acao} bloqueio={c.bloqueio} />;
}

/** Um período: as condições para fechar, a fotografia, reabrir e as versões. Quem não fecha, ou período que não existe: 404. */
export async function PaginaDoFechamento({ c, inicio, query, acoes }: { c: ContextoDaTela; inicio: string; query: Query; acoes: { fechar: AcaoLocal; reabrir?: AcaoLocal } }) {
  const s = await situacaoDoFechamento(c.cliente, c.alcance, inicio);
  if (!s) notFound();
  return (
    <>
      <TrilhaDaPagina itens={[{ rotulo: s.periodo.nome }]} />
      <TelaDoFechamento s={s} raiz={c.raiz} contexto={c.contexto} feito={fraseDoPeriodo(um(query.feito)) ?? null} acoes={acoes} bloqueio={c.bloqueio} />
    </>
  );
}

export async function PaginaDoPlano({ c, acoes }: { c: ContextoDaTela; acoes: { criar: AcaoLocal; renomear: AcaoLocal; ocultar: AcaoLocal; metas: AcaoLocal } }) {
  const [plano, metas] = await Promise.all([planoDoParceiro(c.cliente), situacaoDasMetas(c.cliente, c.alcance)]);
  return <TelaDoPlano plano={plano} metas={metas} contexto={c.contexto} acoes={acoes} bloqueio={c.bloqueio} />;
}
