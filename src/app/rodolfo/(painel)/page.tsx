/**
 * Início do nível 1 — a tela de entrada do /rodolfo (E5.1, decisão 469): os números do dia e "O que precisa de você"
 * (o mesmo componente do Início do parceiro), e embaixo os módulos, um card por tela.
 */

import { exigirNivel1 } from '@/lib/erp/contexto';
import { COR } from '@/lib/erp/modulos';
import { modulosDoNivel1 } from '@/lib/rodolfo/modulos';
import { painelDoNivel1 } from '@/lib/rodolfo/painel-do-dia';
import { agoraSP } from '@/lib/rodolfo/estado';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { HubDeModulos } from '@/components/erp/ui/hub';
import { PainelDoDiaNaTela } from '@/components/erp/telas/painel-do-dia';

export const dynamic = 'force-dynamic';

export default async function HubDoNivel1() {
  await exigirNivel1();
  const agora = agoraSP();
  const [painel, modulos] = await Promise.all([painelDoNivel1(agora), modulosDoNivel1()]);

  return (
    <div className="space-y-8">
      <PageHeader icone="inicio" cor={COR.inicio} titulo="Início" subtitulo={agora.setLocale('pt-BR').toFormat("cccc, d 'de' LLLL")} />
      <PainelDoDiaNaTela painel={painel} />
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
