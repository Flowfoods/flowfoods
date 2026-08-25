'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ABERTURA,
  CONSENTIMENTO_TEXTO,
  filaDePerguntas,
  rotuloEtapa,
  type PerguntaUI,
} from '@/lib/diagnostico/perguntas';
import { emailPlausivel, normalizarUrl } from '@/lib/diagnostico/texto';
import { CONTACT_INFO } from '@/lib/constants';

/**
 * O Diagnóstico, uma pergunta por tela.
 *
 * Regras visuais em `docs/DIAGNOSTICO-DESIGN.md` (repo portal-bibi), destiladas
 * do vocabulário DESTE site: grade de 1px em vez de cartão flutuante, quadrado
 * em vez de raio, traço vermelho em vez de ícone, número em marca d'água,
 * assimetria. Sem emoji, sem biblioteca de ícone, sem gradiente decorativo.
 *
 * Fundo claro de propósito. O vermelho da casa (#b91c1c) sobre o #111111 do
 * Hero mede 2,9:1 e reprova em texto pequeno; sobre a superfície clara mede
 * 6,3:1. O rótulo micro vermelho é a assinatura de toda seção do site — para
 * mantê-la legível, o formulário mora no claro.
 */

type Valor = string | string[] | boolean;
type Respostas = Record<string, Valor>;

const CHAVE = 'flowfoods.diagnostico.v1';

export default function Diagnostico() {
  const [comecou, setComecou] = useState(false);
  const [respostas, setRespostas] = useState<Respostas>({});
  const [indice, setIndice] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  // Retomada simples: o dono responde no intervalo do trabalho e perde a
  // conexão. Sem banco ainda, o rascunho vive no próprio aparelho.
  useEffect(() => {
    try {
      const salvo = sessionStorage.getItem(CHAVE);
      if (salvo) {
        const d = JSON.parse(salvo) as { respostas: Respostas; indice: number };
        if (d.respostas && Object.keys(d.respostas).length > 0) {
          setRespostas(d.respostas);
          setIndice(d.indice ?? 0);
          setComecou(true);
        }
      }
    } catch {
      /* aparelho sem storage: começa do zero, sem barulho */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(CHAVE, JSON.stringify({ respostas, indice }));
    } catch {
      /* idem */
    }
  }, [respostas, indice]);

  const canais = (respostas['canais'] as string[] | undefined) ?? [];
  const fila = useMemo(() => filaDePerguntas(canais), [canais.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (resultado) return <Leitura dados={resultado} />;
  if (!comecou) return <Abertura onComecar={() => setComecou(true)} />;

  const pergunta = fila[Math.min(indice, fila.length - 1)];
  if (!pergunta) return null;

  const responder = (valor: Valor) => {
    setRespostas((r) => ({ ...r, [pergunta.id]: valor }));
    setErro(null);
  };


  /**
   * Avança. Recebe o valor recém-escolhido POR PARÂMETRO, e não pelo estado.
   *
   * Sem isso a escolha única não funciona: ela responde e avança no mesmo
   * toque, mas `setRespostas` é assíncrono — quando o avanço rodava, ele ainda
   * lia o estado ANTERIOR à resposta, reprovava na validação e travava a tela
   * com "Responde essa pra eu seguir". O motor tinha 143 testes verdes e não
   * via nada disso; quem pegou foi o navegador.
   */
  const seguir = async (valorNovo?: Valor) => {
    const valor = valorNovo !== undefined ? valorNovo : respostas[pergunta.id];
    const ruim = problema(pergunta, valor);
    if (ruim) {
      setErro(ruim);
      return;
    }
    const atualizadas =
      valorNovo !== undefined ? { ...respostas, [pergunta.id]: valorNovo } : respostas;
    if (valorNovo !== undefined) setRespostas(atualizadas);
    setErro(null);

    if (indice < fila.length - 1) {
      setIndice((i) => i + 1);
      return;
    }
    await enviar(atualizadas);
  };

  const enviar = async (dados: Respostas) => {
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch('/api/diagnostico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      });
      if (!res.ok) {
        const corpo = (await res.json().catch(() => null)) as
          | { erros?: Array<{ etapa: number; mensagem: string }> }
          | null;
        const primeiro = corpo?.erros?.[0];
        setErro(
          primeiro
            ? `${primeiro.mensagem} (etapa ${primeiro.etapa})`
            : 'Não consegui processar agora. Tenta de novo em instantes.',
        );
        setEnviando(false);
        return;
      }
      const leitura = (await res.json()) as Resultado;
      try {
        sessionStorage.removeItem(CHAVE);
      } catch {
        /* nada */
      }
      setResultado(leitura);
    } catch {
      setErro('Sua conexão caiu no meio. Suas respostas estão salvas — tenta de novo.');
      setEnviando(false);
    }
  };

  const ultima = indice === fila.length - 1;

  return (
    <main className="relative min-h-screen bg-surface">
      {/* Barra vermelha à esquerda — a mesma do Hero */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />

      <div className="relative max-w-6xl mx-auto px-5 md:px-8 lg:px-12 py-10 md:py-16">
        <Hud etapa={pergunta.etapa} titulo={pergunta.tituloEtapa} feito={indice} total={fila.length} />

        {/* O número da etapa fica AO LADO do enunciado, num flex, e não
            posicionado por cima dele. Nos cards de serviço do site a marca
            d'água funciona porque o título tem duas palavras; aqui o enunciado
            é uma pergunta inteira, e sobreposição vira atropelo — foi o que a
            captura em 360px mostrou. Com `flex-1 min-w-0` ao lado de um
            `flex-shrink-0`, os dois não têm como se encostar. */}
        <div className="mt-10 md:mt-14 flex items-start justify-between gap-4 md:gap-8">
          <div className="flex-1 min-w-0 lg:max-w-[62%]">
            <div className="w-8 h-0.5 bg-primary mb-5" />
            <h1
              id="pergunta-atual"
              className="font-display text-ink uppercase leading-[0.95] text-[clamp(1.7rem,6vw,3rem)] text-balance"
            >
              {pergunta.rotulo}
            </h1>
            {pergunta.ajuda && (
              <p className="text-ink-4 text-sm leading-relaxed mt-4 max-w-md">{pergunta.ajuda}</p>
            )}
          </div>
          <span
            aria-hidden="true"
            className="flex-shrink-0 font-display text-[3.5rem] md:text-[7rem] text-primary/[0.10] select-none leading-none -mt-3 md:-mt-6"
          >
            {String(pergunta.etapa).padStart(2, '0')}
          </span>
        </div>

        <div className="relative">

          <div className="mt-8 md:mt-10 lg:max-w-[70%]">
            <Campo
              pergunta={pergunta}
              valor={respostas[pergunta.id]}
              onResponder={responder}
              onSeguir={seguir}
            />
          </div>

          {erro && (
            <p role="alert" className="mt-6 text-error text-sm font-medium">
              {erro}
            </p>
          )}

          <div className="mt-10 md:mt-12 flex items-center gap-6">
            <button
              type="button"
              onClick={() => setIndice((i) => Math.max(0, i - 1))}
              disabled={indice === 0 || enviando}
              className="min-h-[48px] px-2 text-ink-4 text-sm font-medium uppercase tracking-wider transition-colors duration-200 hover:text-ink disabled:opacity-30 disabled:hover:text-ink-4"
            >
              Voltar
            </button>

            {precisaBotao(pergunta) && (
              <button
                type="button"
                onClick={() => seguir()}
                disabled={enviando}
                className="min-h-[48px] px-8 bg-primary text-white font-semibold uppercase tracking-wider text-sm rounded-lg shadow-[0_4px_20px_rgba(185,28,28,0.4)] transition-colors duration-200 hover:bg-primary-dark disabled:opacity-60"
              >
                {enviando ? 'Lendo suas respostas…' : ultima ? 'Ver minha leitura' : 'Continuar'}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/**
 * O que ha de errado com a resposta? `null` quando esta boa.
 *
 * Confere a FORMA aqui, na propria tela, e nao so no envio. O servidor valida
 * tudo de novo — ele e a autoridade —, mas descobrir na etapa 8 que o link
 * digitado na etapa 2 nao presta e perder o dono depois de quatro minutos.
 */
function problema(p: PerguntaUI, v: Valor | undefined): string | null {
  const vazio =
    v === undefined ||
    v === false ||
    (typeof v === "string" && v.trim() === "") ||
    (Array.isArray(v) && v.length === 0);

  if (vazio) return p.obrigatoria ? "Responde essa pra eu seguir." : null;

  if (p.tipo === "consentimento") {
    return v === true ? null : "Preciso do seu ok para usar as respostas.";
  }
  if (Array.isArray(v)) {
    return v.length >= (p.min ?? 1) ? null : "Escolhe pelo menos uma.";
  }
  if (typeof v !== "string") return null;

  if (p.tipo === "url" && normalizarUrl(v) === null) {
    return "Esse link nao parece um endereco. Cola a URL da sua loja no iFood.";
  }
  if (p.tipo === "email" && !emailPlausivel(v)) {
    return "Confere o e-mail — faltou alguma coisa.";
  }
  return null;
}

/** Escolha única avança sozinha no toque. As outras precisam de confirmação. */
function precisaBotao(p: PerguntaUI): boolean {
  return p.tipo !== 'unica';
}

// ────────────────────────────── partes ──────────────────────────────

function Hud({
  etapa,
  titulo,
  feito,
  total,
}: {
  etapa: number;
  titulo: string;
  feito: number;
  total: number;
}) {
  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
        <p className="text-primary text-xs font-semibold tracking-[0.4em] uppercase">
          {rotuloEtapa(etapa)}
        </p>
        <p className="text-ink-4 text-xs font-semibold tracking-[0.2em] uppercase">{titulo}</p>
      </div>
      {/* Trilho reto de 1px. Progresso não é pílula arredondada. */}
      <div className="mt-4 h-px w-full bg-surface-3" aria-hidden="true">
        <div
          className="h-px bg-primary transition-[width] duration-300"
          style={{ width: `${Math.round((feito / Math.max(total, 1)) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function Campo({
  pergunta,
  valor,
  onResponder,
  onSeguir,
}: {
  pergunta: PerguntaUI;
  valor: Valor | undefined;
  onResponder: (v: Valor) => void;
  onSeguir: (v: Valor) => void;
}) {
  if (pergunta.tipo === 'unica' && pergunta.opcoes) {
    return (
      <Grade>
        {pergunta.opcoes.map((o) => (
          <Ladrilho
            key={o.valor}
            rotulo={o.rotulo}
            marcado={valor === o.valor}
            onClick={() => {
              onResponder(o.valor);
              // Deixa o traço vermelho aparecer antes de trocar de tela.
              setTimeout(() => onSeguir(o.valor), 160);
            }}
          />
        ))}
      </Grade>
    );
  }

  if (pergunta.tipo === 'multipla' && pergunta.opcoes) {
    const atual = Array.isArray(valor) ? valor : [];
    return (
      <Grade>
        {pergunta.opcoes.map((o) => (
          <Ladrilho
            key={o.valor}
            rotulo={o.rotulo}
            marcado={atual.includes(o.valor)}
            onClick={() =>
              onResponder(
                atual.includes(o.valor) ? atual.filter((v) => v !== o.valor) : [...atual, o.valor],
              )
            }
          />
        ))}
      </Grade>
    );
  }

  if (pergunta.tipo === 'ordenada' && pergunta.opcoes) {
    const atual = Array.isArray(valor) ? valor : [];
    const teto = pergunta.max ?? 3;
    return (
      <>
        <p className="text-ink-4 text-sm mb-4">
          Toca na ordem: a primeira é a que mais dói. Até {teto}.
        </p>
        <Grade>
          {pergunta.opcoes.map((o) => {
            const pos = atual.indexOf(o.valor);
            return (
              <Ladrilho
                key={o.valor}
                rotulo={o.rotulo}
                marcado={pos >= 0}
                ordem={pos >= 0 ? pos + 1 : undefined}
                onClick={() => {
                  if (pos >= 0) onResponder(atual.filter((v) => v !== o.valor));
                  else if (atual.length < teto) onResponder([...atual, o.valor]);
                }}
              />
            );
          })}
        </Grade>
      </>
    );
  }

  if (pergunta.tipo === 'consentimento') {
    return (
      <button
        type="button"
        onClick={() => onResponder(valor !== true)}
        aria-pressed={valor === true}
        className={`w-full text-left flex gap-4 items-start p-5 md:p-6 border transition-colors duration-200 min-h-[56px] ${
          valor === true ? 'border-primary bg-white' : 'border-surface-3 bg-white hover:bg-surface'
        }`}
      >
        <span
          aria-hidden="true"
          className={`mt-1 w-5 h-5 flex-shrink-0 border-2 transition-colors duration-200 ${
            valor === true ? 'border-primary bg-primary' : 'border-ink-5'
          }`}
        />
        <span className="text-ink-3 text-sm leading-relaxed">{CONSENTIMENTO_TEXTO}</span>
      </button>
    );
  }

  const multiline = pergunta.tipo === 'textoLongo';
  const tipoHtml =
    pergunta.tipo === 'email' ? 'email' : pergunta.tipo === 'celular' ? 'tel' : 'text';

  return multiline ? (
    <textarea
      // O nome acessivel do campo E' a pergunta na tela: sem isto o leitor de
      // tela anuncia so' "caixa de texto", e o dono nao sabe o que responder.
      aria-labelledby="pergunta-atual"
      value={typeof valor === 'string' ? valor : ''}
      onChange={(e) => onResponder(e.target.value)}
      rows={4}
      maxLength={pergunta.max ?? 1000}
      placeholder="Pode escrever do seu jeito."
      className="w-full bg-white border border-surface-3 p-5 text-ink text-base leading-relaxed focus:border-primary focus:outline-none transition-colors duration-200"
    />
  ) : (
    <input
      aria-labelledby="pergunta-atual"
      type={tipoHtml}
      inputMode={pergunta.tipo === 'celular' ? 'tel' : undefined}
      value={typeof valor === 'string' ? valor : ''}
      onChange={(e) => onResponder(e.target.value)}
      maxLength={pergunta.max ?? 120}
      placeholder={pergunta.tipo === 'celular' ? '(21) 99999-0000' : ''}
      className="w-full min-h-[56px] bg-white border border-surface-3 px-5 text-ink text-base focus:border-primary focus:outline-none transition-colors duration-200"
    />
  );
}

/** A grade de 1px do site: os ladrilhos se tocam, separados por uma linha. */
function Grade({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-surface-3 border border-surface-3">
      {children}
    </div>
  );
}

function Ladrilho({
  rotulo,
  marcado,
  ordem,
  onClick,
}: {
  rotulo: string;
  marcado: boolean;
  ordem?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={marcado}
      className={`relative text-left px-5 py-4 min-h-[56px] flex items-center gap-3 transition-colors duration-200 ${
        marcado ? 'bg-white' : 'bg-white hover:bg-surface'
      }`}
    >
      {/* Selecionado = o traço vermelho da casa. Não é pílula preenchida. */}
      <span
        aria-hidden="true"
        className={`h-0.5 flex-shrink-0 transition-all duration-200 ${
          marcado ? 'w-8 bg-primary' : 'w-3 bg-surface-3'
        }`}
      />
      <span className={`text-sm leading-snug ${marcado ? 'text-ink font-semibold' : 'text-ink-3'}`}>
        {rotulo}
      </span>
      {ordem !== undefined && (
        <span className="ml-auto font-display text-primary text-lg leading-none">{ordem}</span>
      )}
    </button>
  );
}

function Abertura({ onComecar }: { onComecar: () => void }) {
  return (
    <main className="relative min-h-screen bg-surface flex items-center">
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />
      <div className="relative max-w-6xl mx-auto px-5 md:px-8 lg:px-12 py-16 w-full">
        <p className="text-primary text-xs font-semibold tracking-[0.4em] uppercase mb-6">
          Diagnóstico
        </p>
        <div className="lg:max-w-[62%]">
          <h1 className="font-display text-ink uppercase leading-[0.92] text-[clamp(2.2rem,8vw,4.5rem)]">
            {ABERTURA.chamada}
          </h1>
          <p className="text-ink-4 text-sm md:text-base leading-relaxed mt-7 max-w-md">
            São perguntas de toque, sem digitar quase nada. No fim eu te mostro o que suas
            respostas dizem — e uma coisa pra fazer ainda hoje.
          </p>
          <button
            type="button"
            onClick={onComecar}
            className="mt-10 min-h-[48px] px-10 bg-primary text-white font-semibold uppercase tracking-wider text-sm rounded-lg shadow-[0_4px_20px_rgba(185,28,28,0.4)] transition-colors duration-200 hover:bg-primary-dark"
          >
            {ABERTURA.botao}
          </button>
        </div>
      </div>
    </main>
  );
}

interface Resultado {
  leitura: string;
  cta: string;
  restaurante: string;
  bairro: string;
  momento: string;
  moduloUm: string;
}

/**
 * A Leitura Inicial. Escuro de propósito: é o momento de peso da visita, e o
 * site já reserva o escuro para isso (Hero e Citação). Aqui a tinta é clara, o
 * que resolve o contraste que o vermelho não teria.
 */
function Leitura({ dados }: { dados: Resultado }) {
  const linhas = dados.leitura.split('\n');
  const corpo = linhas.filter((l) => !l.trim().startsWith('[')).join('\n').trim();

  const mensagem = encodeURIComponent(
    `Oi, Rodolfo! Fiz o diagnóstico no site.\n\n` +
      `${dados.restaurante} — ${dados.bairro}\n` +
      `Momento: ${dados.momento.replace(/_/g, ' ')}\n` +
      `Por onde começar: ${dados.moduloUm}\n\n` +
      `Quero agendar a conversa de 30 min.`,
  );
  const whatsapp = `https://wa.me/${CONTACT_INFO.whatsapp}?text=${mensagem}`;

  return (
    <main className="relative min-h-screen bg-[#111111]">
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />
      <div className="relative max-w-6xl mx-auto px-5 md:px-8 lg:px-12 py-14 md:py-20">
        <p className="text-white/50 text-xs font-semibold tracking-[0.4em] uppercase mb-8">
          Leitura Inicial
        </p>

        <div className="lg:max-w-[68%]">
          {corpo.split('\n').map((linha, i) => {
            if (linha.trim() === '') return <div key={i} className="h-4" />;
            if (linha.startsWith('LEITURA INICIAL //')) {
              return (
                <h1
                  key={i}
                  className="font-display text-white uppercase leading-[0.95] text-[clamp(1.9rem,7vw,3.4rem)] mb-5"
                >
                  {linha.replace('LEITURA INICIAL //', '').trim()}
                </h1>
              );
            }
            if (linha.startsWith('MOMENTO:')) {
              return (
                <p key={i} className="text-white/80 text-base md:text-lg leading-relaxed mb-2">
                  {linha}
                </p>
              );
            }
            if (linha.startsWith('•')) {
              return (
                <p key={i} className="flex gap-3 text-white/75 text-sm md:text-base leading-relaxed mb-2">
                  <span aria-hidden="true" className="mt-2.5 w-4 h-0.5 bg-primary flex-shrink-0" />
                  <span>{linha.replace('•', '').trim()}</span>
                </p>
              );
            }
            return (
              <p key={i} className="text-white/75 text-sm md:text-base leading-relaxed mb-2">
                {linha}
              </p>
            );
          })}

          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center min-h-[52px] mt-10 px-9 bg-primary text-white font-semibold uppercase tracking-wider text-sm rounded-lg shadow-[0_4px_20px_rgba(185,28,28,0.4)] transition-colors duration-200 hover:bg-primary-dark"
          >
            {dados.cta}
          </a>

          <p className="text-white/60 text-xs leading-relaxed mt-6 max-w-md">
            O botão abre o WhatsApp com a mensagem pronta. Nada foi enviado sem você.
          </p>
        </div>
      </div>
    </main>
  );
}
