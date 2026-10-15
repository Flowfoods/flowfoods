/**
 * ERP — acessos das pessoas do parceiro (nível 1): quem entra no ERP deste
 * parceiro, criar acesso com link de primeiro acesso, gerar link novo,
 * desativar e reativar. Tudo com antes/depois no histórico do parceiro.
 * Perfis, setores e acesso por loja chegam na 0.4.
 */

import Link from 'next/link';
import { exigirParceiro } from '@/lib/erp/contexto';
import { listarAcessos } from '@/lib/erp/credenciais';
import { listarHistorico } from '@/lib/erp/historico';
import { ListaHistorico } from '../../historico-lista';
import { Painel, Ponto, Vazio } from '../../ui';
import { AcoesDoAcesso, FormNovoAcesso } from './forms';

export const dynamic = 'force-dynamic';

const QUANDO = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});
const quando = (d: Date) => QUANDO.format(d).replace(',', ' às');

export default async function AcessosPage({ params }: { params: { slug: string } }) {
  const { parceiro, cliente } = await exigirParceiro(params.slug);
  const [acessos, historico] = await Promise.all([
    listarAcessos(parceiro.id),
    listarHistorico(cliente, { entidade: 'AcessoParceiro', limite: 5 }),
  ]);
  const ativos = acessos.filter((a) => a.status === 'ATIVO').length;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
      <div className="order-2 min-w-0 space-y-4 lg:order-1">
        <Painel
          titulo="Pessoas com acesso"
          acessorio={
            <span className="text-[11px] tabular-nums text-surface/40">
              {ativos} {ativos === 1 ? 'pessoa' : 'pessoas'}
            </span>
          }
          semRespiro
        >
          {acessos.length === 0 ? (
            <Vazio titulo="Ninguém do parceiro entra ainda.">
              Crie o primeiro acesso ao lado e mande o link para a pessoa.
            </Vazio>
          ) : (
            <ul>
              {acessos.map((a) => {
                const tom = a.status === 'DESATIVADO' ? 'suspenso' : a.senhaDefinida ? 'ativo' : 'rascunho';
                const rotulo = a.status === 'DESATIVADO' ? 'Desativado' : a.senhaDefinida ? 'Ativo' : 'Aguardando senha';
                return (
                  <li key={a.acessoId} className="space-y-3 border-t border-white/[0.06] px-5 py-4 first:border-t-0">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                      <div className="min-w-0">
                        <div className={`font-medium ${a.status === 'DESATIVADO' ? 'text-surface/50' : 'text-surface'}`}>
                          {a.nome}
                        </div>
                        <div className="truncate text-[12px] text-surface/45">{a.email}</div>
                      </div>
                      <div className="flex items-center gap-2 text-[12px] text-surface/70">
                        <Ponto tom={tom} />
                        {rotulo}
                      </div>
                    </div>
                    <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-surface/50">
                      <div>
                        <dt className="inline">Último acesso: </dt>
                        <dd className="inline tabular-nums text-surface/70">
                          {a.ultimoLogin ? quando(a.ultimoLogin) : 'nunca entrou'}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline">Entrar com o rosto: </dt>
                        <dd className="inline text-surface/70">
                          {a.rostos === 0 ? 'não ativou' : a.rostos === 1 ? '1 aparelho' : `${a.rostos} aparelhos`}
                        </dd>
                      </div>
                      {a.linkValeAte && a.status === 'ATIVO' && (
                        <div>
                          <dt className="inline">Link vale até: </dt>
                          <dd className="inline tabular-nums text-surface/70">{quando(a.linkValeAte)}</dd>
                        </div>
                      )}
                    </dl>
                    <AcoesDoAcesso slug={parceiro.slug} acessoId={a.acessoId} status={a.status} />
                  </li>
                );
              })}
            </ul>
          )}
        </Painel>

        <Painel
          titulo="Últimas mudanças nos acessos"
          acessorio={
            <Link
              href={`/rodolfo/erp/${parceiro.slug}/historico?entidade=AcessoParceiro`}
              className="text-[11px] text-surface/50 transition hover:text-surface"
            >
              Ver tudo →
            </Link>
          }
          semRespiro
        >
          {historico.length === 0 ? <Vazio titulo="Nada registrado ainda." /> : <ListaHistorico linhas={historico} compacta />}
        </Painel>
      </div>

      <Painel titulo="Novo acesso" className="order-1 self-start lg:order-2">
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-surface/55">
            A pessoa recebe um link para criar a própria senha. Depois entra em <span className="text-surface">/entrar</span>{' '}
            e pode ativar a entrada pelo rosto no celular.
          </p>
          <FormNovoAcesso slug={parceiro.slug} />
        </div>
      </Painel>
    </div>
  );
}
