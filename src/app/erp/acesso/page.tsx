/**
 * Seu acesso: dados da pessoa e a entrada pelo rosto (ativar neste aparelho,
 * ver e remover aparelhos). Senha continua sendo o caminho principal.
 */

import { exigirParceiroDaSessao } from '@/lib/erp/contexto';
import { listarLojasDoAlcance } from '@/lib/erp/estrutura';
import { CATALOGO, rotuloDasLojas } from '@/lib/erp/permissoes';
import { listarRostos, podeAtivarRosto, rostosRemovidosEm } from '@/lib/erp/credenciais';
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
  const { pessoa, alcance, cliente, parceiro } = await exigirParceiroDaSessao();
  const [rostos, removidosEm, lojas] = await Promise.all([
    listarRostos(pessoa.usuario.id),
    rostosRemovidosEm(pessoa.usuario.id),
    listarLojasDoAlcance(cliente, alcance),
  ]);
  const onde = rotuloDasLojas(alcance.lojas, new Map(lojas.map((l) => [l.id, l.nome])));
  const modulos = CATALOGO.map((m) => ({
    rotulo: m.rotulo,
    emBreve: 'emBreve' in m && m.emBreve,
    itens: Object.entries(m.permissoes)
      .filter(([p]) => alcance.permissoes.has(p as never))
      .map(([, d]) => d.rotulo),
  })).filter((m) => m.itens.length > 0);

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
        <Painel titulo={`O que você faz em ${parceiro.nome}`}>
          <div className="space-y-4">
            <p className="text-[14px] text-surface/70">
              <span className="font-semibold text-surface">{pessoa.perfilRotulo}</span>
              <span aria-hidden className="mx-2 text-surface/25">·</span>
              {onde}
            </p>
            {modulos.length === 0 ? (
              <p className="text-[13px] text-surface/50">Seu acesso ainda não inclui nenhuma tela. Fale com quem cuida da equipe.</p>
            ) : (
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {modulos.map((m) => (
                  <div key={m.rotulo} className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-surface/45">
                      {m.rotulo}
                      {m.emBreve && <span className="ml-1.5 font-normal normal-case tracking-normal text-surface/35">· em breve</span>}
                    </dt>
                    <dd className="mt-1 text-[13px] leading-relaxed text-surface/75">{m.itens.join(' · ')}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="text-[12px] text-surface/40">Quem cuida da equipe muda o que você pode fazer.</p>
          </div>
        </Painel>
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
          {rostos.length === 0 && removidosEm ? (
            <Vazio titulo="Seus aparelhos foram removidos.">
              Por segurança, a entrada pelo rosto saiu de todos os aparelhos em {DATA.format(removidosEm)}, quando sua senha
              foi redefinida. Você pode ativar de novo no celular que usa no dia a dia.
            </Vazio>
          ) : rostos.length === 0 ? (
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
