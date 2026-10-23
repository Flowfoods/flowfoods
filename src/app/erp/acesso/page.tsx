/**
 * Seu acesso: dados da pessoa e a entrada pelo rosto (ativar neste aparelho,
 * ver e remover aparelhos). Senha continua sendo o caminho principal.
 */

import { exigirParceiroDaSessao } from '@/lib/erp/contexto';
import { listarLojasDoAlcance } from '@/lib/erp/estrutura';
import { CATALOGO, rotuloDasLojas, type ModuloDoCatalogo } from '@/lib/erp/permissoes';
import { listarRostos, podeAtivarRosto, rostosRemovidosEm } from '@/lib/erp/credenciais';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { Contagem, Painel, Vazio } from '@/components/erp/ui/superficies';
import { AjudaDeAcesso } from '@/app/entrar/ajuda';
import { classeDeBotao } from '@/components/erp/ui/estilos';
import { acaoAjudaDicas, acaoAjudaReabrir } from '../actions';
import { configDoRosto, rostoPossivel } from '@/lib/erp/rosto';
import { AtivarRosto, RemoverRosto } from './rosto';

export const dynamic = 'force-dynamic';

const DATA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
});

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
    emBreve: !!(m as ModuloDoCatalogo).emBreve,
    itens: Object.entries(m.permissoes)
      .filter(([p]) => alcance.permissoes.has(p as never))
      .map(([, d]) => d.rotulo),
  })).filter((m) => m.itens.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        icone="acesso"
        cor={COR.rede}
        titulo="Seu acesso"
        subtitulo={`${pessoa.usuario.nome} · ${pessoa.perfilRotulo ?? 'acesso próprio'} em ${parceiro.nome}`}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Painel titulo="Seus dados" className="self-start">
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-[12px] font-semibold text-suave">Nome</dt>
              <dd className="mt-1 text-texto">{pessoa.usuario.nome}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[12px] font-semibold text-suave">E-mail</dt>
              <dd className="mt-1 truncate text-texto">{pessoa.usuario.email}</dd>
            </div>
            <div>
              <dt className="text-[12px] font-semibold text-suave">Parceiros</dt>
              <dd className="mt-1 text-texto">{pessoa.parceiros.map((p) => p.nome).join(' · ')}</dd>
            </div>
          </dl>
          <AjudaDeAcesso className="mt-5 border-t border-linha pt-4" />
        </Painel>

        <div className="space-y-4">
          <Painel titulo={`O que você faz em ${parceiro.nome}`}>
            <div className="space-y-4">
              <p className="text-[14px] text-suave">
                <span className="font-semibold text-texto">{pessoa.perfilRotulo}</span>
                <span aria-hidden className="mx-2 text-suave">
                  ·
                </span>
                {onde}
              </p>
              {modulos.length === 0 ? (
                <p className="text-[13px] text-suave">
                  Seu acesso ainda não inclui nenhuma tela. Fale com quem cuida da equipe.
                </p>
              ) : (
                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  {modulos.map((m) => (
                    <div key={m.rotulo} className="min-w-0">
                      <dt className="text-[12px] font-semibold text-suave">
                        {m.rotulo}
                        {m.emBreve && (
                          <span className="ml-1.5 font-normal normal-case tracking-normal text-suave">· em breve</span>
                        )}
                      </dt>
                      <dd className="mt-1 text-[13px] leading-relaxed text-texto">{m.itens.join(' · ')}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="text-[12px] text-suave">Quem cuida da equipe muda o que você pode fazer.</p>
            </div>
          </Painel>
          <Painel titulo="Entrar com o rosto">
            <div className="space-y-4">
              <p className="text-[14px] leading-relaxed text-suave">
                No celular, entre usando o Face ID ou o reconhecimento facial do próprio aparelho, sem digitar a senha.
                Onde não houver rosto, vale a digital ou o bloqueio de tela.
              </p>
              <p className="text-[13px] leading-relaxed text-suave">
                A imagem do seu rosto nunca sai do aparelho: a FlowFoods não vê, não recebe e não guarda foto nenhuma. O
                aparelho confere que é você e manda só uma chave de segurança.
              </p>
              {rostoNoSite() ? (
                <AtivarRosto podeAtivar={podeAtivarRosto(pessoa)} secundario={rostos.length > 0} />
              ) : (
                <p className="text-[13px] text-suave">
                  A entrada pelo rosto liga quando o site estiver em endereço seguro (https).
                </p>
              )}
            </div>
          </Painel>

          <Painel titulo="Dicas" subtitulo="As caixinhas que explicam como cada tela funciona">
            <div className="space-y-4">
              <p className="text-[14px] leading-relaxed text-suave">
                {pessoa.ajuda.dicasLigadas ? (
                  <>
                    As dicas estão <span className="font-semibold text-texto">ligadas</span>. Fechou uma caixinha, ela só volta se o texto mudar.
                  </>
                ) : (
                  <>
                    As dicas estão <span className="font-semibold text-texto">desligadas</span>. O botão ? no alto continua mostrando a ajuda de cada tela.
                  </>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <form action={acaoAjudaDicas}>
                  <input type="hidden" name="dicas" value={pessoa.ajuda.dicasLigadas ? 'desligar' : 'ligar'} />
                  <button type="submit" className={classeDeBotao('secundario')}>
                    {pessoa.ajuda.dicasLigadas ? 'Desligar as dicas' : 'Ligar as dicas'}
                  </button>
                </form>
                {pessoa.ajuda.dicasLigadas && pessoa.ajuda.fechadas.length > 0 && (
                  <form action={acaoAjudaReabrir}>
                    <button type="submit" className={classeDeBotao('fantasma')}>
                      Mostrar de novo as que fechei
                    </button>
                  </form>
                )}
              </div>
            </div>
          </Painel>

          <Painel titulo="Aparelhos com entrada pelo rosto" acessorio={<Contagem>{rostos.length}</Contagem>} semRespiro>
            {rostos.length === 0 && removidosEm ? (
              <Vazio titulo="Seus aparelhos foram removidos.">
                Por segurança, a entrada pelo rosto saiu de todos os aparelhos em {DATA.format(removidosEm)}, quando sua
                senha foi redefinida. Você pode ativar de novo no celular que usa no dia a dia.
              </Vazio>
            ) : rostos.length === 0 ? (
              <Vazio titulo="Nenhum aparelho ainda.">Ative no celular que você usa no dia a dia.</Vazio>
            ) : (
              <ul>
                {rostos.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-4 border-t border-linha px-5 py-3.5 first:border-t-0"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-texto">{r.aparelho}</div>
                      <div className="text-[12px] text-suave">
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
    </div>
  );
}
