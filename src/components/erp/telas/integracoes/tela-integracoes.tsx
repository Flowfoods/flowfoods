/**
 * Integrações do parceiro (INT-1.8, segunda parte; decisão 491) — só leitura. As lojas do iFood ligadas às lojas do alcance da
 * pessoa e o estado de cada módulo, com o que fazer quando depende da loja. Ligar, ativar e pausar são da FlowFoods (na
 * Central do nível 1); aqui o pedido de conexão é falar com a FlowFoods.
 */

import type { IntegracaoParaOParceiro } from '@/lib/integracoes/core/do-parceiro';
import { Aviso, Contagem, Painel, Selo, Vazio } from '@/components/erp/ui/superficies';

const DIA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });

export function TelaIntegracoes({ integracoes }: { integracoes: IntegracaoParaOParceiro[] }) {
  return (
    <div className="space-y-4">
      <Aviso titulo="A busca automática dos números ainda não começou.">
        Quando começar, as vendas do iFood de cada loja ativa entram sozinhas, com os dados até ontem.
      </Aviso>
      <Painel titulo="Lojas do iFood ligadas" acessorio={<Contagem>{integracoes.length}</Contagem>} semRespiro>
        {integracoes.length === 0 ? (
          <Vazio titulo="Nenhuma loja do iFood ligada ainda.">A FlowFoods liga cada loja do iFood à loja certa daqui. Para ligar uma loja, fale com a FlowFoods.</Vazio>
        ) : (
          <ul className="divide-y divide-linha">
            {integracoes.map((c) => (
              <li key={c.id} className="space-y-3 px-4 py-4 sm:px-5">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-texto">{c.nomeNoIfood}</span>
                    {c.teste && <Selo tom="alerta">Ambiente de teste</Selo>}
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
      <p className="text-[13px] text-suave">Para ligar outra loja do iFood, ou se algo aqui não bate com o Portal do Parceiro, fale com a FlowFoods.</p>
    </div>
  );
}
