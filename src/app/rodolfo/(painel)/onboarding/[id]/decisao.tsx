'use client';

/**
 * Painel de decisão do pedido (0.5): mover de etapa, ativar (com o link de
 * primeiro acesso mostrado UMA vez) e recusar com motivo. Um componente só,
 * sempre montado na página: a ativação revalida a tela e o pedido vira
 * "Ativado", mas o link que acabou de nascer precisa continuar à vista. O
 * resto (resumo de ativado e de recusado) é da página.
 *
 * Funciona sem JavaScript: cada bloco é um formulário com a action.
 */

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { gerarSlug } from '@/lib/erp/slug';
import { BotaoEnviar } from '@/components/erp/ui/botoes';
import { AJUDA, CAMPO, Erro, ROTULO } from '@/components/erp/ui/campos';
import { classeDeBotao } from '@/components/erp/ui/estilos';
import { Painel } from '@/components/erp/ui/superficies';
import { LinkGerado } from '@/components/erp/telas/equipe/link-gerado';
import type { EstadoDoPedido } from '../actions';

type Acao = (anterior: EstadoDoPedido, form: FormData) => Promise<EstadoDoPedido>;

export function DecisaoDoPedido({
  status,
  versao,
  padrao,
  ativar,
  mover,
  recusar,
}: {
  status: 'NOVO' | 'EM_CONVERSA' | 'ATIVADO' | 'RECUSADO';
  versao: number;
  padrao: { nomeParceiro: string; donoNome: string; donoEmail: string };
  ativar: Acao;
  mover: Acao;
  recusar: Acao;
}) {
  const [estAtivar, enviarAtivar] = useFormState<EstadoDoPedido, FormData>(ativar, null);
  const [estMover, enviarMover] = useFormState<EstadoDoPedido, FormData>(mover, null);
  const [estRecusar, enviarRecusar] = useFormState<EstadoDoPedido, FormData>(recusar, null);
  const [nome, setNome] = useState(padrao.nomeParceiro);
  const [slug, setSlug] = useState('');
  const [slugEditado, setSlugEditado] = useState(false);
  const slugMostrado = slugEditado ? slug : gerarSlug(nome);
  const e = estAtivar && !estAtivar.ok ? (estAtivar.erros ?? {}) : {};

  // O link acabou de nascer: fica à vista mesmo que a página já mostre "Ativado".
  if (estAtivar?.ok && estAtivar.ativacao) {
    const a = estAtivar.ativacao;
    return (
      <Painel titulo="Pedido ativado" subtitulo={`${a.nome} já existe e está ativo.`}>
        <div className="space-y-4">
          <p role="status" className="text-[13px] text-ok">
            {estAtivar.mensagem}
          </p>
          {a.link ? (
            <LinkGerado link={a.link} validade={a.validade} whatsapp={a.whatsapp} />
          ) : (
            <p className="rounded-[9px] border border-linha-forte bg-campo p-3 text-[13px] text-texto">
              Nenhum link novo: a pessoa já tem senha e entra pelo e-mail dela.
            </p>
          )}
          <p className="text-[12px] text-suave">
            O link aparece só agora e não fica guardado em lugar nenhum. Se perder, gere outro na Equipe do parceiro.
          </p>
        </div>
      </Painel>
    );
  }
  if (status === 'ATIVADO' || status === 'RECUSADO') return null;

  return (
    <Painel titulo="Decisão" subtitulo="O pedido é seu: avance a conversa, ative ou recuse.">
      <div className="space-y-6">
        <form action={enviarMover} className="space-y-2">
          <input type="hidden" name="versao" value={versao} />
          <input type="hidden" name="para" value={status === 'NOVO' ? 'EM_CONVERSA' : 'NOVO'} />
          <BotaoEnviar variante="secundario" className="w-full" pendente="Movendo…">
            {status === 'NOVO' ? 'Marcar como em conversa' : 'Voltar para Novo'}
          </BotaoEnviar>
          {estMover && (
            <p role={estMover.ok ? 'status' : 'alert'} className={`text-[13px] ${estMover.ok ? 'text-ok' : 'text-erro'}`}>
              {estMover.ok ? estMover.mensagem : estMover.erros?.geral}
            </p>
          )}
        </form>

        <form action={enviarAtivar} className="space-y-4 border-t border-linha pt-5">
          <h3 className="text-[13px] font-semibold text-texto">Ativar</h3>
          <p className="text-[13px] text-suave">
            Cria o parceiro já ativo, o dono (com a rede inteira) e o link para ele criar a senha.
          </p>
          <input type="hidden" name="versao" value={versao} />
          <div>
            <label htmlFor="ativar-nome" className={ROTULO}>
              Nome do parceiro
            </label>
            <input
              id="ativar-nome"
              name="nomeParceiro"
              value={nome}
              onChange={(ev) => setNome(ev.target.value)}
              required
              maxLength={80}
              autoComplete="off"
              aria-invalid={!!e.nomeParceiro}
              aria-describedby="ativar-nome-erro"
              className={CAMPO}
            />
            <Erro id="ativar-nome-erro" texto={e.nomeParceiro} />
          </div>
          <div>
            <label htmlFor="ativar-slug" className={ROTULO}>
              Link do parceiro
            </label>
            <div className="flex items-stretch overflow-hidden rounded-[7px] border border-linha-forte bg-campo focus-within:border-texto/40">
              <span className="flex items-center whitespace-nowrap border-r border-linha px-2.5 text-[13px] text-suave">/erp/</span>
              <input
                id="ativar-slug"
                name="slug"
                value={slugMostrado}
                onChange={(ev) => {
                  setSlugEditado(true);
                  setSlug(ev.target.value.toLowerCase());
                }}
                maxLength={48}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={!!e.slug}
                aria-describedby="ativar-slug-erro ativar-slug-dica"
                className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-sm text-texto outline-none placeholder:text-suave/70 sm:min-h-[42px]"
              />
            </div>
            <p id="ativar-slug-dica" className={AJUDA}>
              Gerado do nome; pode editar agora. Depois de criado, não muda.
            </p>
            <Erro id="ativar-slug-erro" texto={e.slug} />
          </div>
          <div>
            <label htmlFor="ativar-dono" className={ROTULO}>
              Nome do dono
            </label>
            <input
              id="ativar-dono"
              name="donoNome"
              defaultValue={padrao.donoNome}
              required
              maxLength={80}
              autoComplete="off"
              aria-invalid={!!e.donoNome}
              aria-describedby="ativar-dono-erro"
              className={CAMPO}
            />
            <Erro id="ativar-dono-erro" texto={e.donoNome} />
          </div>
          <div>
            <label htmlFor="ativar-email" className={ROTULO}>
              E-mail do dono
            </label>
            <input
              id="ativar-email"
              name="donoEmail"
              type="email"
              defaultValue={padrao.donoEmail}
              required
              maxLength={160}
              autoComplete="off"
              aria-invalid={!!e.donoEmail}
              aria-describedby="ativar-email-erro"
              className={CAMPO}
            />
            <Erro id="ativar-email-erro" texto={e.donoEmail} />
          </div>
          {e.geral && (
            <p role="alert" className="text-[13px] text-erro">
              {e.geral}
            </p>
          )}
          <BotaoEnviar className="w-full" pendente="Ativando…">
            Ativar e criar acesso
          </BotaoEnviar>
        </form>

        <details className="border-t border-linha pt-5" open={!!estRecusar && !estRecusar.ok}>
          <summary className={`${classeDeBotao('perigo', 'w-full cursor-pointer list-none [&::-webkit-details-marker]:hidden')}`}>Recusar este pedido</summary>
          <form action={enviarRecusar} className="mt-3 space-y-3">
            <input type="hidden" name="versao" value={versao} />
            <div>
              <label htmlFor="recusar-motivo" className={ROTULO}>
                Motivo
              </label>
              <input
                id="recusar-motivo"
                name="motivo"
                required
                minLength={3}
                maxLength={200}
                autoComplete="off"
                placeholder="Ex.: fora da região atendida"
                aria-invalid={!!(estRecusar && !estRecusar.ok && estRecusar.erros?.motivo)}
                aria-describedby="recusar-motivo-erro"
                className={CAMPO}
              />
              <p className={AJUDA}>Obrigatório. Fica no histórico, ao lado de quem recusou. Nada é criado.</p>
              <Erro id="recusar-motivo-erro" texto={estRecusar && !estRecusar.ok ? estRecusar.erros?.motivo : undefined} />
            </div>
            <BotaoEnviar variante="perigo" className="w-full" pendente="Recusando…">
              Recusar pedido
            </BotaoEnviar>
          </form>
        </details>
      </div>
    </Painel>
  );
}

/** Excluir os dados pessoais de um pedido recusado (LGPD). A confirmação é abrir o bloco. */
export function ExcluirDados({ excluir, jaExcluido }: { excluir: (anterior: EstadoDoPedido) => Promise<EstadoDoPedido>; jaExcluido: boolean }) {
  const [estado, enviar] = useFormState<EstadoDoPedido, FormData>(excluir as unknown as Acao, null);
  if (jaExcluido) return <p className="text-[13px] text-suave">Os dados pessoais deste pedido já foram excluídos.</p>;
  return (
    <details>
      <summary className={classeDeBotao('perigo', 'w-full cursor-pointer list-none [&::-webkit-details-marker]:hidden')}>Excluir dados pessoais</summary>
      <form action={enviar} className="mt-3 space-y-3">
        <p className="text-[13px] text-suave">
          Apaga nome, WhatsApp, e-mail e cidade deste pedido. O cartão e o histórico ficam, sem dado pessoal. Não dá para desfazer.
        </p>
        <BotaoEnviar variante="perigo" className="w-full" pendente="Excluindo…">
          Excluir dados pessoais
        </BotaoEnviar>
        {estado && (
          <p role={estado.ok ? 'status' : 'alert'} className={`text-[13px] ${estado.ok ? 'text-ok' : 'text-erro'}`}>
            {estado.ok ? estado.mensagem : estado.erros?.geral}
          </p>
        )}
      </form>
    </details>
  );
}
