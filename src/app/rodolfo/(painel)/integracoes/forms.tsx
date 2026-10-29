'use client';

/**
 * Central de Integrações (INT-1.8, primeira parte) — formulários do nível 1. O servidor confere tudo de novo; aqui só se
 * escolhe e se confirma. O que tira acesso ou para a busca (bloquear, desligar, ativar, pausar) pede confirmação em dois
 * passos; cancelar devolve o foco ao botão que abriu. Depois de um envio com erro, o foco vai ao primeiro campo com erro (ou à
 * resposta); depois de um cadastro certo, o formulário limpa.
 */

import { useEffect, useRef, useState, type RefObject } from 'react';
import { useFormState } from 'react-dom';
import { BotaoEnviar } from '@/components/erp/ui/botoes';
import { AJUDA, CAMPO, Erro, MARCAR, ROTULO, Resultado, type EstadoForm } from '@/components/erp/ui/campos';
import { classeDeBotao } from '@/components/erp/ui/estilos';
import { Confirmacao } from '@/components/erp/telas/equipe/escolhas';
import {
  acaoDesligarConexao,
  acaoLigarConexao,
  acaoMarcarHomologacao,
  acaoMudarLiberacao,
  acaoMudarModulo,
  acaoPrepararModulo,
  acaoRegistrarApp,
} from './actions';

const MODULOS = [
  { valor: 'ANALYTICS', rotulo: 'Analytics (números da loja)' },
  { valor: 'FINANCIAL', rotulo: 'Financeiro' },
  { valor: 'REVIEW', rotulo: 'Avaliações' },
  { valor: 'MERCHANT', rotulo: 'Loja (status e horários)' },
];

/** A cada envio: com erro, foco no primeiro campo com erro (ou na resposta); com sucesso, limpa se for cadastro. */
function useFocoDoEnvio(estado: EstadoForm, form: RefObject<HTMLFormElement>, limparNoSucesso = false) {
  const vez = estado?.vez ?? 0;
  const ok = estado?.ok ?? false;
  useEffect(() => {
    const f = form.current;
    if (!vez || !f) return;
    if (ok) {
      if (limparNoSucesso) f.reset();
      return;
    }
    const alvo = f.querySelector<HTMLElement>('[aria-invalid="true"]') ?? f.querySelector<HTMLElement>('[data-resposta]');
    alvo?.focus();
  }, [vez, ok, form, limparNoSucesso]);
}

/** A resposta do envio, focável (o foco vem para cá quando o erro não é de um campo). */
function Resposta({ estado }: { estado: EstadoForm }) {
  return (
    <div data-resposta tabIndex={-1} className="outline-none">
      <Resultado estado={estado} />
    </div>
  );
}

/** Botão que abre uma confirmação; cancelar fecha e devolve o foco a ele. */
function useConfirmacao() {
  const [aberta, setAberta] = useState(false);
  const abridor = useRef<HTMLButtonElement>(null);
  const cancelar = () => {
    setAberta(false);
    requestAnimationFrame(() => abridor.current?.focus());
  };
  return { aberta, abrir: () => setAberta(true), cancelar, abridor };
}

export function FormCadastrarApp() {
  const [estado, enviar] = useFormState<EstadoForm, FormData>(acaoRegistrarApp, null);
  const form = useRef<HTMLFormElement>(null);
  useFocoDoEnvio(estado, form, true);
  const erro = (c: string) => estado?.erros?.[c];
  return (
    <form ref={form} action={enviar} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="app-ambiente" className={ROTULO}>
            Ambiente
          </label>
          <select id="app-ambiente" name="ambiente" defaultValue="PRODUCAO" className={CAMPO} aria-invalid={!!erro('ambiente')} aria-describedby="app-ambiente-erro">
            <option value="PRODUCAO">Produção</option>
            <option value="TEST">Ambiente de teste</option>
          </select>
          <Erro id="app-ambiente-erro" texto={erro('ambiente')} />
        </div>
        <div>
          <label htmlFor="app-categoria" className={ROTULO}>
            Categoria no iFood
          </label>
          <select id="app-categoria" name="categoria" defaultValue="BI" className={CAMPO} aria-invalid={!!erro('categoria')} aria-describedby="app-categoria-erro">
            <option value="BI">BI</option>
            <option value="FINANCAS">Finanças</option>
            <option value="AVALIACOES">Avaliações</option>
            <option value="TEST">Teste</option>
          </select>
          <Erro id="app-categoria-erro" texto={erro('categoria')} />
        </div>
      </div>
      <div>
        <label htmlFor="app-nome" className={ROTULO}>
          Nome do app
        </label>
        <input id="app-nome" name="nome" maxLength={80} autoComplete="off" className={CAMPO} aria-invalid={!!erro('nome')} aria-describedby="app-nome-ajuda app-nome-erro" />
        <p id="app-nome-ajuda" className={AJUDA}>
          Ex.: FlowFoods ERP · BI
        </p>
        <Erro id="app-nome-erro" texto={erro('nome')} />
      </div>
      <div>
        <label htmlFor="app-client-id" className={ROTULO}>
          Client ID
        </label>
        <input id="app-client-id" name="clientId" maxLength={100} autoComplete="off" spellCheck={false} className={`${CAMPO} font-mono`} aria-invalid={!!erro('clientId')} aria-describedby="app-client-id-ajuda app-client-id-erro" />
        <p id="app-client-id-ajuda" className={AJUDA}>
          Está no iFood Developer, em Meus aplicativos. O Client ID não é segredo.
        </p>
        <Erro id="app-client-id-erro" texto={erro('clientId')} />
      </div>
      <div>
        <label htmlFor="app-segredo" className={ROTULO}>
          Nome da variável do segredo
        </label>
        <input
          id="app-segredo"
          name="nomeDoSegredo"
          maxLength={64}
          autoComplete="off"
          spellCheck={false}
          className={`${CAMPO} font-mono`}
          aria-invalid={!!erro('nomeDoSegredo')}
          aria-describedby="app-segredo-ajuda app-segredo-erro"
        />
        <p id="app-segredo-ajuda" className={AJUDA}>
          Só o nome, ex.: IFOOD_BI_CLIENT_SECRET. O segredo em si vai no painel do Dokploy e nunca é colado aqui.
        </p>
        <Erro id="app-segredo-erro" texto={erro('nomeDoSegredo')} />
      </div>
      <fieldset aria-describedby="app-modulos-ajuda app-modulos-erro">
        <legend className={ROTULO}>Módulos que o app usa</legend>
        <p id="app-modulos-ajuda" className={`${AJUDA} mb-2 mt-0`}>
          BI usa só Analytics. Finanças: Financeiro e Loja. Avaliações: Avaliações e Loja. Teste: todos.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {MODULOS.map((m, i) => (
            <label key={m.valor} className="flex min-h-11 items-center gap-2.5 text-sm text-texto">
              <input
                type="checkbox"
                name="modulos"
                value={m.valor}
                className={MARCAR}
                defaultChecked={m.valor === 'ANALYTICS'}
                aria-invalid={i === 0 && !!erro('modulos') ? true : undefined}
              />
              {m.rotulo}
            </label>
          ))}
        </div>
        <Erro id="app-modulos-erro" texto={erro('modulos')} />
      </fieldset>
      <BotaoEnviar variante="secundario" pendente="Cadastrando…">
        Cadastrar app
      </BotaoEnviar>
      <Resposta estado={estado} />
    </form>
  );
}

/** Liberar (um passo) ou bloquear (com confirmação). Quem usa passa `key={liberado}`: ao virar, a confirmação fecha. */
export function FormLiberacao({ slug, liberado }: { slug: string; liberado: boolean }) {
  const [estado, enviar] = useFormState<EstadoForm, FormData>(acaoMudarLiberacao.bind(null, slug), null);
  const form = useRef<HTMLFormElement>(null);
  useFocoDoEnvio(estado, form);
  const c = useConfirmacao();
  return (
    <form ref={form} action={enviar} className="space-y-3">
      <input type="hidden" name="liberado" value={liberado ? 'nao' : 'sim'} />
      {liberado ? (
        c.aberta ? (
          <Confirmacao
            titulo="Bloquear o módulo Integração?"
            detalhe="O parceiro deixa de ver as integrações e nenhuma busca roda para ele. Nada é apagado; liberar de novo devolve o acesso."
            confirmar="Bloquear"
            tipoConfirmar="submit"
            onCancelar={c.cancelar}
          />
        ) : (
          <button ref={c.abridor} type="button" onClick={c.abrir} className={classeDeBotao('secundario', 'w-full')}>
            Bloquear módulo
          </button>
        )
      ) : (
        <BotaoEnviar variante="secundario" pendente="Liberando…" className="w-full">
          Liberar módulo
        </BotaoEnviar>
      )}
      <Resposta estado={estado} />
    </form>
  );
}

export function FormHomologacao({ slug, marcado }: { slug: string; marcado: boolean }) {
  const [estado, enviar] = useFormState<EstadoForm, FormData>(acaoMarcarHomologacao.bind(null, slug), null);
  const form = useRef<HTMLFormElement>(null);
  useFocoDoEnvio(estado, form);
  return (
    <form ref={form} action={enviar} noValidate className="space-y-3">
      <input type="hidden" name="valor" value={marcado ? 'nao' : 'sim'} />
      {!marcado && (
        <div>
          <label className="flex min-h-11 items-center gap-2.5 text-sm text-texto">
            <input type="checkbox" name="soTestes" value="sim" className={MARCAR} aria-invalid={!!estado?.erros?.soTestes} aria-describedby="so-testes-erro" />
            Este parceiro existe só para testes. Nenhum restaurante de verdade usa este acesso.
          </label>
          <Erro id="so-testes-erro" texto={estado?.erros?.soTestes} />
        </div>
      )}
      <BotaoEnviar variante="secundario" pendente="Gravando…" className="w-full">
        {marcado ? 'Tirar a marca de testes' : 'Marcar como parceiro de testes'}
      </BotaoEnviar>
      <Resposta estado={estado} />
    </form>
  );
}

export function FormLigarLoja({
  slug,
  lojas,
  marcas,
  ambienteRotulo,
}: {
  slug: string;
  lojas: { id: string; nome: string }[];
  marcas: { id: string; nome: string }[];
  ambienteRotulo: string;
}) {
  const [estado, enviar] = useFormState<EstadoForm, FormData>(acaoLigarConexao.bind(null, slug), null);
  const form = useRef<HTMLFormElement>(null);
  useFocoDoEnvio(estado, form, true);
  const erro = (c: string) => estado?.erros?.[c];
  return (
    <form ref={form} action={enviar} noValidate className="space-y-4">
      <p className="text-[13px] text-suave">
        Ambiente desta ligação: <span className="font-semibold text-texto">{ambienteRotulo}</span>. Ele vem da marca do parceiro, não se escolhe aqui.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ligar-loja" className={ROTULO}>
            Loja do parceiro
          </label>
          <select id="ligar-loja" name="lojaId" defaultValue="" className={CAMPO} aria-invalid={!!erro('lojaId')} aria-describedby="ligar-loja-erro">
            <option value="" disabled>
              Escolha a loja
            </option>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
          <Erro id="ligar-loja-erro" texto={erro('lojaId')} />
        </div>
        <div>
          <label htmlFor="ligar-marca" className={ROTULO}>
            Marca (opcional)
          </label>
          <select id="ligar-marca" name="marcaId" defaultValue="" className={CAMPO} aria-invalid={!!erro('marcaId')} aria-describedby="ligar-marca-erro">
            <option value="">Sem marca</option>
            {marcas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
          <Erro id="ligar-marca-erro" texto={erro('marcaId')} />
        </div>
      </div>
      <div>
        <label htmlFor="ligar-nome" className={ROTULO}>
          Nome da loja no iFood
        </label>
        <input id="ligar-nome" name="nomeExterno" maxLength={120} autoComplete="off" className={CAMPO} aria-invalid={!!erro('nomeExterno')} aria-describedby="ligar-nome-erro" />
        <Erro id="ligar-nome-erro" texto={erro('nomeExterno')} />
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <label htmlFor="ligar-id" className={ROTULO}>
            Id da loja no iFood
          </label>
          <input
            id="ligar-id"
            name="idExterno"
            maxLength={40}
            autoComplete="off"
            spellCheck={false}
            className={`${CAMPO} font-mono`}
            aria-invalid={!!erro('idExterno')}
            aria-describedby="ligar-id-ajuda ligar-id-erro"
          />
          <p id="ligar-id-ajuda" className={AJUDA}>
            Como aparece no Portal do Parceiro: 8-4-4-4-12 letras e números.
          </p>
          <Erro id="ligar-id-erro" texto={erro('idExterno')} />
        </div>
        <div>
          <label htmlFor="ligar-curto" className={ROTULO}>
            Id curto (opcional)
          </label>
          <input id="ligar-curto" name="idCurto" maxLength={40} autoComplete="off" spellCheck={false} className={`${CAMPO} font-mono`} aria-invalid={!!erro('idCurto')} aria-describedby="ligar-curto-erro" />
          <Erro id="ligar-curto-erro" texto={erro('idCurto')} />
        </div>
      </div>
      {erro('ambiente') && <p className="text-[13px] text-erro">{erro('ambiente')}</p>}
      <BotaoEnviar variante="primario" pendente="Ligando…">
        Ligar loja
      </BotaoEnviar>
      <Resposta estado={estado} />
    </form>
  );
}

export function FormDesligar({ slug, conexaoId, nome }: { slug: string; conexaoId: string; nome: string }) {
  const [estado, enviar] = useFormState<EstadoForm, FormData>(acaoDesligarConexao.bind(null, slug, conexaoId), null);
  const form = useRef<HTMLFormElement>(null);
  useFocoDoEnvio(estado, form);
  const c = useConfirmacao();
  return (
    <form ref={form} action={enviar} className="space-y-2">
      {c.aberta ? (
        <Confirmacao
          titulo={`Desligar ${nome}?`}
          detalhe="Os módulos ativos desta loja são pausados junto. A ligação fica no histórico; para voltar, ligue de novo."
          confirmar="Desligar"
          tipoConfirmar="submit"
          onCancelar={c.cancelar}
        />
      ) : (
        <button ref={c.abridor} type="button" onClick={c.abrir} className={classeDeBotao('secundario')}>
          Desligar loja
        </button>
      )}
      <Resposta estado={estado} />
    </form>
  );
}

export function FormPrepararModulo({ slug, conexaoId, opcoes, semOpcao }: { slug: string; conexaoId: string; opcoes: { valor: string; rotulo: string }[]; semOpcao: string }) {
  const [estado, enviar] = useFormState<EstadoForm, FormData>(acaoPrepararModulo.bind(null, slug, conexaoId), null);
  const form = useRef<HTMLFormElement>(null);
  useFocoDoEnvio(estado, form);
  const id = `preparar-${conexaoId}`;
  if (opcoes.length === 0) return <p className="text-[13px] text-suave">{semOpcao}</p>;
  return (
    <form ref={form} action={enviar} noValidate className="space-y-2">
      <label htmlFor={id} className={ROTULO}>
        Preparar módulo
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select id={id} name="appModulo" defaultValue="" className={`${CAMPO} min-w-0 flex-1`} aria-invalid={!!estado?.erros?.appModulo} aria-describedby={`${id}-erro`}>
          <option value="" disabled>
            Escolha o app e o módulo
          </option>
          {opcoes.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
        <BotaoEnviar variante="secundario" pendente="Preparando…">
          Preparar
        </BotaoEnviar>
      </div>
      <Erro id={`${id}-erro`} texto={estado?.erros?.appModulo} />
      <Resposta estado={estado} />
    </form>
  );
}

const PEDE_CONFIRMACAO: Record<string, { titulo: string; detalhe: string; confirmar: string }> = {
  ativar: { titulo: 'Ativar este módulo?', detalhe: 'Com o módulo ativo, a busca diária dos números desta loja vai rodar quando existir. Hoje nada é buscado.', confirmar: 'Ativar' },
  pausar: { titulo: 'Pausar este módulo?', detalhe: 'A busca desta loja para até você retomar. Nada é apagado.', confirmar: 'Pausar' },
};

/**
 * As ações que valem agora para um módulo, num formulário só (fica montado entre um estado e outro: a recusa do servidor
 * aparece aqui). Dando certo, a página volta com o aviso no topo.
 */
export function FormAcoesDoModulo({ slug, moduloId, acoes }: { slug: string; moduloId: string; acoes: readonly { acao: string; rotulo: string }[] }) {
  const [estado, enviar] = useFormState<EstadoForm, FormData>(acaoMudarModulo.bind(null, slug, moduloId), null);
  const form = useRef<HTMLFormElement>(null);
  useFocoDoEnvio(estado, form);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const abridores = useRef<Record<string, HTMLButtonElement | null>>({});
  const cancelar = () => {
    const quem = confirmando;
    setConfirmando(null);
    requestAnimationFrame(() => (quem ? abridores.current[quem]?.focus() : undefined));
  };
  const pede = confirmando ? PEDE_CONFIRMACAO[confirmando] : null;
  return (
    <form ref={form} action={enviar} className="space-y-2">
      {pede && confirmando ? (
        <>
          <input type="hidden" name="acao" value={confirmando} />
          <Confirmacao titulo={pede.titulo} detalhe={pede.detalhe} confirmar={pede.confirmar} tipoConfirmar="submit" onCancelar={cancelar} />
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          {acoes.map((a) =>
            PEDE_CONFIRMACAO[a.acao] ? (
              <button
                key={a.acao}
                ref={(el) => {
                  abridores.current[a.acao] = el;
                }}
                type="button"
                onClick={() => setConfirmando(a.acao)}
                className={classeDeBotao('secundario')}
              >
                {a.rotulo}
              </button>
            ) : (
              <BotaoEnviar key={a.acao} variante="secundario" pendente="Gravando…" nome="acao" valor={a.acao}>
                {a.rotulo}
              </BotaoEnviar>
            ),
          )}
        </div>
      )}
      <Resposta estado={estado} />
    </form>
  );
}
