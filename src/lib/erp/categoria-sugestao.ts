/**
 * Sugestão de categoria pelo nome do insumo (I.1a) — PURA, determinística e sem IA externa: a mesma entrada dá sempre a
 * mesma saída, e cada resposta diz de qual palavra veio ou por que não deu para decidir.
 *
 * A regra é a do plano (19 e 21/10/2026): categoria é a NATUREZA do insumo para o CMV, não onde ele é guardado.
 *  - farinha é Mercearias e secos; coxa de frango é Proteína, mesmo resfriada ou congelada; pão é Panificação; molho é
 *    Mercearias e secos (não existe categoria de molho);
 *  - as palavras de conservação ("congelado", "resfriado", "refrigerado", "IQF"...) NÃO contam: conservação é outro campo;
 *  - "Congelados e industrializados" só quando nada mais adequado pela natureza aparece: Proteína, Laticínios, Panificação
 *    e Hortifruti vencem dele;
 *  - o substantivo que abre o nome manda ("molho de tomate" é molho, "pão de queijo" é pão): as palavras depois de "de",
 *    "com", "sem"... só valem quando o começo do nome não diz nada;
 *  - vários grupos diferentes ou nenhum vão para "Outros / a classificar", com o motivo, nunca um chute calado;
 *  - o tipo "Embalagem" já é Descartáveis e embalagens.
 *
 * O dicionário abaixo é conhecimento de cozinha, e é só uma sugestão: a pessoa vê, confere e troca.
 */

import { CATEGORIAS_PADRAO, CHAVE_DO_SISTEMA, chaveDoNome, type ChaveDeCategoria } from './categoria-campos';

export interface SugestaoDeCategoria {
  chave: ChaveDeCategoria;
  /** Por que caiu em "Outros / a classificar" (ou, nas outras, null). */
  motivo: string | null;
  /** Quem decidiu: uma palavra do nome, o tipo do item, ou ninguém. */
  origem: 'termo' | 'tipo' | 'ambigua' | 'nenhuma';
  /** As palavras do nome que decidiram (para a tela dizer "pelo nome: farinha"). */
  termos: string[];
}

type ChaveDeTermo = Exclude<ChaveDeCategoria, 'OUTROS'>;

const NOME_DA = new Map(CATEGORIAS_PADRAO.map((c) => [c.chave, c.nome] as const));

/** Palavra → categoria. Frases (mais de uma palavra) valem antes das palavras soltas. Sem acento, em minúsculas. */
const TERMOS: Record<ChaveDeTermo, string[]> = {
  PROTEINA: [
    'carne', 'carnes', 'boi', 'bovino', 'bovina', 'vaca', 'patinho', 'acem', 'alcatra', 'picanha', 'maminha', 'fraldinha', 'contrafile',
    'contra file', 'file', 'file mignon', 'mignon', 'costela', 'costelinha', 'cupim', 'coxao mole', 'coxao duro', 'coxao', 'lagarto', 'musculo',
    'peito', 'coxa', 'sobrecoxa', 'asa', 'frango', 'galinha', 'peru', 'pato', 'porco', 'suino', 'suina', 'bisteca', 'lombo', 'pernil', 'paleta',
    'carne moida', 'hamburguer', 'burger', 'blend', 'medalhao', 'bife', 'steak', 'rabada', 'figado', 'moela', 'coracao', 'kafta',
    'salmao', 'tilapia', 'atum', 'bacalhau', 'camarao', 'peixe', 'merluza', 'polvo', 'lula', 'sardinha', 'robalo', 'linguado', 'pescada',
    'carne seca', 'charque', 'jerked', 'cordeiro', 'carneiro', 'cabrito', 'lingua', 'mocoto', 'tutano', 'osso',
  ],
  HORTIFRUTI: [
    'alface', 'rucula', 'agriao', 'espinafre', 'couve', 'repolho', 'tomate', 'tomate cereja', 'cebola', 'cebolinha', 'alho', 'batata', 'batata doce',
    'mandioca', 'aipim', 'macaxeira', 'cenoura', 'beterraba', 'pepino', 'abobrinha', 'berinjela', 'pimentao', 'pimenta dedo de moca',
    'pimenta malagueta', 'limao', 'laranja', 'banana', 'maca', 'abacaxi', 'morango', 'manga', 'mamao', 'melancia', 'melao', 'uva', 'maracuja',
    'goiaba', 'kiwi', 'pera', 'pessego', 'abacate', 'cheiro verde', 'salsa', 'salsinha', 'coentro', 'manjericao', 'hortela', 'alecrim', 'tomilho',
    'brocolis', 'couve flor', 'vagem', 'quiabo', 'chuchu', 'abobora', 'inhame', 'gengibre', 'cogumelo', 'champignon', 'shimeji', 'shitake',
    'fruta', 'frutas', 'legume', 'legumes', 'verdura', 'verduras', 'salada', 'erva', 'ervas', 'rabanete', 'aspargo', 'acelga', 'endívia',
    'endivia', 'limao siciliano', 'tangerina', 'mexerica', 'ameixa fresca',
  ],
  MERCEARIA: [
    'arroz', 'feijao', 'farinha', 'trigo', 'fuba', 'amido', 'maizena', 'polvilho', 'macarrao', 'espaguete', 'penne', 'parafuso', 'gnocchi',
    'nhoque', 'massa de lasanha', 'grao', 'graos', 'lentilha', 'grao de bico', 'ervilha', 'milho', 'azeite', 'oleo', 'vinagre', 'sal', 'acucar',
    'adocante', 'cafe', 'cha', 'achocolatado', 'chocolate', 'cacau', 'molho', 'molhos', 'ketchup', 'catchup', 'mostarda', 'maionese', 'barbecue',
    'bbq', 'shoyu', 'tempero', 'temperos', 'condimento', 'pimenta', 'pimenta do reino', 'paprica', 'oregano', 'cominho', 'colorau', 'curry',
    'canela', 'noz moscada', 'louro', 'caldo', 'sazon', 'extrato de tomate', 'tomate pelado', 'polpa de tomate', 'massa de tomate', 'passata',
    'picles', 'azeitona', 'palmito', 'champignon em conserva', 'atum em lata', 'sardinha em lata', 'granola', 'aveia', 'cereal', 'farofa',
    'farinha de rosca', 'panko', 'gelatina', 'fermento', 'bicarbonato', 'essencia', 'corante', 'confeito', 'confeitos', 'doce de leite', 'geleia',
    'mel', 'melado', 'amendoim', 'castanha', 'noz', 'nozes', 'pasta de amendoim', 'manteiga de amendoim', 'batata palha', 'salgadinho',
    'biscoito', 'bolacha', 'wafer', 'chips', 'margarina', 'gordura vegetal', 'molho de tomate', 'alho em po', 'cebola em po', 'leite de coco',
    'coco ralado', 'tapioca', 'goma', 'sagu', 'creme de avela', 'nutella', 'pimenta biquinho', 'conserva', 'conservas', 'kechup', 'wasabi',
    'gergelim', 'linhaca', 'chia', 'semente', 'sementes', 'uva passa', 'tahine', 'tahini', 'missô', 'miso', 'nori', 'furikake',
  ],
  LATICINIOS: [
    'leite', 'queijo', 'mussarela', 'muçarela', 'mucarela', 'cheddar', 'parmesao', 'provolone', 'gorgonzola', 'catupiry', 'requeijao',
    'cream cheese', 'ricota', 'coalho', 'minas', 'manteiga', 'nata', 'creme de leite', 'iogurte', 'leite condensado', 'leite em po', 'ovo',
    'ovos', 'presunto', 'apresuntado', 'peito de peru', 'blanquet', 'mortadela', 'salame', 'copa', 'lombo canadense', 'bacon', 'toucinho',
    'linguica', 'calabresa', 'salsicha', 'paio', 'pepperoni', 'embutido', 'embutidos', 'frios', 'chantilly', 'queijo ralado', 'brie', 'camembert',
    'emmental', 'gruyere', 'mascarpone', 'gouda', 'edam', 'suico', 'burrata', 'creme culinario', 'chantili',
  ],
  CONGELADOS: [
    'nugget', 'nuggets', 'empanado', 'empanada', 'pizza', 'lasanha', 'polpa', 'sorvete', 'picole', 'acai', 'batata frita', 'batata pre frita',
    'batata congelada', 'coxinha', 'pastel', 'risole', 'salgado', 'salgados', 'kibe', 'quibe', 'enroladinho', 'croquete', 'bolinho', 'torta',
    'sobremesa', 'prato pronto', 'marmita', 'pre pronto', 'semi pronto', 'massa folhada', 'massa de pastel', 'hot pocket',
    'onion rings', 'brownie', 'cheesecake', 'pudim', 'mousse',
  ],
  PANIFICACAO: [
    'pao', 'paes', 'brioche', 'baguete', 'bisnaga', 'ciabatta', 'focaccia', 'croissant', 'torrada', 'torradas', 'bolo', 'massa de pizza',
    'pao de queijo', 'wrap', 'pita', 'tortilla', 'tortilha', 'rosca', 'panetone', 'massa de pao', 'massa pre assada',
  ],
  BEBIDAS: [
    'agua', 'agua mineral', 'agua de coco', 'refrigerante', 'refri', 'coca cola', 'coca', 'guarana', 'suco', 'sucos', 'cerveja', 'chopp',
    'chope', 'vinho', 'cachaca', 'vodka', 'whisky', 'gin', 'rum', 'licor', 'energetico', 'isotonico', 'cha gelado', 'gelo', 'xarope', 'soda',
    'tonica', 'long neck', 'kombucha', 'mate', 'espumante', 'champagne', 'tequila', 'campari', 'aperol', 'bebida', 'bebidas', 'sprite', 'fanta',
    'pepsi', 'h2o', 'del valle', 'schweppes', 'heineken', 'brahma', 'skol', 'antarctica', 'itaipava',
  ],
  DESCARTAVEIS: [
    'copo', 'copos', 'prato descartavel', 'talher', 'talheres', 'garfo', 'faca descartavel', 'colher descartavel', 'guardanapo', 'canudo',
    'sacola', 'sacolas', 'embalagem', 'embalagens', 'caixa kraft', 'caixa de pizza', 'caixa hamburguer', 'caixa de hamburguer', 'marmitex',
    'marmita de aluminio', 'pote', 'potes', 'tampa', 'tampas', 'filme pvc', 'papel manteiga', 'papel aluminio', 'papel filme', 'bobina',
    'etiqueta', 'etiquetas', 'porta copo', 'espeto', 'palito', 'mexedor', 'kraft', 'bag', 'sachê', 'sache', 'saquinho', 'envelope',
    'papel de embrulho', 'papel acoplado', 'saco kraft', 'saco de papel', 'copinho', 'colher de pau descartavel',
  ],
  LIMPEZA: [
    'detergente', 'sabao', 'desinfetante', 'sanitizante', 'alcool', 'alcool gel', 'agua sanitaria', 'cloro', 'esponja', 'bucha', 'pano de chao',
    'pano', 'vassoura', 'rodo', 'balde', 'luva', 'luvas', 'touca', 'mascara', 'desengordurante', 'limpador', 'multiuso', 'saco de lixo',
    'papel higienico', 'papel toalha', 'sabonete', 'alvejante', 'amaciante', 'flanela', 'pa de lixo', 'higienizador', 'lixeira', 'inseticida',
    'lustra moveis', 'limpa vidro', 'saponaceo', 'lava loucas', 'lava roupas', 'peroxido', 'quaternario',
  ],
};

/** Palavras que dizem COMO é guardado ou vendido, não O QUE é: nunca decidem a categoria. */
const IGNORADAS = new Set([
  'congelado', 'congelada', 'congelados', 'congeladas', 'resfriado', 'resfriada', 'resfriados', 'resfriadas', 'refrigerado', 'refrigerada',
  'refrigerados', 'refrigeradas', 'iqf', 'ambiente', 'industrializado', 'industrializada', 'industrializados', 'industrializadas', 'fresco',
  'fresca', 'seco', 'seca', 'gelado', 'gelada', 'fatiado', 'fatiada', 'ralado', 'ralada', 'moido', 'inteiro', 'inteira', 'integral', 'light',
  'zero', 'diet', 'tradicional', 'premium', 'extra', 'pacote', 'caixa', 'saco', 'lata', 'garrafa', 'kg', 'g', 'ml', 'l', 'un', 'cx', 'pct',
]);

/** Depois destas palavras vem o detalhe ("molho DE tomate"): o que decide é o que abre o nome. */
const CONECTORES = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'sem', 'em', 'ao', 'para', 'tipo', 'c', 'no', 'na']);

/** Singular simples: pães → pao, limões → limao, flores → flor, ovos → ovo. Igual nos dois lados (nome e dicionário). */
function singular(p: string): string {
  if (p.length <= 3) return p;
  if (p.endsWith('oes') || p.endsWith('aes')) return `${p.slice(0, -3)}ao`;
  if (p.endsWith('ais')) return `${p.slice(0, -3)}al`;
  if (p.endsWith('eis')) return `${p.slice(0, -3)}el`;
  if (p.endsWith('res') || p.endsWith('zes')) return p.slice(0, -2);
  if (p.endsWith('ss')) return p;
  if (p.endsWith('s')) return p.slice(0, -1);
  return p;
}

/** Palavras do nome: sem acento, minúsculas, só letras e números, no singular. */
export function palavrasDoNome(nome: string): string[] {
  return chaveDoNome(nome)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(singular);
}

interface Termo {
  chave: ChaveDeTermo;
  palavras: string[];
  texto: string;
}

// Mais palavras primeiro: a frase "pao de queijo" vale antes de "queijo".
const DICIONARIO: Termo[] = (Object.entries(TERMOS) as [ChaveDeTermo, string[]][])
  .flatMap(([chave, lista]) => lista.map((t) => ({ chave, palavras: palavrasDoNome(t), texto: t })))
  .filter((t) => t.palavras.length > 0)
  .sort((a, b) => b.palavras.length - a.palavras.length);

const DE_UMA_PALAVRA = new Map<string, Termo>();
for (const t of DICIONARIO) if (t.palavras.length === 1 && !DE_UMA_PALAVRA.has(t.palavras[0])) DE_UMA_PALAVRA.set(t.palavras[0], t);

const FRASES = DICIONARIO.filter((t) => t.palavras.length > 1);

interface Acerto {
  chave: ChaveDeTermo;
  texto: string;
  /** Posição da primeira palavra no nome. */
  inicio: number;
}

const ordemDe = new Map(CATEGORIAS_PADRAO.map((c) => [c.chave, c.ordem] as const));
const ehIgual = (a: string[], b: string[], de: number) => b.every((p, i) => a[de + i] === p);

/** Pelo nome (e pelo tipo do item, se for embalagem), a categoria que o insumo provavelmente tem. */
export function sugerirCategoria(nome: string, tipo?: string | null): SugestaoDeCategoria {
  if (tipo === 'EMBALAGEM') return { chave: 'DESCARTAVEIS', motivo: null, origem: 'tipo', termos: [] };
  const palavras = palavrasDoNome(nome);
  const usada = new Array<boolean>(palavras.length).fill(false);
  const acertos: Acerto[] = [];

  // 1. Frases, as mais longas primeiro (cada palavra só entra numa).
  for (const f of FRASES) {
    for (let i = 0; i + f.palavras.length <= palavras.length; i++) {
      if (usada.slice(i, i + f.palavras.length).some(Boolean) || !ehIgual(palavras, f.palavras, i)) continue;
      for (let k = i; k < i + f.palavras.length; k++) usada[k] = true;
      acertos.push({ chave: f.chave, texto: f.texto, inicio: i });
    }
  }
  // 2. Palavras soltas que sobraram (as de conservação e medida não contam).
  palavras.forEach((p, i) => {
    if (usada[i] || IGNORADAS.has(p)) return;
    const t = DE_UMA_PALAVRA.get(p);
    if (t) acertos.push({ chave: t.chave, texto: t.texto, inicio: i });
  });

  // 3. O que abre o nome manda: as palavras antes do primeiro "de/com/sem..." (que não seja parte de uma frase).
  let fimDoComeco = palavras.length;
  for (let i = 0; i < palavras.length; i++) {
    if (!usada[i] && CONECTORES.has(palavras[i])) {
      fimDoComeco = i;
      break;
    }
  }
  const doComeco = acertos.filter((a) => a.inicio < fimDoComeco);
  const valem = doComeco.length > 0 ? doComeco : acertos;

  // 4. "Congelados e industrializados" só quando nada mais pela natureza aparece.
  let chaves = Array.from(new Set(valem.map((a) => a.chave)));
  if (chaves.length > 1) chaves = chaves.filter((c) => c !== 'CONGELADOS');

  if (chaves.length === 0) {
    return { chave: CHAVE_DO_SISTEMA, motivo: 'Sem palavra conhecida no nome: confira a categoria.', origem: 'nenhuma', termos: [] };
  }
  if (chaves.length > 1) {
    const nomes = chaves.sort((a, b) => (ordemDe.get(a)! - ordemDe.get(b)!)).map((c) => NOME_DA.get(c)!);
    const lista = nomes.length === 2 ? `${nomes[0]} e ${nomes[1]}` : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
    return { chave: CHAVE_DO_SISTEMA, motivo: `Ambíguo: o nome lembra ${lista}. Confira a categoria.`, origem: 'ambigua', termos: [] };
  }
  const termos = Array.from(new Set(valem.filter((a) => a.chave === chaves[0]).map((a) => a.texto)));
  return { chave: chaves[0], motivo: null, origem: 'termo', termos };
}

/** O nome da categoria padrão (para a frase "Sugerida pelo nome: Proteína"). */
export function nomeDaChave(chave: ChaveDeCategoria): string {
  return NOME_DA.get(chave) ?? chave;
}
