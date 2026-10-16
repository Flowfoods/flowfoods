/**
 * Hub do nível 1 — "Módulos da FlowFoods": a tela de entrada do /rodolfo.
 * Uma seção por módulo, um card por tela (as do Barney antigo e os Parceiros
 * Flow). "Hoje", que morava aqui, agora é /rodolfo/hoje.
 */

import { exigirNivel1 } from '@/lib/erp/contexto';
import { COR } from '@/lib/erp/modulos';
import { modulosDoNivel1 } from '@/lib/rodolfo/modulos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { HubDeModulos } from '@/components/erp/ui/hub';

export const dynamic = 'force-dynamic';

export default async function HubDoNivel1() {
  await exigirNivel1();
  const modulos = modulosDoNivel1();
  const telas = modulos.reduce((n, m) => n + m.grupos.reduce((k, g) => k + g.itens.length, 0), 0);

  return (
    <div className="space-y-8">
      <PageHeader
        icone="inicio"
        cor={COR.inicio}
        titulo="Módulos da FlowFoods"
        subtitulo={`Nível 1 · ${modulos.length} módulos, ${telas} telas`}
      />
      <HubDeModulos
        secoes={modulos.map((m) => ({
          rotulo: m.nome,
          cartoes: m.grupos.flatMap((g) =>
            g.itens.map((i) => ({
              chave: i.href,
              nome: i.rotulo,
              subtitulo: i.subtitulo,
              icone: i.icone,
              cor: m.cor,
              href: i.href,
            })),
          ),
        }))}
      />
    </div>
  );
}
