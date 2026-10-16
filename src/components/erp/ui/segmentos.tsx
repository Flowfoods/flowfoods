'use client';

/**
 * Controle segmentado de escolha única (rádio de verdade, por baixo): trilho
 * com borda, opção marcada em `forte`, foco visível na opção. Usado onde a
 * escolha é curta e cabe numa linha (unidade, situação ao nascer).
 */

export function Segmentos<T extends string>({
  nome,
  legenda,
  opcoes,
  valor,
  aoMudar,
}: {
  nome: string;
  legenda: string;
  opcoes: readonly (readonly [T, string])[];
  valor: T;
  aoMudar: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 block text-[13px] font-medium text-texto">{legenda}</legend>
      <div
        className="grid gap-1 rounded-[10px] border border-linha-forte bg-campo p-1"
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
              className="peer sr-only"
            />
            <span className="ff-transicao flex min-h-9 cursor-pointer items-center justify-center rounded-[7px] px-2 text-center text-[13px] text-suave hover:text-texto peer-checked:bg-forte peer-checked:font-semibold peer-checked:text-texto peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-acento">
              {rotulo}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
