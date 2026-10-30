# Fontes locais da identidade FlowFoods

Gelasio (títulos) e Libre Franklin (texto) são WOFF2 oficiais, sem alteração dos binários, dos upstreams [SorkinType/Gelasio](https://github.com/SorkinType/Gelasio/tree/9228e69b160d79f33950e026293f6e13ba9780d0) e [googlefonts/Libre-Franklin](https://github.com/googlefonts/Libre-Franklin/tree/310b7eef1f7b7ba82322295e0034675ea68040b0). Esses são os commits upstream referidos pelos metadados Gelasio/Libre Franklin de [google/fonts](https://github.com/google/fonts/tree/6157dfaa640ca5738b4d1a7070fe389c3036d7fc), commit `6157dfaa640ca5738b4d1a7070fe389c3036d7fc`. Os WOFF2 vêm dos diretórios `fonts/webfonts` dos upstreams, não do diretório TTF do Google e não do cache local do Next. Download pelo conector GitHub em 30/10/2026.

Os nomes de arquivo locais foram simplificados; nomes/metadados internos e conteúdo permanecem originais. Copyright e SIL OFL1.1, obtidos dos mesmos commits upstream, estão nos dois arquivos `OFL.txt` junto às respectivas famílias.

| Arquivo local | Arquivo de origem no commit upstream fixado | Bytes | SHA256 |
| --- | --- | ---: | --- |
| `gelasio/Gelasio-Variable.woff2` | `SorkinType/Gelasio@9228e69…/fonts/webfonts/Gelasio[wght].woff2` | 72812 | `15a06d2088bbfcf250296c770704cb9bb3f229ff58289faf708fe0f3279094c3` |
| `gelasio/Gelasio-Italic-Variable.woff2` | `SorkinType/Gelasio@9228e69…/fonts/webfonts/Gelasio-Italic[wght].woff2` | 80240 | `91164b31301c9e72922371df0ce81334d3c68e44172fc8ef597ad63c873e9215` |
| `libre-franklin/LibreFranklin-Variable.woff2` | `googlefonts/Libre-Franklin@310b7ee…/fonts/webfonts/LibreFranklin[wght].woff2` | 72132 | `b0fe4d0a38fd628fad5abcb10872ef857d955fd6105bd686c45f1e91de46c3e8` |

O layout usa `next/font/local` do Next 14.2.35, mantendo `--font-gelasio`, `--font-franklin`, `display:'swap'` e os pesos/estilos anteriores. Gelasio: 400/600/700 normal e italic; Libre Franklin: 400/500/600/700 normal. Os arquivos são variáveis oficiais, mas as faces declaradas mantêm apenas os pesos pedidos anteriormente. O estilo italic de Libre Franklin não foi acrescentado.

O marcador de família legado do binário Libre Franklin é `Libre Franklin Thin`; seu campo tipográfico preferencial é `Libre Franklin`, e o eixo oficial `wght` cobre 100–900. Isso não define o peso do aplicativo: cada face no layout declara 400/500/600/700. Gelasio cobre 400–700.

`next/font/local` não recebe `subsets`. Os arquivos completos incluem Latin/pt-BR e cobertura adicional; não há download em tempo de build. Os três binários somam 225184 bytes, com três URLs de ativos de conteúdo distintas apesar das dez faces CSS. O preload continua habilitado. A baseline local de revisão tinha três WOFF2 Latin de 104328 bytes: estes WOFF2 completos acrescentam 120856 bytes e pesam 2,16 vezes essa amostra, em todas as rotas. Esse compromisso foi selecionado pela coordenação para obter origem forte e build determinístico sem conversão local. Nenhum arquivo foi extraído do cache ou convertido de TTF para compor esta entrega. Um subconjunto futuro exige proveniência e validação próprias.

O fallback mantém Times New Roman para Gelasio e Arial para Libre Franklin, ajustados pelo próprio loader local. Os ajustes métricos diferem dos dados pré-calculados do loader Google; conferir a apresentação e o comportamento durante carregamento quando atualizar as fontes. A validação isolada do emissor instalado produz três candidatos únicos a preload, não dez; o HTML final deve ser reconferido no build integrado.

Não substituir os arquivos por resposta HTML de download, alterar famílias ou buscar `main` durante a compilação. Atualização futura exige nova proveniência, hashes, licença, validação dos eixos/glifos e revisão de layout.
