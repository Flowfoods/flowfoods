'use client';

/**
 * Controle segmentado de escolha única (rádio de verdade, por baixo), no visual da Apple (decisão 530): trilho preenchido,
 * opção marcada num polegar claro com sombra, contorno fino e em negrito, todas as opções na cor do texto, foco visível na
 * opção. Usado onde a escolha é curta e cabe numa linha (unidade, situação ao nascer). Com erro, o trilho ganha a borda do
 * erro; sem erro, a borda transparente só aparece no alto contraste do aparelho (cores forçadas).
 */

export function Segmentos<T extends string>({
  nome,
  legenda,
  opcoes,
  valor,
  aoMudar,
  obrigatorio = false,
  descritoPor,
  invalido = false,
}: {
  nome: string;
  legenda: string;
  opcoes: readonly (readonly [T, string])[];
  /** '' = nenhuma opção escolhida ainda (I.1a: a unidade base não vem marcada). */
  valor: T | '';
  aoMudar: (v: T) => void;
  /** I.1a: a escolha é obrigatória — dito em palavras na legenda e para o leitor de tela (`required`). */
  obrigatorio?: boolean;
  /** O id do erro ou da ajuda que descreve o grupo. */
  descritoPor?: string;
  invalido?: boolean;
}) {
  return (
    <fieldset aria-describedby={descritoPor} aria-invalid={invalido || undefined}>
      <legend className="mb-1.5 block text-[13px] font-medium text-texto">
        {legenda}
        {obrigatorio && <span className="font-normal text-suave"> (obrigatório)</span>}
      </legend>
      <div
        className={`grid gap-0.5 rounded-[10px] border bg-preenchimento p-[3px] ${invalido ? 'border-erro' : 'border-transparent'}`}
        style={{ gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))` }}
      >
        {opcoes.map(([v, rotulo]) => (
          <label key={v} className="relative">
            <input
              type="radio"
              name={nome}
              value={v}
              checked={valor === v}
              onChange={() => aoMudar(v)}
              required={obrigatorio}
              className="peer sr-only"
            />
            <span className="ff-transicao flex min-h-9 cursor-pointer items-center justify-center rounded-[8px] px-2 text-center text-[13px] font-medium text-texto hover:bg-preenchimento peer-checked:bg-polegar peer-checked:font-semibold peer-checked:shadow-[0_1px_2px_rgb(0_0_0/0.08),0_2px_6px_rgb(0_0_0/0.1)] peer-checked:ring-1 peer-checked:ring-linha-forte peer-checked:hover:bg-polegar peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-acento">
              {rotulo}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
