// Scanner avoid-ai-design, SD4d (P2) aceito: "Curva A · contado em 06/10 · venceu" é linha de apoio da lista densa, no padrão "A · B" das telas da 1.1–1.6.
/**
 * Planejar a contagem do dia (1.7), a MESMA tela no nível 1 e no parceiro:
 * o lugar (conservação: é onde se conta) e "quais" (vencidos pela frequência
 * da curva ABC, todos do lugar ou só a curva A) vêm marcados; o gerente
 * marca/desmarca à mão e começa. Quem já está noutra contagem aberta não
 * pode entrar (aparece com o nome dela). Filtros na URL; a lista é do
 * servidor (`planejamentoDoCiclo`).
 */

import type { PlanejamentoDoCiclo } from '@/lib/erp/contagem';
import { ROTULO_DE_QUAIS, type Quais } from '@/lib/erp/contagem-campos';
import { CONSERVACOES, ORDEM_DAS_CONSERVACOES, type Conservacao } from '@/lib/erp/validade';
import { COR } from '@/lib/erp/modulos';
import { formatarData } from '@/lib/erp/compra-campos';
import { formatarDinheiro, formatarQuantidade } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { FiltroEmLinks } from '../../ui/filtros';
import { Aviso } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { Voltar } from '../cadastro/partes';
import type { AcaoDeEstoque } from './estado';
import { FormPlanejarCiclo, type LinhaParaPlanejar } from './planejar-form';

export function lerFiltroDoPlanejamento(sp: Record<string, string | string[] | undefined>): { conservacao: Conservacao | ''; quais: Quais; insumo?: string } {
  const um = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '');
  const c = um('lugar');
  const q = um('quais');
  const insumo = um('insumo');
  return {
    conservacao: (ORDEM_DAS_CONSERVACOES as readonly string[]).includes(c) ? (c as Conservacao) : '',
    quais: q === 'todos' || q === 'A' ? q : 'vencidos',
    ...(/^[a-z0-9]{1,64}$/i.test(insumo) ? { insumo } : {}),
  };
}

const DIA_MES = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

function apoio(l: PlanejamentoDoCiclo['linhas'][number]): string {
  const partes = [`Curva ${l.classe}`];
  if (!l.ultima) partes.push('nunca contado aqui');
  else partes.push(`contado em ${DIA_MES.format(l.ultima)}`);
  if (l.situacao === 'vencido') partes.push(`venceu ${l.venceEm ? formatarData(l.venceEm, true) : ''}`.trim());
  else if (l.situacao === 'vence-hoje') partes.push('vence hoje');
  else if (l.situacao === 'em-dia' && l.venceEm) partes.push(`em dia até ${formatarData(l.venceEm, true)}`);
  return partes.join(' · ');
}

export function TelaPlanejarCiclo({
  p,
  base,
  contexto,
  filtro,
  acao,
  podePlanejar,
  bloqueio,
}: {
  p: PlanejamentoDoCiclo;
  base: string;
  contexto?: string;
  filtro: { conservacao: Conservacao | ''; quais: Quais; insumo?: string };
  acao: AcaoDeEstoque;
  podePlanejar: boolean;
  bloqueio: string | null;
}) {
  const aqui = `${base}/${p.loja.id}`;
  const href = (muda: Partial<{ conservacao: Conservacao | ''; quais: Quais }>) => {
    const g = { conservacao: filtro.conservacao, quais: filtro.quais, ...muda };
    const q = new URLSearchParams();
    if (g.conservacao) q.set('lugar', g.conservacao);
    if (g.quais !== 'vencidos') q.set('quais', g.quais);
    const s = q.toString();
    return `${aqui}/contagens/nova${s ? `?${s}` : ''}`;
  };
  const vencidos = p.linhas.filter((l) => l.situacao !== 'em-dia').length;
  const linhas: LinhaParaPlanejar[] = p.linhas.map((l) => ({
    insumoId: l.insumoId,
    nome: l.nome,
    conservacao: l.conservacao,
    apoio: apoio(l),
    vencido: l.situacao !== 'em-dia',
    quantidade: l.saldoMilesimos < 0 ? `−${formatarQuantidade(-l.saldoMilesimos, l.unidade)}` : formatarQuantidade(l.saldoMilesimos, l.unidade),
    valor: l.valorCentavos === null ? 'sem preço' : formatarDinheiro(l.valorCentavos),
    emOutraContagem: l.emOutraContagem,
    sugerido: l.sugerido,
  }));
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <TrilhaDaPagina itens={[{ rotulo: p.loja.nome, href: aqui }, { rotulo: 'Planejar contagem' }]} />
      <Voltar href={aqui}>Voltar para o estoque da {p.loja.nome}</Voltar>
      <PageHeader
        icone="estoque"
        cor={COR.estoque}
        titulo="Planejar contagem"
        subtitulo={[contexto, p.loja.nome, `${vencidos} ${vencidos === 1 ? 'insumo vencido' : 'insumos vencidos'} para contar`].filter(Boolean).join(' · ')}
      />
      {p.fechamentoAberto && (
        <Aviso tom="alerta" titulo="O fechamento do período está em andamento.">
          Conclua ou descarte o fechamento antes de começar outra contagem.
        </Aviso>
      )}
      <p className="max-w-3xl text-sm text-suave">
        Conte um pedaço por vez, pelo lugar. A frequência vem da curva ABC (o que mais pesa em valor): A a cada {p.regras.freqADias} dias, B a cada {p.regras.freqBDias}, C a cada {p.regras.freqCDias}. Vencido = passou da frequência desde a última contagem.
      </p>
      <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:flex-wrap">
        <FiltroEmLinks
          rotulo="Onde contar"
          opcoes={[
            { href: href({ conservacao: '' }), rotulo: 'Todos os lugares', ativo: !filtro.conservacao },
            ...ORDEM_DAS_CONSERVACOES.map((c) => ({ href: href({ conservacao: c }), rotulo: CONSERVACOES[c], ativo: filtro.conservacao === c })),
          ]}
        />
        <FiltroEmLinks
          rotulo="Quais insumos vêm marcados"
          opcoes={(['vencidos', 'todos', 'A'] as const).map((q) => ({ href: href({ quais: q }), rotulo: ROTULO_DE_QUAIS[q], ativo: filtro.quais === q && !filtro.insumo }))}
        />
      </div>
      <FormPlanejarCiclo
        key={`${filtro.conservacao}|${filtro.quais}|${filtro.insumo ?? ''}`}
        linhas={linhas}
        lugar={filtro.conservacao}
        acao={acao}
        bloqueio={bloqueio ?? (p.fechamentoAberto ? 'O fechamento do período está em andamento.' : podePlanejar ? null : 'Só gerente ou dona começam uma contagem.')}
      />
    </div>
  );
}
