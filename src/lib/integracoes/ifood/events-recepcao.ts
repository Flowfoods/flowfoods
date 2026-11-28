import { z } from 'zod';
import { compararInstantes, lerInstante } from './instante-iso';

const uuid = z.guid().transform(valor => valor.toLowerCase());
const idEvento = z.string().min(1).refine(valor => !/[^A-Za-z0-9._~:-]/u.test(valor));
const codigo = z.string().refine(valor => /^[A-Za-z]/u.test(valor) && !/[^A-Za-z0-9_]/u.test(valor));
const escopoSchema = z.strictObject({
  merchantId: uuid,
  ambiente: z.enum(['TEST', 'PRODUCAO']),
});

const eventoSchema = z.object({
  id: idEvento,
  orderId: uuid,
  merchantId: uuid,
  code: codigo,
  fullCode: codigo,
  createdAt: z.iso.datetime({ offset: true }),
  category: codigo.nullish(),
  salesChannel: codigo.nullish(),
});
const loteSchema = z.array(eventoSchema);
type EventoIfood = z.infer<typeof eventoSchema>;

export class ErroContratoEvents extends Error {
  constructor(public readonly codigo: 'PARAMETROS' | 'HTTP' | 'ESQUEMA' | 'ESCOPO' | 'CONFLITO', mensagem: string) {
    super(mensagem);
    this.name = 'ErroContratoEvents';
  }
}

function mesmoEvento(anterior: EventoIfood, recebido: EventoIfood): boolean {
  return anterior.orderId === recebido.orderId
    && anterior.code === recebido.code
    && anterior.fullCode === recebido.fullCode
    && compararInstantes(lerInstante(anterior.createdAt), lerInstante(recebido.createdAt)) === 0
    && (anterior.salesChannel ?? null) === (recebido.salesChannel ?? null);
}

/** Confere a resposta decodificada de um polling já limitado a uma loja e a FOOD. */
export function conferirRecepcaoEventsIfood(entrada: unknown, resposta: { status: number; dados?: unknown }) {
  const escopo = escopoSchema.safeParse(entrada);
  if (!escopo.success) {
    throw new ErroContratoEvents('PARAMETROS', 'Informe a loja e o ambiente do polling de Events.');
  }
  const contexto = { provedor: 'IFOOD', ...escopo.data } as const;

  if (resposta.status === 204) {
    if (resposta.dados != null) {
      throw new ErroContratoEvents('ESQUEMA', 'O polling respondeu 204 com conteúdo inesperado.');
    }
    return { ...contexto, situacao: 'sem-eventos-pendentes', status: 204, eventos: [], idsReentregues: [] } as const;
  }
  if (resposta.status !== 200) {
    throw new ErroContratoEvents('HTTP', 'O polling não respondeu com HTTP 200 ou 204.');
  }

  const lote = loteSchema.safeParse(resposta.dados);
  if (!lote.success) {
    throw new ErroContratoEvents('ESQUEMA', 'O lote de Events está fora do formato esperado.');
  }

  const porId = new Map<string, EventoIfood>();
  const reentregues = new Set<string>();
  for (const evento of lote.data) {
    if (evento.merchantId !== contexto.merchantId || (evento.category != null && evento.category !== 'FOOD')) {
      throw new ErroContratoEvents('ESCOPO', 'O lote contém evento de outra loja ou categoria.');
    }

    const anterior = porId.get(evento.id);
    if (anterior === undefined) {
      porId.set(evento.id, evento);
    } else if (mesmoEvento(anterior, evento)) {
      reentregues.add(evento.id);
    } else {
      throw new ErroContratoEvents('CONFLITO', 'O lote contém versões divergentes do mesmo evento.');
    }
  }

  return { ...contexto, situacao: 'lote-recebido', status: 200, eventos: [...porId.values()], idsReentregues: [...reentregues] } as const;
}
