/**
 * Integrações do parceiro (INT-1.8, segunda parte; decisão 491) — só leitura. As lojas do iFood ligadas às lojas do alcance da
 * pessoa e o estado de cada módulo, com o que fazer quando depende da loja. Ligar, ativar e pausar são da FlowFoods (na
 * Central do nível 1); aqui o pedido de conexão é falar com a FlowFoods.
 */

import { WHATSAPP_NUMERO } from '@/lib/constants';
import type { ReactNode } from 'react';
import { MODULO_PARA_O_PARCEIRO, type CapacidadesIfoodDaLoja, type IntegracaoParaOParceiro } from '@/lib/integracoes/core/do-parceiro';
import type { Modulo } from '@/lib/integracoes/core/campos';
import { LINK_DE_TEXTO } from '@/components/erp/ui/estilos';
import { Aviso, Contagem, Painel, Selo, Vazio } from '@/components/erp/ui/superficies';
import { InstanteDaIntegracao } from './data-da-situacao';

/** O pedido de conexão: uma conversa no WhatsApp da FlowFoods, com o assunto já escrito. */
const PEDIR_LIGACAO = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent('Olá, Rodolfo! Quero ligar uma loja do iFood no ERP da FlowFoods.')}`;

const DIA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });

const CAPACIDADES_PREVISTAS = [
  { modulo: 'ANALYTICS', dependencia: 'Depende da autorização de Analytics na loja e da conferência da primeira leitura de vendas.' },
  { modulo: 'FINANCIAL', dependencia: 'Depende da autorização do app Finanças na loja e da conferência das fontes de repasse.' },
  { modulo: 'MERCHANT', dependencia: 'A consulta de horários e pausas depende de vincular a loja do iFood e liberar essa função.' },
  { modulo: 'REVIEW', dependencia: 'Depende da homologação do app de Avaliações, da autorização da loja e da validação da leitura.' },
] as const;

function ItensPrevistos({ cadastrados = [] }: { cadastrados?: readonly Modulo[] }) {
  return CAPACIDADES_PREVISTAS.filter(({ modulo }) => !cadastrados.includes(modulo)).map(({ modulo, dependencia }) => (
    <li key={modulo} className="min-w-0 space-y-1 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-texto">{MODULO_PARA_O_PARCEIRO[modulo]}</span>
        <Selo>Previsto</Selo>
      </div>
      <p className="text-[13px] text-suave">{dependencia}</p>
    </li>
  ));
}

function CapacidadesPorLoja({ lojas }: { lojas: readonly CapacidadesIfoodDaLoja[] }) {
  const comItens = lojas.filter(loja => loja.pausas.length > 0 || loja.desligadas.length > 0
    || CAPACIDADES_PREVISTAS.some(({ modulo }) => !loja.modulosCadastrados.includes(modulo)));
  if (comItens.length === 0) return null;
  return (
    <Painel titulo="Capacidades do iFood por loja" semRespiro>
      <ul className="divide-y divide-linha">
        {comItens.map(loja => (
          <li key={loja.id} className="min-w-0 pb-1">
            <h3 className="break-words px-4 pt-4 text-sm font-semibold text-texto sm:px-5">{loja.nome}</h3>
            <ul>
              <ItensPrevistos cadastrados={loja.modulosCadastrados} />
              {loja.pausas.map(pausa => (
                <li key={pausa.id} className="min-w-0 space-y-1 px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-texto">{MODULO_PARA_O_PARCEIRO[pausa.modulo]}</span>
                    <Selo tom="alerta">Pausado</Selo>
                  </div>
                  <p className="break-words text-[13px] text-suave">
                    {pausa.nomeNoIfood} · {pausa.estado === 'ERRO_PERMISSAO' ? 'Acesso recusado pelo iFood' : 'Pausa registrada'}
                    {' · '}<InstanteDaIntegracao valor={pausa.ocorridaEm?.toISOString() ?? null} vazio="Data não registrada" />
                  </p>
                </li>
              ))}
              {loja.desligadas.map(conexao => (
                <li key={conexao.id} className="min-w-0 space-y-1 px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 break-words text-sm font-medium text-texto">{conexao.nomeNoIfood}</span>
                    <Selo>Vínculo desligado</Selo>
                  </div>
                  <p className="text-[13px] text-suave">
                    Desligamento · <InstanteDaIntegracao valor={conexao.desligadaEm?.toISOString() ?? null} vazio="Data não registrada" />
                  </p>
                  {conexao.modulos.length > 0 && <p className="text-[13px] text-suave">
                    Capacidades cadastradas neste vínculo · {conexao.modulos.map(modulo => MODULO_PARA_O_PARCEIRO[modulo]).join(', ')}
                  </p>}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Painel>
  );
}

function ContatoDaFlowFoods() {
  return (
    <p className="text-[13px] text-suave">
      Para solicitar a ativação de uma loja ou conferir uma divergência no Portal do Parceiro,{' '}
      <a href={PEDIR_LIGACAO} target="_blank" rel="noopener noreferrer" className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center sm:min-h-0`}>
        fale com a FlowFoods no WhatsApp
      </a>
      . A equipe acompanha o pedido e gerencia a ativação no Barney.
    </p>
  );
}

export function CentralIntegracoesInformativa() {
  return (
    <div className="space-y-4">
      <Aviso titulo="Integrações aguardando liberação">
        A consulta de vínculos e leituras fica disponível após a liberação da Central pela FlowFoods.
      </Aviso>
      <Painel titulo="Capacidades do iFood" semRespiro>
        <ul className="divide-y divide-linha"><ItensPrevistos /></ul>
      </Painel>
      <ContatoDaFlowFoods />
    </div>
  );
}

export function TelaIntegracoes({ integracoes, painel, capacidades = [] }: {
  integracoes: IntegracaoParaOParceiro[]; painel?: ReactNode; capacidades?: CapacidadesIfoodDaLoja[];
}) {
  return (
    <div className="space-y-4">
      {painel === undefined ? <Aviso titulo="A busca automática dos números ainda não começou.">
        Quando começar, as vendas do iFood das lojas com Números de venda ativo entram sozinhas, com os dados até ontem.
      </Aviso> : painel}
      <CapacidadesPorLoja lojas={capacidades} />
      <Painel titulo="Lojas do iFood ligadas" acessorio={<Contagem>{integracoes.length}</Contagem>} semRespiro>
        {integracoes.length === 0 ? (
          <Vazio titulo="Nenhuma loja do iFood está ligada agora.">A FlowFoods liga cada loja do iFood à loja certa daqui. Para ligar uma loja, fale com a FlowFoods pelo WhatsApp, no link abaixo.</Vazio>
        ) : (
          <ul className="divide-y divide-linha">
            {integracoes.map((c) => (
              <li key={c.id} className="space-y-3 px-4 py-4 sm:px-5">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium text-texto">{c.nomeNoIfood}</h3>
                    {c.teste && <Selo tom="alerta">Loja de teste do iFood</Selo>}
                  </div>
                  <p className="text-[13px] text-suave">
                    Loja {c.loja}
                    {c.marca ? ` · marca ${c.marca}` : ''} · ligada em {DIA.format(c.ligadaEm)}
                  </p>
                </div>
                {c.modulos.length === 0 ? (
                  <p className="text-[13px] text-suave">Nenhum dado desta loja está sendo preparado ainda.</p>
                ) : (
                  <ul className="space-y-2">
                    {c.modulos.map((m) => (
                      <li key={m.id} className="space-y-1 rounded-[9px] border border-linha p-3">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium text-texto">{m.rotulo}</span>
                          <Selo tom={m.situacao.tom}>{m.situacao.rotulo}</Selo>
                        </div>
                        <p className="text-[13px] text-suave">{m.situacao.explicacao}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Painel>
      <ContatoDaFlowFoods />
    </div>
  );
}
