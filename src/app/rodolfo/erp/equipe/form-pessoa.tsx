'use client';

/**
 * Formulário de acesso de uma pessoa: criar (nome, e-mail, perfil, lojas,
 * setores) e editar (perfil, lojas, setores e ajuste fino). A tela só ajuda a
 * escolher: quem confere o que o ator pode dar é o servidor.
 */

import { useEffect, useMemo, useState } from 'react';
import { useFormState } from 'react-dom';
import { LISTA_DE_SETORES, SETORES } from '@/lib/erp/permissoes';
import { CAMPO, Enviar, Erro, ROTULO, Resultado } from '../campos';
import { Cartao, Etiqueta, GradeDePermissoes } from './escolhas';
import type { AcaoDeEquipe, EstadoEquipe } from './estado';
import { LinkGerado } from './link-gerado';

export interface OpcaoDePerfil {
  /** 'DONO' | 'GERENTE' | 'OPERADOR' | 'p:<id>' */
  valor: string;
  rotulo: string;
  resumo: string;
  permissoes: string[];
  setores: string[];
  proprio: boolean;
}

export interface OpcaoDeLoja {
  id: string;
  nome: string;
  ativa: boolean;
}

export interface ValoresDaPessoa {
  perfil: string;
  setores: string[];
  redeInteira: boolean;
  lojaIds: string[];
  extras: string[];
  removidas: string[];
}

const NOVA: ValoresDaPessoa = { perfil: '', setores: [], redeInteira: true, lojaIds: [], extras: [], removidas: [] };

function alternarEm(lista: string[], v: string, marcar: boolean) {
  return marcar ? Array.from(new Set([...lista, v])) : lista.filter((x) => x !== v);
}

export function FormPessoa({
  acao,
  modo,
  idBase,
  perfis,
  lojas,
  concediveis,
  atorRede,
  inicial = NOVA,
}: {
  acao: AcaoDeEquipe;
  modo: 'criar' | 'editar';
  idBase: string;
  perfis: OpcaoDePerfil[];
  lojas: OpcaoDeLoja[];
  concediveis: string[];
  atorRede: boolean;
  inicial?: ValoresDaPessoa;
}) {
  const [estado, enviar] = useFormState<EstadoEquipe, FormData>(acao, null);
  const podeDar = useMemo(() => new Set(concediveis), [concediveis]);
  const cabe = (o: OpcaoDePerfil) => o.permissoes.every((p) => podeDar.has(p));
  const primeiroQueCabe =
    perfis.find((o) => !o.proprio && cabe(o) && o.valor === 'OPERADOR')?.valor ?? perfis.find(cabe)?.valor ?? '';

  const [v, setV] = useState<ValoresDaPessoa>(() => ({
    ...inicial,
    perfil: inicial.perfil || primeiroQueCabe,
    redeInteira: atorRede ? inicial.redeInteira : false,
  }));
  const [perfilTocado, setPerfilTocado] = useState(modo === 'editar');
  const [sugerido, setSugerido] = useState<string | null>(null);

  // Criou: limpa para a próxima pessoa (o link continua visível embaixo).
  useEffect(() => {
    if (estado?.ok && modo === 'criar') {
      setV({ ...NOVA, perfil: primeiroQueCabe, redeInteira: atorRede });
      setPerfilTocado(false);
      setSugerido(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  const perfil = perfis.find((o) => o.valor === v.perfil);
  const doPerfil = useMemo(() => new Set(perfil?.permissoes ?? []), [perfil]);
  const marcada = (p: string) => (doPerfil.has(p) || v.extras.includes(p)) && !v.removidas.includes(p);
  const alternar = (p: string) =>
    setV((x) =>
      doPerfil.has(p)
        ? { ...x, removidas: alternarEm(x.removidas, p, !x.removidas.includes(p)) }
        : { ...x, extras: alternarEm(x.extras, p, !x.extras.includes(p)) },
    );
  const aMais = v.extras.filter((p) => !doPerfil.has(p)).length;
  const aMenos = v.removidas.filter((p) => doPerfil.has(p)).length;

  function marcarSetor(s: string, marcado: boolean) {
    const setores = alternarEm(v.setores, s, marcado);
    setV((x) => ({ ...x, setores }));
    // Setor não dá permissão; só sugere o perfil próprio pensado para ele.
    if (!perfilTocado && marcado) {
      const s2 = perfis.find((o) => o.proprio && cabe(o) && o.setores.includes(s));
      if (s2) {
        setV((x) => ({ ...x, setores, perfil: s2.valor }));
        setSugerido(SETORES[s as keyof typeof SETORES]);
      }
    }
  }

  const id = (n: string) => `${idBase}-${n}`;

  return (
    <div className="space-y-4">
      <form action={enviar} noValidate className="space-y-5">
        {modo === 'criar' && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <label htmlFor={id('nome')} className={ROTULO}>
                Nome da pessoa
              </label>
              <input
                id={id('nome')}
                name="nome"
                required
                maxLength={80}
                autoComplete="off"
                placeholder="Ex.: Maria Souza"
                className={CAMPO}
                aria-invalid={!!estado?.erros?.nome}
                aria-describedby={id('nome-erro')}
              />
              <Erro id={id('nome-erro')} texto={estado?.erros?.nome} />
            </div>
            <div>
              <label htmlFor={id('email')} className={ROTULO}>
                E-mail
              </label>
              <input
                id={id('email')}
                name="email"
                type="email"
                required
                maxLength={160}
                autoComplete="off"
                inputMode="email"
                placeholder="maria@restaurante.com.br"
                className={CAMPO}
                aria-invalid={!!estado?.erros?.email}
                aria-describedby={id('email-erro')}
              />
              <Erro id={id('email-erro')} texto={estado?.erros?.email} />
            </div>
          </div>
        )}

        <fieldset>
          <legend className={ROTULO}>Setores</legend>
          <div className="flex flex-wrap gap-1.5">
            {LISTA_DE_SETORES.map((s) => (
              <Etiqueta
                key={s}
                name="setores"
                value={s}
                checked={v.setores.includes(s)}
                onChange={(m) => marcarSetor(s, m)}
              >
                {SETORES[s]}
              </Etiqueta>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-surface/40">
            Setor organiza a equipe. O que a pessoa pode fazer vem do perfil.
          </p>
        </fieldset>

        <fieldset>
          <legend className={ROTULO}>Perfil</legend>
          <div className="space-y-1.5">
            {perfis.map((o) => (
              <Cartao
                key={o.valor}
                name="perfil"
                value={o.valor}
                checked={v.perfil === o.valor}
                onChange={() => {
                  setV((x) => ({ ...x, perfil: o.valor }));
                  setPerfilTocado(true);
                  setSugerido(null);
                }}
                titulo={o.rotulo}
                nota={!cabe(o) ? 'acima do seu acesso' : o.proprio ? 'perfil próprio' : undefined}
                detalhe={o.resumo}
                disabled={!cabe(o)}
              />
            ))}
          </div>
          {sugerido && (
            <p className="mt-1.5 text-[12px] text-surface/50">Sugerido para quem é de {sugerido}. Pode trocar.</p>
          )}
          <Erro id={id('perfil-erro')} texto={estado?.erros?.perfil} />
        </fieldset>

        <fieldset>
          <legend className={ROTULO}>Lojas</legend>
          <div className="space-y-1.5">
            <Cartao
              name="lojas"
              value="rede"
              checked={v.redeInteira}
              onChange={() => setV((x) => ({ ...x, redeInteira: true }))}
              titulo="Rede inteira"
              detalhe="Todas as lojas, inclusive as que forem abertas depois."
              nota={!atorRede ? 'acima do seu acesso' : undefined}
              disabled={!atorRede}
            />
            <Cartao
              name="lojas"
              value="escolhidas"
              checked={!v.redeInteira}
              onChange={() => setV((x) => ({ ...x, redeInteira: false }))}
              titulo="Só algumas lojas"
              detalhe="Gerente ou sócio de unidade: vê e mexe só nas lojas marcadas."
              disabled={lojas.length === 0}
              nota={lojas.length === 0 ? 'cadastre uma loja antes' : undefined}
            />
          </div>
          {!v.redeInteira && (
            <div className="mt-2.5 flex flex-wrap gap-1.5 pl-1">
              {lojas.map((l) => (
                <Etiqueta
                  key={l.id}
                  name="lojaIds"
                  value={l.id}
                  checked={v.lojaIds.includes(l.id)}
                  onChange={(m) => setV((x) => ({ ...x, lojaIds: alternarEm(x.lojaIds, l.id, m) }))}
                >
                  {l.nome}
                  {!l.ativa && <span className="ml-1 opacity-60">(inativa)</span>}
                </Etiqueta>
              ))}
            </div>
          )}
          <Erro id={id('lojas-erro')} texto={estado?.erros?.lojas} />
        </fieldset>

        {modo === 'editar' && (
          <details
            className="group rounded-[9px] border border-white/[0.1]"
            open={aMais + aMenos > 0 ? true : undefined}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-[13px] text-surface/80 hover:text-surface">
              <span>Ajuste fino desta pessoa</span>
              <span className="text-[12px] tabular-nums text-surface/45">
                {aMais + aMenos === 0
                  ? 'igual ao perfil'
                  : [aMais && `${aMais} a mais`, aMenos && `${aMenos} a menos`].filter(Boolean).join(' · ')}
                <span aria-hidden className="ml-2 inline-block transition group-open:rotate-90">
                  ›
                </span>
              </span>
            </summary>
            <div className="border-t border-white/[0.07] px-3.5 pb-3.5 pt-3">
              <p className="mb-3 text-[12px] leading-relaxed text-surface/50">
                Marque ou desmarque só para esta pessoa. O resto continua vindo do perfil.
              </p>
              <GradeDePermissoes
                idBase={id('ajuste')}
                marcada={marcada}
                alternar={alternar}
                concediveis={podeDar}
                destaque={(p) => doPerfil.has(p) !== marcada(p)}
              />
            </div>
          </details>
        )}
        {v.extras.map((p) => (
          <input key={`e-${p}`} type="hidden" name="extras" value={p} />
        ))}
        {v.removidas.map((p) => (
          <input key={`r-${p}`} type="hidden" name="removidas" value={p} />
        ))}

        <div className="space-y-2">
          <Enviar pendente={modo === 'criar' ? 'Criando…' : 'Salvando…'} className="w-full">
            {modo === 'criar' ? 'Criar acesso' : 'Salvar acesso'}
          </Enviar>
          <Resultado estado={estado} />
        </div>
      </form>
      {estado?.ok && estado.link && <LinkGerado link={estado.link} validade={estado.validade} />}
    </div>
  );
}
