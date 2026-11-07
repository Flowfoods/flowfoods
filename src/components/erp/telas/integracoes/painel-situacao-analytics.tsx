/** Situação operacional de um dia/loja. Só GET e dados projetados pelo leitor autorizado. */
import Link from 'next/link';
import type {
  FonteDaSituacaoAnalytics, MensagemDaSituacaoAnalytics, ResultadoSituacaoAnalytics, SituacaoAnalyticsDaLoja,
} from '@/lib/integracoes/core/situacao-analytics-campos';
import { ontemDaSituacaoAnalytics } from '@/lib/integracoes/core/situacao-analytics-campos';
import { Campo, CAMPO } from '@/components/erp/ui/campos';
import { classeDeBotao, LINK_DE_TEXTO } from '@/components/erp/ui/estilos';
import { Aviso, Painel, Selo, Vazio } from '@/components/erp/ui/superficies';
import { diaDaIntegracao, InstanteDaIntegracao } from './data-da-situacao';

export interface PropsPainelSituacaoAnalytics {
  resultado: ResultadoSituacaoAnalytics;
  /** Rota atual, definida pela página; não vem da resposta do provedor. */
  base: string;
  baseFaturamento?: string;
  ontem?: string;
  /** Contexto do parceiro no servidor; conserva TEST visível também em erro. */
  teste?: boolean;
}

function Situacao({ mensagem }: { mensagem: MensagemDaSituacaoAnalytics }) {
  return <Selo tom={mensagem.tom}><span className="whitespace-normal text-left">{mensagem.rotulo}</span></Selo>;
}

const COBERTURA: Record<SituacaoAnalyticsDaLoja['cobertura'], { titulo: string; texto: string; tom: 'neutro' | 'alerta' }> = {
  'sem-fontes': { titulo: 'Sem fonte de leitura para esta loja.', texto: 'A FlowFoods precisa conferir o vínculo da loja do iFood.', tom: 'neutro' },
  'sem-leitura': { titulo: 'Ainda sem leitura disponível para este dia.', texto: 'Ausência de leitura não confirma ausência de movimento.', tom: 'neutro' },
  parcial: { titulo: 'Ainda faltam leituras deste dia.', texto: 'Confira cada fonte abaixo. Uma versão disponível não representa toda a loja.', tom: 'alerta' },
  disponivel: { titulo: 'Leituras disponíveis para este dia.', texto: 'As datas são por fonte. A aplicação no faturamento é conferida separadamente.', tom: 'neutro' },
  'vinculo-ambiguo': { titulo: 'A identificação das fontes precisa de conferência.', texto: 'Os vínculos anteriores continuam visíveis; a FlowFoods precisa conferir qual fonte corresponde à loja.', tom: 'alerta' },
};

function Fonte({ fonte }: { fonte: FonteDaSituacaoAnalytics }) {
  const tentativa = fonte.tentativa;
  return (
    <li className="min-w-0 space-y-4 px-4 py-4 sm:px-5">
      <div className="space-y-1.5">
        <h3 className="break-words text-sm font-semibold text-texto">{fonte.nome}</h3>
        {fonte.marca && <p className="break-words text-[13px] text-suave">Marca {fonte.marca}</p>}
        {!fonte.vinculada && <p className="text-[13px] text-suave">Vínculo desligado; referência anterior preservada.</p>}
        {fonte.aplicada && <p className="text-[12px] text-suave">Fonte da aplicação registrada no faturamento.</p>}
      </div>
      <dl className="grid min-w-0 gap-5 md:grid-cols-3">
        <div className="min-w-0 space-y-2">
          <dt className="text-[12px] font-medium text-suave">Acesso</dt>
          <dd className="min-w-0 space-y-2">
            <Situacao mensagem={fonte.acesso} />
            <p className="text-[13px] leading-relaxed text-suave">{fonte.acesso.explicacao}</p>
          </dd>
        </div>
        <div className="min-w-0 space-y-2">
          <dt className="text-[12px] font-medium text-suave">Última tentativa do dia</dt>
          <dd className="min-w-0 space-y-2 text-[13px] text-suave">
            {tentativa ? <>
              <Situacao mensagem={tentativa.mensagem} />
              <p className="leading-relaxed">{tentativa.mensagem.explicacao}</p>
              {tentativa.iniciadaEm && <p>Iniciada em <InstanteDaIntegracao valor={tentativa.iniciadaEm} />.</p>}
              {tentativa.concluidaEm && <p>Encerrada em <InstanteDaIntegracao valor={tentativa.concluidaEm} />.</p>}
              {tentativa.estado === 'AGUARDANDO' && tentativa.naoAntesDe && <p className="text-texto">Nova tentativa não antes de <InstanteDaIntegracao valor={tentativa.naoAntesDe} />. Esse horário é um limite mínimo.</p>}
              {!tentativa.iniciadaEm && !tentativa.concluidaEm && <p>Ainda sem horário de tentativa registrado.</p>}
            </> : <p>Nenhuma tentativa registrada para este dia.</p>}
          </dd>
        </div>
        <div className="min-w-0 space-y-2">
          <dt className="text-[12px] font-medium text-suave">Versão disponível</dt>
          <dd className="space-y-2 text-[13px] text-suave">
            {fonte.versaoDisponivel ? <p className="text-texto">Publicada em <InstanteDaIntegracao valor={fonte.versaoDisponivel.publicadaEm} />.</p> : <p>Ainda sem leitura disponível para este dia.</p>}
            {fonte.revisaoPendente && <p>Há uma revisão pendente; ela ainda não substitui a versão disponível.</p>}
          </dd>
        </div>
      </dl>
    </li>
  );
}

export function PainelSituacaoAnalytics({ resultado, base, baseFaturamento, ontem = ontemDaSituacaoAnalytics(), teste = false }: PropsPainelSituacaoAnalytics) {
  const emTeste = teste || (resultado.ok && resultado.ambiente === 'TEST');
  const avisoTeste = emTeste ? <Aviso tom="alerta" titulo="Ambiente TEST — somente homologação.">Estas leituras são de teste e não entram no faturamento.</Aviso> : null;
  if (!resultado.ok) return (
    <div className="space-y-3">
      {avisoTeste}
      <Aviso tom="alerta" titulo="Não foi possível conferir a situação.">{resultado.mensagem}</Aviso>
      <Link href={base} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center`}>Voltar à consulta de situação</Link>
    </div>
  );
  const s = resultado.situacao;
  const cobertura = s ? COBERTURA[s.cobertura] : null;
  return (
    <div className="min-w-0 space-y-4">
      {avisoTeste}
      <Painel titulo="Situação dos números de venda" subtitulo="Uma loja e um dia por consulta. Horários de São Paulo.">
        {resultado.lojas.length ? (
          <form key={`${base}:${s?.loja.id ?? ''}:${resultado.dia}`} action={base} method="get" className="grid min-w-0 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,190px)_auto]" aria-label="Consultar situação da integração">
            <Campo id="situacao-loja" rotulo="Loja">
              <select id="situacao-loja" name="loja" defaultValue={s?.loja.id ?? ''} required className={CAMPO}>
                <option value="" disabled>Escolha uma loja</option>
                {resultado.lojas.map(loja => <option key={loja.id} value={loja.id}>{loja.nome}{loja.ativa ? '' : ' (inativa)'}</option>)}
              </select>
            </Campo>
            <Campo id="situacao-dia" rotulo="Dia">
              <input id="situacao-dia" name="dia" type="date" required defaultValue={resultado.dia} max={ontem} min="2000-01-01" className={CAMPO} />
            </Campo>
            <button type="submit" className={classeDeBotao('secundario')}>Consultar</button>
          </form>
        ) : <Vazio titulo="Nenhuma loja disponível para consulta.">O acesso às lojas precisa ser conferido pela FlowFoods.</Vazio>}
        {s && <p className="mt-4 break-words text-[13px] text-suave"><span className="font-medium text-texto">{s.loja.nome}</span> · {diaDaIntegracao(s.dia)} · {emTeste ? 'TEST' : 'Produção'}</p>}
      </Painel>
      {s && cobertura && <>
        <Aviso tom={cobertura.tom} titulo={cobertura.titulo}>{cobertura.texto}</Aviso>
        {s.fontes.length > 0 && <Painel titulo="Fontes deste dia" semRespiro><ul className="min-w-0 divide-y divide-linha">{s.fontes.map(fonte => <Fonte key={fonte.chave} fonte={fonte} />)}</ul></Painel>}
        <Painel titulo="Aplicação no faturamento">
          <div className="space-y-3 text-[13px] text-suave">
            {emTeste ? <p>Leituras TEST não são aplicadas ao faturamento.</p> : <>
              <Situacao mensagem={s.aplicacao.mensagem} />
              <p className="leading-relaxed">{s.aplicacao.mensagem.explicacao}</p>
            </>}
            {!emTeste && s.ambiente === 'PRODUCAO' && <>
              {s.aplicacao.aplicadoEm && <p className="text-texto">Aplicado ao faturamento em <InstanteDaIntegracao valor={s.aplicacao.aplicadoEm} />.</p>}
              {s.aplicacao.conferidaEm && <p>Última conferência da aplicação em <InstanteDaIntegracao valor={s.aplicacao.conferidaEm} />.</p>}
              {s.aplicacao.mantemAplicacaoAnterior && <p className="font-medium text-texto">Atualização pendente; aplicação anterior preservada.</p>}
              {s.podeVerFaturamento && baseFaturamento && <Link href={`${baseFaturamento}/${encodeURIComponent(s.loja.id)}/${s.dia}`} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center`}>Ver o faturamento deste dia</Link>}
            </>}
          </div>
        </Painel>
      </>}
    </div>
  );
}
