/**
 * Integrações do parceiro (INT-1.8, segunda parte; decisão 491) — só leitura. As lojas do iFood ligadas às lojas do alcance da
 * pessoa e o estado de cada módulo, com o que fazer quando depende da loja. Ligar, ativar e pausar são da FlowFoods (na
 * Central do nível 1); aqui o pedido de conexão é falar com a FlowFoods.
 */

import { WHATSAPP_NUMERO } from '@/lib/constants';
import type { IntegracaoParaOParceiro } from '@/lib/integracoes/core/do-parceiro';
import { LINK_DE_TEXTO } from '@/components/erp/ui/estilos';
import { Aviso, Contagem, Painel, Selo, Vazio } from '@/components/erp/ui/superficies';

/** O pedido de conexão: uma conversa no WhatsApp da FlowFoods, com o assunto já escrito. */
const PEDIR_LIGACAO = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent('Olá, Rodolfo! Quero ligar uma loja do iFood no ERP da FlowFoods.')}`;

const DIA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });

export function TelaIntegracoes({ integracoes }: { integracoes: IntegracaoParaOParceiro[] }) {
  return (
    <div className="space-y-4">
      <Aviso titulo="A busca automática dos números ainda não começou.">
        Quando começar, as vendas do iFood das lojas com Números de venda ativo entram sozinhas, com os dados até ontem.
      </Aviso>
      <Painel titulo="Lojas do iFood ligadas" acessorio={<Contagem>{integracoes.length}</Contagem>} semRespiro>
        {integracoes.length === 0 ? (
          <Vazio titulo="Nenhuma loja do iFood ligada ainda.">A FlowFoods liga cada loja do iFood à loja certa daqui. Para ligar uma loja, fale com a FlowFoods pelo WhatsApp, no link abaixo.</Vazio>
        ) : (
          <ul className="divide-y divide-linha">
            {integracoes.map((c) => (
              <li key={c.id} className="space-y-3 px-4 py-4 sm:px-5">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-medium text-texto">{c.nomeNoIfood}</h3>
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
      <p className="text-[13px] text-suave">
        Para ligar outra loja do iFood, ou se algo aqui não bate com o Portal do Parceiro,{' '}
        <a href={PEDIR_LIGACAO} target="_blank" rel="noopener noreferrer" className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center sm:min-h-0`}>
          fale com a FlowFoods no WhatsApp
        </a>
        .
      </p>
    </div>
  );
}
