/**
 * Seu acesso: dados da pessoa e a entrada pelo rosto (ativar neste aparelho,
 * ver e remover aparelhos). Senha continua sendo o caminho principal.
 */

import { exigirParceiroDaSessao } from '@/lib/erp/contexto';
import { listarRostos, podeAtivarRosto } from '@/lib/erp/credenciais';
import { Painel, Vazio } from '@/app/rodolfo/erp/ui';
import { AjudaDeAcesso } from '@/app/entrar/ajuda';
import { configDoRosto, rostoPossivel } from '@/lib/erp/rosto';
import { AtivarRosto, RemoverRosto } from './rosto';

export const dynamic = 'force-dynamic';

const DATA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });

function rostoNoSite(): boolean {
  try {
    return rostoPossivel(configDoRosto());
  } catch {
    return false;
  }
}

export default async function SeuAcessoPage() {
  const { pessoa } = await exigirParceiroDaSessao();
  const rostos = await listarRostos(pessoa.usuario.id);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <Painel titulo="Seus dados" className="self-start">
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-surface/45">Nome</dt>
            <dd className="mt-1 text-surface">{pessoa.usuario.nome}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-surface/45">E-mail</dt>
            <dd className="mt-1 truncate text-surface">{pessoa.usuario.email}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-surface/45">Parceiros</dt>
            <dd className="mt-1 text-surface">{pessoa.parceiros.map((p) => p.nome).join(' · ')}</dd>
          </div>
        </dl>
        <AjudaDeAcesso className="mt-5 border-t border-white/[0.07] pt-4" />
      </Painel>

      <div className="space-y-4">
        <Painel titulo="Entrar com o rosto">
          <div className="space-y-4">
            <p className="text-[14px] leading-relaxed text-surface/70">
              No celular, entre usando o Face ID ou o reconhecimento facial do próprio aparelho, sem digitar a senha. Onde não
              houver rosto, vale a digital ou o bloqueio de tela.
            </p>
            <p className="text-[13px] leading-relaxed text-surface/50">
              A imagem do seu rosto nunca sai do aparelho: a FlowFoods não vê, não recebe e não guarda foto nenhuma. O
              aparelho confere que é você e manda só uma chave de segurança.
            </p>
            {rostoNoSite() ? (
              <AtivarRosto podeAtivar={podeAtivarRosto(pessoa)} secundario={rostos.length > 0} />
            ) : (
              <p className="text-[13px] text-surface/55">A entrada pelo rosto liga quando o site estiver em endereço seguro (https).</p>
            )}
          </div>
        </Painel>

        <Painel
          titulo="Aparelhos com entrada pelo rosto"
          acessorio={<span className="text-[11px] tabular-nums text-surface/40">{rostos.length}</span>}
          semRespiro
        >
          {rostos.length === 0 ? (
            <Vazio titulo="Nenhum aparelho ainda.">Ative no celular que você usa no dia a dia.</Vazio>
          ) : (
            <ul>
              {rostos.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-4 border-t border-white/[0.06] px-5 py-3.5 first:border-t-0">
                  <div className="min-w-0">
                    <div className="font-medium text-surface">{r.aparelho}</div>
                    <div className="text-[12px] text-surface/45">
                      Ativado em {DATA.format(r.criadoEm)}
                      {r.ultimoUsoEm ? ` · último uso ${DATA.format(r.ultimoUsoEm)}` : ' · ainda não usado'}
                    </div>
                  </div>
                  <RemoverRosto id={r.id} aparelho={r.aparelho} />
                </li>
              ))}
            </ul>
          )}
        </Painel>
      </div>
    </div>
  );
}
