/**
 * Ajuda contextual (0.6) — SÓ texto. Uma entrada por tela (ou por telas que
 * se explicam do mesmo jeito: novo e editar). Chave = rota relativa à base.
 *
 * Como mexer (regra da casa, toda subfase):
 *  - tela nova ou rota nova: entrada nova aqui, no MESMO diff (o teste reprova rota sem ajuda);
 *  - função da tela mudou: ajuste o texto E suba a `versao` da entrada, depois rode
 *    `npm run ajuda:lock`. A caixa volta, com "MUDOU", para quem já tinha fechado;
 *  - texto curto, carioca, sem jargão: "a conta é refeita na hora de salvar", nunca "o servidor refaz";
 *  - sem "!", sem emoji, sem HTML, sem markdown. Até 320 caracteres por bloco; 1 a 4 frases para todos.
 *
 * `para` = quem tem QUALQUER uma dessas permissões lê o bloco (o operador não lê sobre preço).
 * É conforto: a permissão de verdade é decidida na página.
 */

import type { EntradaDeAjuda } from './ajuda';

export const ENTRADAS: EntradaDeAjuda[] = [
  {
    chave: 'inicio',
    area: 'inicio',
    rotas: [''],
    titulo: 'Áreas da Rede',
    versao: 1,
    aula: [
      { texto: 'Aqui ficam as áreas do restaurante: cadastros e cardápio, compras e fornecedores, estoque e movimentações, rede e equipe.' },
      { texto: 'Cada card abre na primeira tela que você pode usar. As outras telas da área ficam nas abas, no alto.' },
      { texto: 'Só aparece o que o seu acesso libera.' },
    ],
  },
  {
    chave: 'acesso',
    area: 'rede',
    rotas: ['acesso'],
    titulo: 'Seu acesso',
    versao: 1,
    aula: [
      { texto: 'Aqui estão os seus dados, o que você pode fazer no ERP e a entrada pelo rosto no celular.' },
      { texto: 'Trocou de aparelho? Ative o rosto de novo nele. Senha esquecida: fale com a FlowFoods.' },
    ],
    secoes: [
      {
        id: 'dicas',
        titulo: 'As caixas de dica',
        blocos: [
          { texto: 'Cada tela pode abrir uma caixinha explicando como ela funciona. Fechou uma, ela não volta, a não ser que o texto mude.' },
          { texto: 'No quadro Dicas, desta tela, você liga e desliga as caixinhas ou pede para ver de novo as que fechou. O botão ? no alto continua sempre à mão.' },
        ],
      },
    ],
  },
  {
    chave: 'insumos',
    area: 'cadastros',
    rotas: ['insumos'],
    titulo: 'Insumos',
    versao: 1,
    aula: [
      { texto: 'Tudo o que a casa compra e usa: ingrediente, embalagem e pré-preparo.' },
      { texto: 'O custo vem da última nota lançada. Sem nota, vale o preço cadastrado.' },
      { texto: '“Sem preço” quer dizer que falta cadastrar: as fichas que usam esse insumo ficam incompletas.' },
      { texto: 'Cadastre do jeito que você compra: a caixa de 5 kg, não o grama.', para: ['insumos.editar'] },
    ],
  },
  {
    chave: 'insumo-novo',
    area: 'cadastros',
    rotas: ['insumos/novo', 'insumos/[id]/editar'],
    titulo: 'Cadastrar insumo',
    versao: 1,
    aula: [
      { texto: 'Diga o que é, onde guarda e como compra: embalagem, preço e frete.' },
      { texto: 'A conta do custo por unidade aparece enquanto você digita.' },
      { texto: 'Ainda não sabe o preço? Marque “Ainda não sei o preço”.' },
    ],
  },
  {
    chave: 'insumo',
    area: 'cadastros',
    rotas: ['insumos/[id]'],
    titulo: 'Detalhe do insumo',
    versao: 1,
    aula: [
      { texto: 'O custo de hoje, de onde ele vem e quanto tem em cada loja do seu acesso.' },
      { texto: 'Mais embaixo, o que você pagou em cada nota e qual fornecedor saiu mais barato.', para: ['compras.ver'] },
    ],
  },
  {
    chave: 'insumo-embalagem',
    area: 'cadastros',
    rotas: ['insumos/[id]/embalagens/[varianteId]'],
    titulo: 'Outra embalagem',
    versao: 1,
    aula: [
      { texto: 'É outra forma de comprar o mesmo insumo: caixa, fardo, outra marca.' },
      { texto: 'A tela do insumo diz qual embalagem sai mais barata.' },
    ],
  },
  {
    chave: 'fichas',
    area: 'cadastros',
    rotas: ['fichas'],
    titulo: 'Fichas e produtos',
    versao: 1,
    aula: [
      { texto: 'Cada receita da casa, com o custo por porção.' },
      { texto: 'Pré-preparo (molho, base) entra dentro de outras fichas e leva o custo junto.' },
      { texto: '“Incompleto” quer dizer que falta preço em algum insumo.' },
      { texto: 'A margem de cada canal aparece ao lado; em cinza quando vale o preço sugerido.', para: ['precos.ver'] },
    ],
  },
  {
    chave: 'ficha-nova',
    area: 'cadastros',
    rotas: ['fichas/nova', 'fichas/[id]/editar'],
    titulo: 'Montar a ficha',
    versao: 2,
    aula: [
      { texto: 'Monte a receita com a quantidade limpa, sem casca e sem osso. O fator de correção cobre a perda da limpeza: cebola 1,18 quer dizer que 354 g sujas dão 300 g limpas.' },
      { texto: 'Pré-preparo diz quanto rende pronto. Diga também onde guarda e quanto dura.' },
    ],
  },
  {
    chave: 'ficha-importar',
    area: 'cadastros',
    rotas: ['fichas/importar'],
    titulo: 'Importar planilha',
    versao: 1,
    aula: [
      { texto: 'Baixe o modelo, preencha uma linha por insumo e envie.' },
      { texto: 'Antes de gravar, você vê o que é novo, o que muda e o que tem erro. Enviar a mesma planilha de novo não duplica nada.' },
    ],
  },
  {
    chave: 'ficha',
    area: 'cadastros',
    rotas: ['fichas/[id]'],
    titulo: 'Detalhe da ficha',
    versao: 2,
    aula: [
      { texto: 'Foto, receita e custo por porção, com a conta à mostra.' },
      { texto: 'Em “Preço e margem por canal” estão o custo de cada canal (loja, delivery, iFood), o preço sugerido pela margem-alvo e se o prato está no alvo.', para: ['precos.ver'] },
      { texto: 'Preço em branco vale o sugerido e acompanha o custo. Só quem edita preço muda o preço de venda.', para: ['precos.ver'] },
    ],
    secoes: [
      {
        id: 'conta',
        titulo: 'Como a conta é feita',
        blocos: [
          { texto: 'Embalagem entra inteira, pelo custo de referência (o último preço pago). A taxa do iFood é comissão mais pagamento online, sobre o preço.', para: ['precos.ver'] },
          { texto: 'A margem bruta é o preço menos os insumos e as embalagens. A margem líquida é a bruta menos a taxa do canal: o que sobra para pagar a casa e o lucro. Despesa fixa não entra nesta conta.', para: ['precos.ver'] },
          { texto: 'O preço sugerido é o custo dividido pelo que sobra depois da taxa e da margem-alvo, arredondado para cima no centavo: é o menor preço que atinge o alvo. Campo vazio vale o sugerido e acompanha o custo.', para: ['precos.ver'] },
        ],
      },
    ],
  },
  {
    chave: 'ficha-embalagens',
    area: 'cadastros',
    rotas: ['fichas/[id]/canais'],
    titulo: 'Embalagens por canal',
    versao: 1,
    aula: [
      { texto: 'O que vai no saco em cada canal: caixa, sacola, guardanapo.' },
      { texto: 'Delivery e iFood têm listas próprias. A loja não leva embalagem.' },
    ],
  },
  {
    chave: 'precificacao',
    area: 'cadastros',
    rotas: ['fichas/canais'],
    titulo: 'Precificação',
    versao: 1,
    aula: [
      { texto: 'Quanto o iFood leva (comissão e pagamento online) e a margem que você quer em cada canal.' },
      { texto: 'Sem a taxa do iFood, o custo dele fica incompleto.' },
      { texto: 'Confira os números no seu contrato com o iFood.', para: ['precos.editar'] },
    ],
  },
  {
    chave: 'compras',
    area: 'compras',
    rotas: ['compras'],
    titulo: 'Compras',
    versao: 1,
    aula: [
      { texto: 'As notas de compra de cada loja.' },
      { texto: 'Nota lançada muda o custo do insumo e entra no estoque, se a loja já abriu o estoque.' },
      { texto: 'A mesma nota não entra duas vezes.', para: ['compras.lancar'] },
    ],
  },
  {
    chave: 'compra-nova',
    area: 'compras',
    rotas: ['compras/nova', 'compras/[id]/editar'],
    titulo: 'Lançar nota',
    versao: 2,
    aula: [
      { texto: 'Digite o valor total de cada linha, como está na nota.' },
      { texto: 'O frete é dividido entre os itens, e a soma tem que bater com o total da nota.' },
      { texto: '“Conferir o impacto” mostra o que muda de custo antes de lançar.' },
      { texto: 'A data da nota decide o período dela: se o DRE já fechou esse período, a nota não entra nem se edita.', para: ['compras.lancar'] },
    ],
  },
  {
    chave: 'compra',
    area: 'compras',
    rotas: ['compras/[id]'],
    titulo: 'Detalhe da nota',
    versao: 2,
    aula: [
      { texto: 'A nota, o frete de cada item e o que ela fez no estoque.' },
      { texto: 'Errou? Edite ou cancele com o motivo: o custo e o estoque voltam.', para: ['compras.lancar'] },
      { texto: 'Nota com data em período que o DRE já fechou não se edita nem se cancela.', para: ['compras.lancar'] },
    ],
  },
  {
    chave: 'fornecedores',
    area: 'compras',
    rotas: ['compras/fornecedores'],
    titulo: 'Fornecedores',
    versao: 1,
    aula: [
      { texto: 'Quem vende para a casa e o último preço de cada insumo.' },
      { texto: 'O CNPJ é opcional. Desativar não apaga a história.' },
    ],
  },
  {
    chave: 'fornecedor-novo',
    area: 'compras',
    rotas: ['compras/fornecedores/novo', 'compras/fornecedores/[id]/editar'],
    titulo: 'Cadastrar fornecedor',
    versao: 1,
    aula: [
      { texto: 'Nome, CNPJ ou CPF (se tiver) e contato. O nome não pode repetir.' },
    ],
  },
  {
    chave: 'fornecedor',
    area: 'compras',
    rotas: ['compras/fornecedores/[id]'],
    titulo: 'Detalhe do fornecedor',
    versao: 1,
    aula: [
      { texto: 'O que esse fornecedor já vendeu, com o último preço de cada insumo, e as últimas notas das lojas que você vê.' },
    ],
  },
  {
    chave: 'estoque',
    area: 'estoque',
    rotas: ['estoque'],
    titulo: 'Estoque: visão geral',
    versao: 1,
    aula: [
      { texto: 'Cada loja e a situação do estoque dela: não aberto, em contagem ou aberto.' },
      { texto: 'Depois de aberto, nota lançada e requisição mexem no saldo sozinhas.' },
    ],
    secoes: [
      {
        id: 'abertura',
        titulo: 'Como abre o estoque de uma loja',
        blocos: [
          { texto: '1. Contar. Quem conta abre a lista no celular e digita o que tem: caixas fechadas e o solto. Salva sozinho, e dá para contar em várias vezes e com várias pessoas.' },
          { texto: '2. Conferir. O gerente vê o que falta, o que deu zero e o valor do estoque pelo custo de referência.' },
          { texto: '3. Concluir. A contagem vira o saldo inicial. Daí em diante, nota lançada na loja entra no estoque na hora.' },
        ],
      },
    ],
  },
  {
    chave: 'estoque-contagens',
    area: 'estoque',
    rotas: ['estoque/contagens'],
    titulo: 'Contagens',
    versao: 1,
    aula: [
      { texto: 'Escolha a loja para ver a contagem dela: cobertura do período, contagens abertas e fechamento.' },
      { texto: 'Com uma loja só no seu acesso, você já cai no período dela.' },
    ],
  },
  {
    chave: 'estoque-loja',
    area: 'estoque',
    rotas: ['estoque/[lojaId]'],
    titulo: 'Estoque da loja',
    versao: 1,
    aula: [
      { texto: 'O saldo e o valor de cada insumo na loja, e o livro de tudo o que entrou e saiu.' },
      { texto: 'Planeje a contagem do dia a dia e acompanhe se o período chega ao piso. “Recontar” corrige um número que ficou errado.', para: ['estoque.ajustar'] },
    ],
  },
  {
    chave: 'estoque-abertura',
    recolhida: true,
    area: 'estoque',
    rotas: ['estoque/[lojaId]/abertura'],
    titulo: 'Contagem de abertura',
    versao: 1,
    aula: [
      { texto: 'Conte o que tem na loja agora. Caixa fechada vai em embalagens; o aberto, no solto.' },
      { texto: 'Deixe vazio o que ainda não contou; o que não tem, marque “Não tem”.' },
      { texto: 'A tela salva sozinha, até sem sinal.' },
    ],
  },
  {
    chave: 'estoque-abertura-conferir',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/abertura/conferir'],
    titulo: 'Conferir a abertura',
    versao: 1,
    aula: [
      { texto: 'O que falta contar, o que deu zero e o valor do estoque.' },
      { texto: 'Concluir transforma a contagem no saldo inicial e não se desfaz. Correção depois é uma contagem nova.' },
    ],
  },
  {
    chave: 'contagem-nova',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/contagens/nova'],
    titulo: 'Planejar a contagem',
    versao: 1,
    aula: [
      { texto: 'Escolha o lugar (seco, refrigerado...) e quais insumos contar: os vencidos, todos do lugar ou só os mais caros.' },
      { texto: 'Um pedaço por vez. Um insumo só entra em uma contagem aberta.' },
    ],
  },
  {
    chave: 'contagem',
    recolhida: true,
    area: 'estoque',
    rotas: ['estoque/[lojaId]/contagens/[contagemId]'],
    titulo: 'Contagem',
    versao: 1,
    aula: [
      { texto: 'Conte o que tem agora. O número é comparado com o que o livro dizia na hora em que você contou; nota que chegar depois continua no estoque.' },
      { texto: 'Se tudo bater, a contagem fecha sozinha.' },
      { texto: 'No fechamento do período, conte o que falta: os marcados “para o piso” são os mais caros e levam a cobertura ao mínimo.' },
    ],
  },
  {
    chave: 'contagem-conferir',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/contagens/[contagemId]/conferir'],
    titulo: 'Conferir a contagem',
    versao: 1,
    aula: [
      { texto: 'O contado contra o que o livro dizia, em quilo e em reais. Perda aparece em vermelho e sobra em verde.' },
      { texto: 'Aplicar acerta o saldo. O fechamento do período só aplica com a cobertura no piso.' },
    ],
  },
  {
    chave: 'periodo',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/periodo'],
    titulo: 'Período e contagens',
    versao: 3,
    aula: [
      { texto: 'Quanto do estoque foi contado no período, por valor e por itens. O período é o mesmo do DRE: mensal, quinzenal ou semanal, definido em Períodos, na área Faturamento e DRE.' },
      { texto: 'O fechamento só vale com a cobertura acima do piso da loja.' },
      { texto: 'Depois que o DRE fecha o período, o fechamento do estoque dele não começa nem se aplica mais, mas descartar um em andamento continua valendo.' },
      { texto: 'As regras da contagem (piso, frequência, tolerância) ficam aqui; só quem cadastra lojas muda.', para: ['lojas.gerir'] },
    ],
  },
  {
    chave: 'requisicoes',
    area: 'estoque',
    rotas: ['estoque/requisicoes', 'estoque/[lojaId]/requisicoes'],
    titulo: 'Requisições',
    versao: 2,
    aula: [
      { texto: 'O setor pede, o estoque entrega e o saldo baixa na entrega.' },
      { texto: 'Pedido atrasado ganha uma faixa vermelha.' },
    ],
  },
  {
    chave: 'requisicao-nova',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/requisicoes/nova'],
    titulo: 'Nova requisição',
    versao: 1,
    aula: [
      { texto: 'Diga o setor, para quando e o que precisa.' },
      { texto: 'Vai produzir uma receita? “Puxar de uma ficha técnica” já traz os insumos.' },
    ],
  },
  {
    chave: 'requisicao',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/requisicoes/[requisicaoId]'],
    titulo: 'Detalhe da requisição',
    versao: 1,
    aula: [
      { texto: 'O pedido, o que saiu, o que voltou e o que falta.' },
      { texto: 'Sobrou? “Receber de volta” devolve ao estoque.', para: ['requisicao.atender'] },
    ],
  },
  {
    chave: 'requisicao-atender',
    area: 'estoque',
    rotas: ['estoque/[lojaId]/requisicoes/[requisicaoId]/atender'],
    titulo: 'Entregar a requisição',
    versao: 1,
    aula: [
      { texto: 'Entregue o que está saindo; pode ser em partes.' },
      { texto: 'Se o livro diz que não tem mas o produto está aí, confirme: o saldo negativo vira alerta nas divergências.' },
    ],
  },
  {
    chave: 'divergencias',
    area: 'estoque',
    rotas: ['estoque/divergencias', 'estoque/[lojaId]/divergencias'],
    titulo: 'Divergências',
    versao: 1,
    aula: [
      { texto: 'O que a contagem acusa sem requisição, em reais.' },
      { texto: '“Pequeno e repetido” é a diferença que passa despercebida. Por setor mostra onde olhar, não quem culpar.' },
    ],
  },
  {
    chave: 'faturamento',
    area: 'dre',
    rotas: ['faturamento'],
    titulo: 'Faturamento',
    versao: 1,
    aula: [
      { texto: 'Quanto cada loja vendeu em cada canal, dia a dia: faturamento, pedidos e clientes atendidos.' },
      { texto: 'O ticket médio é o faturamento dividido pelos pedidos, refeito na hora. Canal que a loja vende e ficou sem lançamento aparece como falta.' },
      { texto: 'Conta a venda dos produtos dos pedidos concluídos, sem a taxa de entrega e já sem o desconto que a casa pagou.' },
      { texto: 'Lance o dia em Lançar o dia, ou várias datas de uma vez em Importar planilha. Dia em que a loja não vendeu leva 0, não fica em branco.', para: ['faturamento.lancar'] },
    ],
    secoes: [
      {
        id: 'o-numero',
        titulo: 'O que entra no número',
        blocos: [
          { texto: 'Entra a venda dos produtos dos pedidos concluídos no dia, depois de tirar o desconto ou cupom que a casa pagou.' },
          { texto: 'Não entra taxa de entrega cobrada do cliente, gorjeta, 10 % de serviço nem pedido cancelado.' },
          { texto: 'No iFood, use o total dos itens menos o incentivo que a loja bancou. A comissão do iFood entra depois, no resultado.' },
          { texto: 'Clientes são atendimentos do dia, não pessoas diferentes. No delivery e no iFood, em branco vale o número de pedidos.' },
        ],
      },
      {
        id: 'falta',
        titulo: 'Falta não é zero',
        blocos: [
          { texto: 'Falta é canal que a loja vende, sem lançamento, desde que ela começou a lançar até ontem. Hoje ainda está em aberto.' },
          { texto: 'Dia em que a loja não vendeu conta como lançado: marque Não vendeu e o canal fecha com zero.' },
          { texto: 'Unidade que só faz delivery: tire a Loja dos canais dela em Lojas e marcas, e a falta de salão para de aparecer.', para: ['lojas.gerir'] },
        ],
      },
    ],
  },
  {
    chave: 'faturamento-lancar',
    area: 'dre',
    rotas: ['faturamento/lancar'],
    titulo: 'Lançar o dia',
    versao: 1,
    aula: [
      { texto: 'Escolha a loja e a data, que começa em hoje. Com uma loja só no seu acesso, você já cai no dia dela.' },
      { texto: 'Só dá para lançar até hoje e até três anos para trás.' },
    ],
  },
  {
    chave: 'faturamento-dia',
    area: 'dre',
    rotas: ['faturamento/[lojaId]/[data]'],
    titulo: 'Faturamento do dia',
    versao: 4,
    // Tela de lançar no celular: os campos ficam à vista, a aula abre numa linha (como nas telas de contar).
    recolhida: true,
    aula: [
      { texto: 'Um bloco por canal da loja, com faturamento, pedidos e clientes; o que ficar em branco continua sem lançamento.' },
      { texto: 'Canal que não vendeu leva Não vendeu e grava zero.' },
      { texto: 'Clientes em branco vale o número de pedidos. O ticket médio sai da conta, não é digitado.' },
      { texto: 'Errou? Salve de novo com o número certo: o antes e o depois ficam guardados. Lançamento do dia ou da loja errada sai com Remover, e o motivo é obrigatório.', para: ['faturamento.lancar'] },
    ],
    secoes: [
      {
        id: 'periodo-fechado',
        titulo: 'Dia de período fechado',
        blocos: [
          { texto: 'Quando o período do resultado é fechado, os dias dele não aceitam mais lançar, corrigir nem remover. Onde o período começa e termina fica em Períodos, na área Faturamento e DRE. Para mexer num dia fechado, peça à FlowFoods para reabrir o período: a tela já diz isso.' },
        ],
      },
    ],
  },
  {
    chave: 'faturamento-importar',
    area: 'dre',
    rotas: ['faturamento/importar'],
    titulo: 'Importar planilha de faturamento',
    versao: 1,
    aula: [
      { texto: 'Baixe o modelo, preencha uma linha por loja, canal e dia e envie o arquivo. Antes de gravar você vê a prévia, linha a linha.' },
      { texto: 'Mandar a mesma planilha de novo não duplica nada: o dia é o mesmo, e só é corrigido se o número mudou.' },
    ],
    secoes: [
      {
        id: 'colunas',
        titulo: 'As colunas do modelo',
        blocos: [
          { texto: 'data (dd/mm/aaaa), loja (o nome do cadastro), canal (loja, delivery ou ifood), faturamento (4.350,00), pedidos e clientes.' },
          { texto: 'Dia sem venda: faturamento 0 e pedidos 0. Clientes pode ficar em branco.' },
          { texto: 'Use ponto e vírgula entre as colunas. Linha com erro fica de fora e diz o motivo; as outras entram.' },
          { texto: 'Célula que começa com = + - ou @ é recusada: cole só o valor, sem fórmula.' },
        ],
      },
    ],
  },
  {
    chave: 'lojas',
    area: 'rede',
    rotas: ['lojas'],
    titulo: 'Lojas e marcas',
    versao: 2,
    aula: [
      { texto: 'As lojas e as marcas do grupo. Estoque, compras, contagem e faturamento são sempre de uma loja.' },
      { texto: 'Cadastrar loja ou marca é com quem tem a rede inteira.', para: ['lojas.gerir'] },
      { texto: 'Cada loja mostra em quais canais vende. Para mudar, abra Canais de venda na linha dela.', para: ['lojas.gerir'] },
    ],
  },
  {
    chave: 'equipe',
    area: 'rede',
    rotas: ['equipe'],
    titulo: 'Equipe',
    versao: 1,
    aula: [
      { texto: 'Quem entra, com que perfil e em quais lojas.' },
      { texto: 'O setor só organiza, não dá acesso. O link de primeiro acesso aparece uma vez: copie ou mande no WhatsApp.' },
    ],
  },
  {
    chave: 'historico',
    area: 'rede',
    rotas: ['historico'],
    titulo: 'Histórico',
    versao: 1,
    aula: [
      { texto: 'Toda mudança, com quem fez, quando e o antes e o depois.' },
      { texto: 'Nada aqui se apaga.' },
    ],
  },
  {
    chave: 'cadastro-do-parceiro',
    area: 'rede',
    rotas: ['cadastro'],
    titulo: 'Cadastro do parceiro',
    versao: 1,
    soNivel1: true,
    aula: [
      { texto: 'Nome e situação do parceiro.' },
      { texto: 'Suspender pede o motivo. Parceiro suspenso entra no ERP e só consulta.' },
    ],
  },
  {
    chave: 'dre',
    area: 'dre',
    rotas: ['dre'],
    titulo: 'DRE',
    versao: 3,
    // A tela da reunião: a tabela fica à vista e a aula abre numa linha.
    recolhida: true,
    aula: [
      { texto: 'O resultado da casa no período: o que entrou, o que saiu e o que sobrou, com o peso de cada linha na receita bruta, até ontem no período em curso.' },
      { texto: 'Com meta definida, a linha mostra o desvio e se está melhor ou pior que a meta; ela vale igual na rede e em cada loja.' },
      { texto: 'Período fechado mostra a fotografia do fechamento, que nunca muda.' },
      { texto: 'O CMV ainda não entra (em breve): a margem e os resultados saem sem contar o CMV.' },
    ],
    secoes: [
      {
        id: 'rede-e-loja',
        titulo: 'Rede e loja',
        blocos: [
          { texto: 'A rede soma as lojas e as despesas da rede; a loja mostra só o que é dela, antes das despesas da rede.' },
          { texto: 'No período em curso o número vai até ontem, sem projeção, e a despesa entra dia a dia.' },
        ],
      },
      {
        id: 'meta',
        titulo: 'Como ler a meta',
        blocos: [
          { texto: 'O desvio é o realizado menos a meta, em pontos percentuais. Menos de 0,05 ponto de diferença é na meta.' },
          { texto: 'A palavra segue o lado bom de cada linha: custo e despesa menores são melhores, receita líquida e margem maiores são melhores. A tela não usa cor para isso.' },
          { texto: 'Sem faturamento, sem lançamento na linha ou sem valor (como o CMV), a linha não compara e mostra traço, nunca zero.' },
          { texto: 'Na visão de uma loja, o resultado operacional e o resultado do período não mostram meta: a loja não carrega as despesas da rede.' },
          { texto: 'Quem define as metas as escreve em Plano e metas.', para: ['metas.editar'] },
        ],
      },
      {
        id: 'ano-passado',
        titulo: 'Receita contra o ano passado',
        blocos: [
          { texto: 'Compara a receita com as mesmas datas um ano antes, no mesmo recorte (29 de fevereiro compara com 28). Só a receita tem comparação.' },
          { texto: 'A variação só aparece quando o ano passado tem lançamento em todos os dias e este período não tem lançamento faltando. Senão ficam os dois números e o motivo.' },
          { texto: 'Sem lançamento no ano passado a tela diz sem lançamento, nunca R$ 0,00.' },
        ],
      },
      {
        id: 'competencia',
        titulo: 'Competência, não caixa',
        blocos: [
          { texto: 'A despesa conta no mês a que pertence, não no dia em que foi paga. A luz de outubro é de outubro, mesmo paga em novembro.' },
          { texto: 'Por isso o aluguel de 31 dias, no dia 16, entra com 15 trinta e um avos: o que já passou até ontem.' },
        ],
      },
      {
        id: 'taxa-ifood',
        titulo: 'A taxa do iFood é estimada',
        blocos: [
          { texto: 'Vale o faturamento do iFood vezes a comissão e o pagamento online configurados hoje. É uma estimativa, não o extrato do iFood. No período fechado vale a taxa de quando ele fechou.' },
          { texto: 'Sem a taxa configurada, a linha diz que falta configurar e a receita líquida sai avisando.', para: ['precos.ver'] },
        ],
      },
      {
        id: 'incompleto',
        titulo: 'Incompleto e falta lançar',
        blocos: [
          { texto: 'Dia de canal sem lançamento de faturamento deixa a receita incompleta. O aviso conta quantos faltam, do mesmo jeito que o calendário do mês.' },
          { texto: 'Despesa que repete todo mês e ainda não foi lançada neste mês aparece em Falta lançar. Nunca entra valor inventado. A cobrança continua nos meses seguintes até alguém lançar ou marcar que não repete mais.', para: ['despesas.lancar'] },
        ],
      },
      {
        id: 'fechado',
        titulo: 'Período fechado e ressalvas',
        blocos: [
          { texto: 'Fechado com ressalvas quer dizer que o período foi fechado com algo conhecido em aberto, como uma despesa que repete e não foi lançada. As ressalvas e a justificativa ficam ali para sempre.' },
          { texto: 'Quem define o plano e as metas fecha o período em Períodos. Só a FlowFoods reabre.', para: ['metas.editar'] },
        ],
      },
    ],
  },
  {
    chave: 'dre-despesas',
    area: 'dre',
    rotas: ['dre/despesas'],
    titulo: 'Despesas',
    versao: 1,
    aula: [
      { texto: 'Aluguel, salário, luz e as outras despesas da casa, pela competência: o mês a que a despesa pertence, não o dia em que foi paga.' },
      { texto: 'A pagar mostra as que têm vencimento e ainda não foram pagas: as vencidas e as que vencem em até 7 dias. Pagar não muda o DRE.' },
      { texto: 'Despesa da rede, que não é de uma loja, só aparece para quem tem a rede inteira.' },
      { texto: 'Lance cada despesa uma vez. As que repetem todo mês voltam em Lançar as do mês passado, com o valor para você conferir.', para: ['despesas.lancar'] },
    ],
  },
  {
    chave: 'dre-despesa',
    area: 'dre',
    rotas: ['dre/despesas/[id]'],
    titulo: 'Despesa',
    versao: 1,
    aula: [
      { texto: 'Os dados da despesa, como o DRE a conta dia a dia e tudo o que mudou nela, com antes e depois.' },
      { texto: 'Pagar, desfazer o pagamento e parar de repetir valem mesmo em período fechado, porque não mudam o DRE.', para: ['despesas.lancar'] },
      { texto: 'Lançou errado? Edite. Se foi a despesa que não devia existir, remova: o motivo é obrigatório e o que estava lançado fica no histórico.', para: ['despesas.lancar'] },
    ],
  },
  {
    chave: 'dre-despesa-nova',
    area: 'dre',
    rotas: ['dre/despesas/nova', 'dre/despesas/[id]/editar'],
    titulo: 'Lançar despesa',
    versao: 1,
    aula: [
      { texto: 'Escolha a linha do DRE, a loja (ou a rede) e a competência: um dia, um mês ou um período de até 366 dias.' },
      { texto: 'O DRE espalha o valor pelos dias da competência, ao centavo; repete todo mês vale só para o mês inteiro.' },
      { texto: 'O vencimento é opcional e só põe a despesa em A pagar; mandou duas vezes sem querer, fica uma só.' },
    ],
  },
  {
    chave: 'dre-periodos',
    area: 'dre',
    rotas: ['dre/periodos'],
    titulo: 'Períodos',
    versao: 2,
    aula: [
      { texto: 'O período em que o resultado fecha, mensal, quinzenal ou semanal, com o dia em que começa, é o mesmo da contagem de estoque.' },
      { texto: 'Mudar a regra nunca mexe no passado: ela vale a partir do dia seguinte ao fim do período de agora, e o primeiro período novo nasce cortado no começo.' },
      { texto: 'Quem define o plano de contas e o período, com a rede inteira, muda a regra; os outros só consultam.' },
      { texto: 'Cada período que já terminou tem a sua página: ali estão as condições para fechar, a fotografia do fechamento e as versões.', para: ['metas.editar'] },
    ],
  },
  {
    chave: 'dre-plano',
    area: 'dre',
    rotas: ['dre/plano'],
    titulo: 'Plano e metas',
    versao: 2,
    aula: [
      { texto: 'Em Metas, escreva quanto cada linha deveria pesar na receita bruta, em %; vazio é sem meta e zero é uma meta de zero.' },
      { texto: 'A meta vale a partir do começo do período de agora, igual na rede e em cada loja; o passado não muda.' },
      { texto: 'No plano de contas, renomear uma linha não perde nada; ocultar tira do formulário de despesa, e linha nunca se apaga.' },
      { texto: 'As linhas calculadas vêm do sistema: não se renomeiam, mas aceitam meta.' },
    ],
    secoes: [
      {
        id: 'metas',
        titulo: 'Como as metas funcionam',
        blocos: [
          { texto: 'Receita bruta e receita por canal não têm meta, porque a base delas é 100 %.' },
          { texto: 'Cada período usa a meta que valia no começo dele: período antigo ainda aberto não pega meta escrita depois. Salvar de novo no mesmo período troca a meta, e apagar grava sem meta.' },
          { texto: 'A tabela inteira é salva de uma vez. Se outra pessoa mudou as metas no meio tempo, a tela avisa e nada é gravado.' },
        ],
      },
      {
        id: 'plano',
        titulo: 'Ocultar e as despesas já lançadas',
        blocos: [
          { texto: 'Linha oculta continua no DRE dos períodos em que tem valor. Renomear mantém a linha: as despesas já lançadas mostram o nome novo.' },
        ],
      },
    ],
  },
  {
    chave: 'dre-periodo',
    area: 'dre',
    rotas: ['dre/periodos/[inicio]'],
    titulo: 'Fechar o período',
    versao: 1,
    aula: [
      { texto: 'Fechar guarda uma fotografia do DRE do período, e depois nada muda dentro das datas dele: nem faturamento, nem despesa, nem nota de compra, nem fechamento de estoque.' },
      { texto: 'Faturamento faltando, taxa do iFood sem configurar, estoque em contagem de fechamento e rede sem lançamento travam, e não aceitam justificativa.' },
      { texto: 'Despesa que repete e não foi lançada, loja sem o estoque fechado e loja sem faturamento são ressalvas: marque cada uma e escreva uma justificativa.' },
      { texto: 'Só a FlowFoods reabre um período fechado, com o motivo; fechar de novo gera a versão seguinte.' },
    ],
    secoes: [
      {
        id: 'ressalvas',
        titulo: 'O que é uma ressalva',
        blocos: [
          { texto: 'É algo que a casa sabe que está faltando e decide fechar assim mesmo. A justificativa tem de 10 a 300 letras, vai para a fotografia e para o Histórico, e o DRE fechado mostra Fechado com ressalvas para sempre.' },
          { texto: 'A despesa que repete e falta lançar pode ser lançada antes, com o valor do mês passado como ponto de partida.', para: ['despesas.lancar'] },
        ],
      },
      {
        id: 'versoes',
        titulo: 'Reabrir e as versões',
        blocos: [
          { texto: 'Reabrir deixa o período aberto de novo para lançar e corrigir. A fotografia anterior fica guardada em Versões, com quem reabriu e por quê.' },
          { texto: 'Ao fechar de novo sai a versão seguinte. A dona da casa não reabre: o período fechado é o ponto de controle do consultor.' },
        ],
      },
    ],
  },
];
