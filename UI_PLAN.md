# Speed Log: plano de melhorias de UI/UX

Documento de trabalho do designer para o front end. Escrito em 2026-10-27 depois de uma sessão de testes no navegador.
Nada aqui foi implementado: é só especificação. Leia o `CLAUDE.md` antes de executar.

## 0. Como foi testado

- Servidor estático (`python -m http.server`) e o log de exemplo `Teste 09 - M5 com carga 10kg.BIN` (250 MB, ArduCopter 4.5.7, CubeOrange+, 124 tipos de mensagem, 1168 parâmetros). Esse arquivo **não está no git**; não o commite.
- Viewports (emulação do painel do navegador): 1440×900, 1280×800 (claro e escuro), 854×480 (rádio), 640×360 (rádio pequeno), 390×800 (celular em pé).
- Fluxos exercitados: tela inicial, abrir log, árvore de campos, plotar 2 a 3 painéis, Parâmetros, Mensagens, Relatório de Hardware (Controladora, Sensores inerciais, Temperatura), Análise de PID (Dados de voo, Calcular, Domínio da frequência), abrir/fechar gaveta, tema escuro.
- Atalho para carregar o log de exemplo no console do navegador:
  ```js
  const r = await fetch('/Teste%2009%20-%20M5%20com%20carga%2010kg.BIN'); open_file(new File([await r.blob()], 'Teste 09.BIN'))
  ```
- **Não verificado:** aparelho Android real, gestos de toque reais (pinça, pan, toque duplo), comportamento do WebView, memória com log grande em celular, leitor de tela, daltonismo. A emulação liga `pointer: coarse`, o que basta para ver os problemas de layout abaixo, mas as decisões de gesto precisam de teste em rádio de verdade.

## 1. Público e restrições de design

| Contexto | Tela típica (CSS px) | Consequência |
|---|---|---|
| Piloto no campo, rádio Android (Skydroid, Siyi) | paisagem, 640×360 a 960×540, sol forte | altura vertical é o recurso mais escasso; contraste alto; alvos de toque ≥ 44 px |
| Celular Android | 360 a 430 de largura, em pé | uma mão, polegar; gaveta lateral |
| Engenheiro / desenvolvedor, desktop | ≥ 1280×720 | densidade, atalhos de teclado, mouse |

Princípios:

1. **O gráfico é o produto.** Toda a interface em volta (barra superior, abas, barra de ferramentas, legenda) deve ocupar o mínimo, principalmente na altura. Meta: o "chrome" fixo ocupa no máximo 24% da altura da tela em qualquer formato.
2. **Uma interface, três formatos.** Hoje existe "desktop" e "gaveta"; falta um formato próprio para paisagem baixa (rádios). Ver seção 3.
3. **Sempre saber o que está acontecendo:** qual arquivo está aberto, qual painel recebe os campos, o que está carregando.
4. **Sem inventar estilo novo:** reutilizar os tokens existentes (`--accent`, `--surface-*`, `--series-*`). Cores só por variáveis CSS, claro e escuro.
5. Texto secundário nunca abaixo de 12 px nem de 4,5:1 de contraste.

## 2. Diagnóstico: achados priorizados

Gravidade: **P0** bloqueia o uso em rádio/celular; **P1** atrito frequente; **P2** ganho claro; **P3** acabamento.

| # | Achado (evidência do teste) | Grav. |
|---|---|---|
| A1 | **Chrome vertical excessivo em paisagem.** Em 854×480 a barra superior quebra em 2 linhas (90 px) + barra de abas (49 px) + legenda de modos (~30 px) = ~170 px de 480; cada plot fica com ~216 px e 2 painéis já rolam. Em 640×360 sobram ~100 px de plot e as abas de vista ficam cortadas ("Relatório de Hardw…", "Análise de PID" some). | P0 |
| A2 | **Barra de ferramentas do Plotly cobre os dados em toque.** No celular os ícones de zoom/pan/home/câmera ficam em cima do traço e dos rótulos de modo ("AUTO", "RTL" ilegíveis). Em toque os gestos já são próprios (`setup_touch`), então os botões de zoom/pan são redundantes. | P0 |
| A3 | **Plot cortado quando os chips quebram linha.** Em 390 px o Painel 1 tem 2 linhas de chips; o painel mantém 260 px mas cabeçalho (~95 px) + `plotbox` (min 200 px) estouram e `overflow:hidden` corta o eixo X (sem rótulos de tempo). | P0 |
| A4 | **Gaveta lateral sem contexto.** Sem fundo escurecido, sem botão de fechar, não fecha ao tocar fora; não mostra para qual painel vão os campos; ao marcar um campo o gráfico fica coberto pela própria gaveta. Depois de abrir o log no celular o usuário vê "Marque campos na barra lateral" mas a barra está escondida. | P0 |
| A5 | **Arquivo aberto invisível no celular.** `.file-info` é `display:none` abaixo de 860 px. Em desktop o nome é cortado ("Teste 09 - M5 com c…") e a versão do firmware some. | P1 |
| A6 | **Checkboxes só refletem o painel ativo.** Com 3 painéis, ao ativar o Painel 3 os campos `ATT.Roll/Pitch` (plotados no Painel 1) aparecem desmarcados. Não há como ver o que já está plotado. | P1 |
| A7 | **Cursor não é sincronizado entre painéis.** O tooltip e a linha de mira existem só no painel sob o mouse; comparar altitude × corrente × atitude no mesmo instante exige adivinhar. É a principal feature de análise que falta. | P1 |
| A8 | **Formato dos números no tooltip:** `ATT.Roll : -2.40000 °` (zeros à direita, `.6g` do d3 não os remove). Tempo "1,001.864 s" com separador de milhar. | P1 |
| A9 | **Título do eixo Y é só a unidade girada** ("°", "m", "V, A"): 1 caractere minúsculo na margem esquerda, ocupa ~20 px de largura. | P1 |
| A10 | **Abas Parâmetros/Mensagens mantêm a barra lateral de plot** (irrelevante ali) e roubam 310 px. As tabelas têm linhas altas (≈68 px) com pouca densidade; em celular a tabela de 3 colunas não cabe. | P1 |
| A11 | **Hardware/PID: estado vazio "Escolha uma seção na barra lateral"** ao entrar. Obriga um toque extra e, no celular, abrir a gaveta para trocar de seção. | P1 |
| A12 | **Análise de PID, formulário "SETUP":** três `fieldset` aninhados, rótulos em inglês ("FFT SETTINGS", "ANALYSIS TIME", "AXIS", "Calculate") numa UI em português, botão "Calculate" fica desabilitado depois de calcular sem dizer que o resultado está pronto, e não há feedback durante o cálculo (log de 250 MB demora vários segundos com a barra vazia). | P1 |
| A13 | **Domínio da frequência:** tabela "Testes" com 10+ colunas estoura a largura (cabeçalho cortado em "D…"); o gráfico fica no meio e os controles de escala (Linear/dB/PSD, Hz/RPM) ficam abaixo da dobra. A hierarquia está invertida: o gráfico deveria vir primeiro. | P1 |
| A14 | **Contraste:** `--text-muted` (#85847f sobre #fcfcfb) = ~3,6:1, abaixo de 4,5:1, e é usado em unidades, descrições, contadores, dicas (11 a 13 px). Em sol forte no rádio isso some. No escuro (#8e8d86) passa (~5,2:1). | P1 |
| A15 | **Tela inicial em toque diz "Solte um log aqui"** (arrastar não existe em celular). O texto não menciona que `.param` também abre (o `input` aceita). | P1 |
| A16 | **Botão de idioma "PT"** mostra o idioma atual; é ambíguo (parece ser o destino). | P2 |
| A17 | **Sidebar densa:** 9 campos de `ATT` ocupam ~270 px porque cada campo tem descrição em linha própria; a unidade fica minúscula e à direita; o placeholder da busca "…( / )" é cortado; cabeçalho do tipo não é fixo ao rolar. | P2 |
| A18 | **Mistura de idiomas** em Hardware, PID, tabela de mensagens (MSG em inglês) e parâmetros. Conhecido (README) mas precisa de rótulos de interface 100% traduzidos. | P2 |
| A19 | **Hardware:** ✅/❌ são emojis do sistema (cores fora da paleta, não acessíveis, diferentes em cada Android). | P2 |
| A20 | **Plots de Hardware/PID** têm legenda do Plotly à direita ocupando ~25% da largura, tipografia e margens diferentes do visualizador, e há um "pisca" de tamanho errado ao trocar de seção (o plot é desenhado estreito e depois redimensionado). | P2 |
| A21 | **Linhas de Mensagens clicáveis sem pista visual** (só `cursor:pointer`); botões MSG/ERR/EV não deixam claro o estado marcado/desmarcado. | P2 |
| A22 | Verde `#1baf7a` × `#008300` e laranja `#eb6834` × vermelho `#e34948` são pares difíceis para daltonismo; só a cor distingue as séries. | P3 |
| A23 | Faltam: `viewport-fit=cover` e `env(safe-area-inset-*)` (recortes/barras do Android), `meta theme-color`, `dvh` (há `100vh` em `.table-wrap`), `overscroll-behavior`. | P3 |
| A24 | Preferências de UI não persistem (largura da barra lateral, descrições, modo foco). Só tema e idioma. | P3 |

O que **já está bom** e deve ser preservado: paleta de séries e sombreado de modos (claro e escuro), foco visível, `prefers-reduced-motion`, alvo de toque de 40 px em `pointer: coarse`, modo escuro, chips com remoção, painel ativo destacado com borda azul, busca com atalho `/`, gestos próprios de toque com amortecimento.

## 3. Formatos de tela (contrato de breakpoints)

Substituir o par atual (`max-width:860px` ou `pointer:coarse` + `max-height:520px`) por três modos. Usar classes no `<html>` ou `<body>` definidas por `matchMedia` em JS (uma vez, em `setup()` e no `resize`), para que CSS e JS compartilhem a mesma decisão (hoje `DRAWER_QUERY` em `SpeedLog.js:437` duplica a media query do CSS).

| Modo | Condição | Barra superior + ferramentas | Barra lateral |
|---|---|---|---|
| `desktop` | largura > 860 **e** altura > 600 | atual, com os ajustes das seções 4 e 5 | acoplada (grade) |
| `compact` (paisagem baixa, rádios) | altura ≤ 600 (qualquer largura) | **2 linhas, 84 px no total** (ver UX-01) | gaveta sobreposta; acoplada se largura ≥ 800 |
| `phone` | largura ≤ 600 e retrato | 3 linhas, ≤ 128 px (ver UX-01) | gaveta sobreposta |
| `tablet` | 601 a 860 de largura e altura > 600 | como `desktop` mas com gaveta | gaveta sobreposta |

Alvos de medida (a verificar na seção 7):

- `compact` 640×360: plot ≥ 220 px por painel visível; um painel cabe inteiro sem rolar.
- `compact` 854×480: dois painéis de ≥ 180 px cabem sem rolar.
- `phone` 390×844: dois painéis de ≥ 220 px cabem sem rolar.

## 4. Especificações por tarefa

Legenda de responsável: **D** = designer (`SpeedLog.css`, aparência em `index.html`), **F** = front end (JS, estrutura HTML, i18n). Cada tarefa lista os arquivos para respeitar "um escritor por arquivo".

### Fase 1: layout compacto e correções críticas (P0)

#### UX-01: Barra superior e ferramentas por formato (D + F)
Arquivos: `index.html`, `SpeedLog.css`, `SpeedLog.js` (`setup`, `show_tab`), `views.js` (`update_view_tabs`, ~linha 353 `--topbar-h`), `i18n.js`.

`compact` (meta: 84 px de chrome):
- **Linha 1, 44 px:** `[☰ 40px] [logo só ícone] [vistas: Log | Hardware | PID] [chip do arquivo, flex:1, elipse] [Abrir (ícone)] [Idioma] [Tema]`. Rótulos curtos das vistas via novas chaves `view.viewer_short` ("Log"), `view.hardware_short` ("Hardware"), `view.pid_short` ("PID"); o segmentado nunca rola nem corta.
- **Linha 2, 40 px (`.wbar`):** abas Gráficos/Parâmetros/Mensagens à esquerda (contadores escondidos); à direita três botões de ícone 40×40: Modos de voo (alternância, `aria-pressed`), Redefinir zoom (⟲), + Painel. Textos viram `title`/`aria-label` (já existem as chaves `plot.*`).
- **Legenda de modos (`#modeLegend`) escondida** em `compact`: os nomes já aparecem como anotação no plot.
- **Modo foco** (novo botão ⛶ na linha 2): esconde as duas linhas com `transform: translateY(-100%)` e deixa uma alça de 28×28 no canto superior esquerdo para voltar. Estado em memória (sem persistência obrigatória). O plot passa a ocupar a altura toda.
- Cabeçalho do painel em 36 px: título vira só o número ("1"), chips numa única linha com rolagem horizontal (`flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none`), ícones 36 px.

`phone` (meta: ≤ 128 px):
- **Linha 1, 48 px:** `[☰] [logo] [chip do arquivo, flex:1] [Abrir (ícone)] [⋮]`. O menu **⋮** contém Idioma, Tema e "Detalhes do log" (UX-04). Cuidado: menu simples, fechando ao tocar fora, `aria-haspopup="menu"`.
- **Linha 2, 36 px:** segmentado de vistas (rótulos curtos), largura total.
- **Linha 3, 40 px:** abas do Log à esquerda (com rolagem horizontal se precisar) e à direita ícones: Modos, Redefinir zoom, + Painel.

`desktop`: manter como está, mas a linha de ferramentas ganha `title` com atalhos (UX-20) e o chip do arquivo deixa de cortar o firmware (ver UX-04).

Pronto quando: as medidas da seção 3 passam em 640×360, 854×480 e 390×844; nenhuma aba de vista fica cortada; nenhum controle precisa de rolagem para ser alcançado; os rótulos existem em PT e EN.

#### UX-02: Painéis: corte do plot e barra de ferramentas em toque (D + F)
Arquivos: `SpeedLog.css`, `SpeedLog.js` (`plot_config`, `build_layout`, `add_panel`).

- **Corte (A3):** trocar `.panel { flex: 1 0 260px }` por `flex: 1 0 auto; min-height: 240px` e `.plotbox { flex: 1 1 220px; min-height: 180px }` para que o plot nunca perca altura quando o cabeçalho cresce. Chips em uma linha com rolagem horizontal em `compact` e `phone` (ver UX-01); em `desktop` podem quebrar.
- **Barra do Plotly (A2):** `displayModeBar: TOUCH ? false : 'hover'` em `plot_config()`. Em toque, os gestos (`setup_touch`) fazem pan/pinça/toque duplo. Mover **Salvar PNG** para o cabeçalho do painel como botão de ícone (`.panel-actions`, ao lado de limpar e remover) em todos os formatos, chamando `export_png(p.plot)`. Em desktop a barra continua no hover para zoom/pan.
- **Eixo Y (A9):** remover o título girado e colocar a unidade como anotação horizontal no canto superior esquerdo da área do plot (`xref:'paper', yref:'paper', x:0, y:1, xanchor:'left', yanchor:'bottom'`, 12 px, `--text-secondary`), com `margin.t` de 22 px. Recupera ~20 px de largura em tela estreita. Unidades distintas ficam separadas por vírgula como hoje.
- **Espessura da linha:** 1,6 px no desktop e 2 px em `pointer: coarse` (visibilidade ao sol).

Pronto quando: em 390 px com 2 linhas de chips (ou rolagem lateral) o eixo X aparece sempre; em toque não há ícones sobre o traço; PNG sai pelo botão do cabeçalho em desktop e Android (`window.AndroidBridge`).

#### UX-03: Gaveta de campos e fluxo de escolha (D + F)
Arquivos: `index.html`, `SpeedLog.css`, `SpeedLog.js` (`render_tree`, `set_active`, `load_log`, `add_panel`, handlers de `sideToggle`), `i18n.js`.

- **Fundo escurecido (scrim)** `rgba(0,0,0,.35)` abaixo da barra superior em `phone`/`tablet`/`compact` quando a gaveta está aberta; tocar nele, `Esc` ou o botão **✕** (40×40, no cabeçalho da gaveta) fecham. Gaveta com `role="dialog"` e foco preso enquanto aberta.
- **Cabeçalho fixo da gaveta:** `[Campos → Painel 2 ▾]` onde o seletor lista os painéis (alvo dos campos que forem marcados), `[✕]`. Acima da busca. Em `desktop` o mesmo seletor aparece compacto acima da busca (resolve o "qual painel recebe?" de A6).
- **Contexto do que já está plotado (A6):** na árvore, campo plotado em **outro** painel ganha um ponto na cor da série + rótulo `P1` (pequeno, `--text-secondary`) em vez de ficar desmarcado e sem pista; o checkbox continua refletindo o painel ativo. Contador no botão ☰ (bolinha com o total de traços) quando a gaveta está fechada.
- **Visibilidade do resultado:** em `compact` com largura ≥ 800 a gaveta é **acoplada** (coluna de 280 px) para que o plot atualize ao lado; nos demais formatos, ao marcar um campo, mostrar um toast curto "Adicionado ao Painel 2" com ação "Ver" que fecha a gaveta.
- **Primeiro uso:** no primeiro carregamento de um log em formato com gaveta, abrir a gaveta automaticamente uma vez. No painel vazio, o texto "Marque campos na barra lateral" ganha o botão **Escolher campos** quando a barra está escondida.

Pronto quando: em 390×844 é possível, sem instruções, abrir o log, escolher dois campos e ver o gráfico em ≤ 4 toques; a gaveta fecha de 3 jeitos; sempre se sabe qual painel está recebendo.

#### UX-04: Identidade do arquivo e idioma (D + F)
Arquivos: `index.html`, `SpeedLog.css`, `SpeedLog.js` (`load_log`, `open_param_file`), `views.js`, `i18n.js`.

- Chip do arquivo (`#fileInfo`) passa a ser um botão sempre visível (nome com elipse, tamanho/duração só no desktop). Toque/clique abre **"Detalhes do log"** (popover no desktop, folha inferior no celular): nome completo, tamanho, firmware (`fw_string`), placa (`flight_controller`), duração, nº de tipos e de mensagens. Dados já existem em `load_log`; só falta apresentar.
- Botão de idioma: ícone de globo + código atual, `aria-label` "Idioma: Português" e `title` "Mudar para English" (A16). No `phone` vai para o menu ⋮.

### Fase 2: atrito frequente (P1)

#### UX-05: Tooltip e eixo de tempo (F, `SpeedLog.js`)
- `hovertemplate`: trocar `%{y:.6g}` por `%{y:.6~g}` (remove zeros à direita; **verificar** que a versão do d3-format embutida no Plotly aceita `~`; senão formatar `y` em `build_traces` com `toPrecision(6)` + `Number()`).
- Cabeçalho do tooltip: tempo sem separador de milhar e com 3 casas (`xaxis.hoverformat: '.3f'`) mais o sufixo ` s`. Opcional: rótulos do eixo X em `mm:ss` quando o log passar de 10 min (via `tickvals`/`ticktext`, recalculado em `refresh_all`).

#### UX-06: Cursor sincronizado entre painéis (F, `SpeedLog.js`)
- Em `plotly_hover`/`plotly_unhover` de um painel, chamar `Plotly.Fx.hover(outro, { xval })` nos demais (com trava para não entrar em laço) e mostrar a linha de mira (`spike`) em todos. Throttle com `requestAnimationFrame`.
- **Toque:** um toque simples (sem arrasto) fixa o cursor naquele instante e exibe uma **faixa de leitura** fixa (largura total, 36 px, sob o último painel ou sobre o topo do primeiro) com `t = 612,340 s` e o valor de cada traço (cor + nome + valor + unidade); botão ✕ remove. Substitui o tooltip flutuante, que em tela de 360 px cobre os dados. *Precisa de validação em rádio real.*
- O marcador (`state.marker`, linha pontilhada azul) continua independente.

#### UX-07: Abas Parâmetros e Mensagens (D + F)
Arquivos: `SpeedLog.css`, `SpeedLog.js` (`show_tab`, `render_params`, `render_messages`, `render_kinds`), `i18n.js`.
- Ao ativar uma aba que não é Gráficos, a barra lateral é recolhida automaticamente (classe `collapsed`), e o botão ☰ só aparece quando a aba é Gráficos. A tabela usa a largura toda (hoje `.table-wrap.narrow { max-width: 1100px }` mantém o corte).
- **Parâmetros:** linha compacta de 1 linha (nome mono + valor + unidade; descrição de 1 linha com elipse, expandida ao tocar na linha). Alterados durante o log: ponto de destaque na cor `--accent` e `era X` já existe, mover para uma segunda linha pequena. Filtro "Só alterados" vira chip com estado claro. Em `phone`/`compact`: cartões empilhados (nome + valor na primeira linha, descrição com `-webkit-line-clamp:2` abaixo); sem cabeçalho de tabela.
- **Mensagens:** botões MSG/ERR/EV com ícone de marcação (✓) quando ativos e contagem; `ERR` com borda esquerda de 3 px em `--critical`; ícone ⌖ na linha (aparece no hover e sempre em toque) para indicar "marcar este instante nos gráficos"; linha tocável com área ≥ 44 px em toque. `.table-wrap` com `max-height: calc(100dvh - var(--chrome-h))` (usar `dvh`, não `vh`).

#### UX-08: Vistas Hardware e PID: navegação e seleção inicial (D + F)
Arquivos: `views.js` (`run_tool`, `make_sections`), `SpeedLog.css`, `SpeedLog.js` se necessário.
- Ao entrar, **abrir a primeira seção** automaticamente (Hardware: "Firmware"; PID: "Dados de voo") e remover o estado vazio (`#hwEmpty`, `#pidEmpty` só se não houver nada para mostrar).
- Em `phone`/`compact`/`tablet` a lista de seções (`.tool-nav`) vira **faixa horizontal de chips com rolagem** acima do conteúdo, em vez de gaveta: trocar de seção é 1 toque. O botão ☰ some nessas vistas nesses formatos. O formulário de setup do PID vira um acordeão "Configuração" no topo (aberto até o primeiro cálculo, depois recolhido mostrando um resumo "Eixo PIDR · janela 512 · 13 a 1315 s").
- Em `desktop` a navegação lateral permanece.

#### UX-09: Setup e resultado da Análise de PID (D + F)
Arquivos: `markup.js`, `pid.js`, `SpeedLog.css`, `i18n_tools.js`. **Atenção:** `markup.js` diz "Generated by tools/port_tools.cjs, do not edit", mas esse script **não existe** em `tools/` (só `build_descriptions.cjs`, `supplement.json`, `translations_pt.json`). Confirmar com o gerente que `markup.js` passou a ser fonte editável, e então atualizar/remover o cabeçalho enganoso.
- **Formulário:** um único cartão, sem `fieldset` aninhado; grupos com rótulo de 12 px: "Janela FFT" (select), "Intervalo de análise" (início/fim em segundos, dois campos lado a lado), "Eixo" (chips: RATE Roll/Pitch/Yaw, PID R/P/Y; desabilitados com `title` explicando "sem dados no log"). Tudo em PT: "Configuração", "Janela FFT", "Intervalo", "Eixo", **"Calcular"**.
- **Botão Calcular:** estados: normal → `Calcular`; processando → `Calculando…` com spinner e `aria-busy`, desabilitado; concluído sem mudanças → `Atualizado ✓` desabilitado; após mudar qualquer campo volta a `Calcular`. Durante o cálculo, escurecer o resultado antigo (não apagar) e usar a barra do overlay com texto da etapa ("Lendo RATE… / Calculando FFT…").
- **Domínio da frequência (A13):** reordenar para **gráfico primeiro**: faixa de controles compactos acima do gráfico (segmentados "Linear | dB | PSD" e "Linear | Log" + "Hz | RPM") numa linha; o gráfico ocupa ≥ 55% da altura útil; a tabela "Testes" fica abaixo, com rolagem horizontal contida no próprio cartão, primeira coluna fixa (`position:sticky; left:0`) e cabeçalhos que quebram em 2 linhas. Pode ser feito com `display:flex` + `order` se a estrutura do `markup.js` permitir; senão reorganizar a marcação.

#### UX-10: Contraste e tipografia (D, `SpeedLog.css`)
- Claro: `--text-muted` de `#85847f` para ~`#6a6963` (≥ 4,5:1 sobre `--surface-1` e `--surface-2`); revisar `--text-secondary` só se necessário. Escuro: manter `#8e8d86` (já passa).
- Texto secundário (`.fdesc`, `.funit`, `.badge`, `.count`, `.hint`, `.pextra`, `.was`): mínimo 12 px; em `pointer: coarse` 12,5 px.
- Botão primário: `#2a78d6` com texto branco dá ~4,4:1; escurecer levemente o `--accent` do tema claro (ex.: `#1f6bc7`) **ou** usar texto `#fff` em peso 600 (decidir olhando as séries, `--series-1` é o mesmo azul; se mudar, mudar só `--accent` e não a série).
- Anotar no CSS qual é a razão de contraste de cada token (comentário de uma linha) para o próximo ajuste.

#### UX-11: Tela inicial e carregamento (D + F)
Arquivos: `index.html`, `SpeedLog.css`, `SpeedLog.js` (`open_file`, `show_overlay`), `views.js`, `i18n.js`.
- Em `pointer: coarse`: título "Escolha um log" e subtítulo "Toque no botão abaixo para escolher um arquivo `.bin`"; botão primário grande **Abrir log** dentro do cartão (alvo 52 px); remover a palavra "solte". Em `pointer: fine`, manter "Solte um log DataFlash aqui" e acrescentar uma linha pequena: "Também abre arquivos `.param` (só o Relatório de Hardware)".
- Overlay de carregamento: mostrar nome e tamanho do arquivo, etapa atual ("Lendo", "Indexando", "Lendo descrições") e tempo decorrido; para arquivos > 150 MB mostrar aviso discreto "Arquivos grandes podem demorar e usar muita memória no celular". Nas vistas Hardware/PID o texto "Carregando…" deve dizer o que está sendo feito ("Analisando sensores…", "Calculando FFT…"); passar a mensagem em `run_tool`.

### Fase 3: ganhos claros (P2)

#### UX-12: Barra lateral de campos (D + F)
- Descrições dos campos (`.fdesc`) ocultas por padrão em `phone`/`compact`, com interruptor "Mostrar descrições" no cabeçalho da barra (lembrar em `localStorage`, dentro de `try/catch` como o tema); no desktop visíveis por padrão em 1 linha com elipse e `title` completo. Cada campo tem altura de 32 px (40 em toque) em vez de ~60.
- Unidade em coluna fixa à direita com `font-variant-numeric: tabular-nums` e `--text-secondary`.
- Cabeçalho do tipo expandido fica **fixo** (`position: sticky; top: 0`) enquanto os campos rolam.
- Campo de busca: placeholder curto ("Buscar mensagens e campos"), atalho `/` como `<kbd>` à direita (some em toque), botão ✕ para limpar quando há texto.
- Área de arrasto do `#resizer`: 10 px (hoje 6 px com margem negativa) com ponteiro "grip" visível no hover.

#### UX-13: Predefinições de gráfico (F + D)
Menu "Predefinições" na barra de ferramentas: um toque monta painéis prontos. Sugestões iniciais (usar só tipos que existem no log; esconder o que faltar): **Atitude** (`ATT.Roll/Pitch/Yaw`), **Altitude** (`CTUN.Alt`, `CTUN.DAlt`, `BARO.Alt`), **Bateria** (`BAT.Volt`, `BAT.Curr`), **Vibração** (`VIBE.VibeX/Y/Z`), **Motores** (`RCOU.C1..C4`), **GPS** (`GPS.NSats`, `GPS.HDop`), **RC** (`RCIN.C1..C4`). Definidas como dados num objeto no topo de `SpeedLog.js`, fácil de estender.

#### UX-14: Controle de painéis (F + D)
Botão **Maximizar** (⤢) por painel: ocupa a área de trabalho (os demais ficam ocultos até voltar); mover para cima/baixo no menu ⋯ do painel; opção de altura (Pequeno 180, Médio 260, Grande 400) em `desktop`. Painel ativo continua com a borda azul.

#### UX-15: Hardware: status acessíveis (F + D, `hardware.js`, `SpeedLog.css`)
Trocar ✅/❌ por `<span class="st ok|bad|warn">` com ícone SVG + texto (`OK`, `Falha`, `Aviso`) e tokens de cor (`--ok`, `--critical`, `--warn`) claro/escuro; garantir que o significado não dependa só da cor (ícone com formas distintas). Traduzir os rótulos fixos de interface (a descrição gerada continua como está).

#### UX-16: Plots de Hardware/PID alinhados ao visualizador (F, `hardware.js`, `pid.js`)
- Função compartilhada de tema do Plotly (reaproveitar `theme_colors()` e `build_layout` base) para fonte, grade, `modebar`, `hoverlabel`, cores de série.
- Legenda **horizontal acima** do plot (ou clicável nos chips) em vez de coluna à direita; em `phone` sem legenda lateral.
- Corrigir o "pisca" de tamanho ao trocar de seção: desenhar o plot só depois que a seção estiver visível e com `Plotly.Plots.resize` no `requestAnimationFrame` seguinte.

### Fase 4: acabamento (P3)

- **UX-17: Daltonismo e sol:** para os slots 5 a 8 usar `dash` distinto (`dash`, `dot`, `dashdot`, `longdash`) além da cor, refletido no ponto do chip (`.chip .dot` vira mini traço). Interruptor "Alto contraste" (também nas ⋮) que aumenta `--text-*`, bordas e espessura de linha; opcional.
- **UX-18: Plataforma:** `meta viewport` com `viewport-fit=cover`; `padding` com `env(safe-area-inset-*)` na barra superior e nas bordas; `meta theme-color` (claro e escuro, atualizado em `theme_changed`); `100vh` → `100dvh`; `overscroll-behavior: contain` nos painéis roláveis; `-webkit-tap-highlight-color: transparent`; `touch-action` correto nos botões.
- **UX-19: Atalhos (desktop):** `?` abre uma folha com a lista; `S` barra lateral, `M` modos, `R` reset de zoom, `P` novo painel, `F` modo foco, `/` busca (existe). Mostrar o atalho no `title` de cada botão.
- **UX-20: Persistência de preferências de UI** (largura da barra lateral, descrições, modo foco, alto contraste) em `localStorage` com `try/catch`, chaves no padrão `logviewerlite-*`.
- **UX-21: Tema:** ciclo claro / escuro / automático no botão de tema (hoje só alterna e fixa).

## 5. Contrato entre designer e front end

Para trabalharem em paralelo sem pisar um no outro, estes nomes são fixos (o front end cria o elemento, o designer estiliza):

| Nome | Onde | Uso |
|---|---|---|
| `html.mode-desktop`, `.mode-compact`, `.mode-phone`, `.mode-tablet` | `<html>` | definido por JS; o CSS dos formatos usa isso em vez de repetir media queries |
| `#sideScrim` | irmão de `.app` | fundo da gaveta (`hidden` quando fechada) |
| `.side-top` | dentro de `.sidebar` | cabeçalho com `#targetPanel` (select/menu) e `#sideClose` |
| `.dot-elsewhere`, `.elsewhere` | linha do campo | ponto de cor e rótulo `P#` de campo plotado em outro painel |
| `#focusBtn`, `.focus-handle`, `body.focus` | topo | modo foco |
| `#overflowBtn`, `#overflowMenu` | topo | menu ⋮ em `phone` |
| `#fileInfo` como `<button>`, `#fileSheet` | topo | detalhes do log |
| `.readout` | fim de `#panels` | faixa de leitura do cursor |
| `.st.ok`, `.st.bad`, `.st.warn` | vistas de ferramenta | status com ícone e texto |
| `--ok`, `--warn` | `:root` e temas | cores de status; `--critical` já existe |
| `--chrome-h` | `:root` | altura total fixa (barra superior + ferramentas), medida em JS como `--topbar-h` hoje (`views.js`) |

Chaves de i18n novas devem entrar em PT e EN em `i18n.js` / `i18n_tools.js` na mesma tarefa; nenhum texto fixo em HTML sem `data-i18n`.

## 6. Ordem de execução e regras de concorrência

`SpeedLog.js` tem **um escritor por vez**. Ordem recomendada:

1. **Lote A** (F em `SpeedLog.js`, D em `SpeedLog.css`, em paralelo): UX-02 (`plot_config`, `build_layout`, painel) e a base de modos (`html.mode-*`, `--chrome-h`) de UX-01.
2. **Lote B** (F): UX-01 (HTML/JS da barra e modo foco) e UX-04. D estiliza em paralelo usando o contrato da seção 5.
3. **Lote C** (F): UX-03 (gaveta, alvo do painel, indicador de "plotado em outro painel"). Depende do lote B.
4. **Lote D** (F em `views.js`, `pid.js`, `hardware.js`, `markup.js`; D em CSS): UX-08, UX-09, UX-15, UX-16. **Não** tocar `SpeedLog.js` neste lote.
5. **Lote E** (F em `SpeedLog.js`): UX-05, UX-06, UX-07, UX-11, UX-12, UX-13, UX-14.
6. **Lote F** (D): UX-10 (tokens) pode ir em qualquer momento do lote A em diante, só mexe em `:root`.
7. Fase 4 por último.

Regras de cada lote: o agente roda `npm run lint` antes de reportar; verifica nos formatos da seção 7; **não commita** (só quando o usuário pedir); não edita `modules/`.

## 7. Plano de verificação (por lote e no fim)

Subir `python -m http.server 8000 --bind 127.0.0.1` na raiz do repo, abrir `http://127.0.0.1:8000/`, carregar o log de exemplo (comando na seção 0) e conferir:

| Viewport | Verificar |
|---|---|
| 1440×900 claro e escuro | barra lateral acoplada; seletor de painel alvo; cursor sincronizado entre 3 painéis; tooltip sem zeros à direita; Parâmetros/Mensagens sem barra lateral; chip do arquivo mostra firmware |
| 1280×800 | nada quebra; atalhos funcionam |
| 960×540 (rádio grande) | formato `compact`; chrome ≤ 84 px; dois painéis visíveis |
| 854×480 | idem; barra lateral acoplada ou gaveta sem cobrir o plot |
| 640×360 | um painel inteiro sem rolar; vistas Log/Hardware/PID visíveis; modo foco funciona |
| 390×844 | 3 linhas de cabeçalho ≤ 128 px; fluxo "abrir → escolher campos → ver gráfico" em ≤ 4 toques; sem ícones do Plotly sobre o traço; eixo X sempre visível |
| Hardware e PID em 390×844 e 854×480 | primeira seção aberta; chips de seção; formulário PID em acordeão; botão Calcular com estados |

Checagens transversais: contraste dos tokens (ferramenta de contraste no navegador) ≥ 4,5:1 em texto pequeno; alvos de toque ≥ 44 px (≥ 40 px aceitável em ícones agrupados); foco por teclado visível em todos os controles novos; PT e EN sem texto cortado; nenhum erro no console.

**Validação que só se faz fora desta sessão** (reportar como "não verificado" se não houver aparelho): pinça, pan e toque duplo em rádio real; a faixa de leitura por toque (UX-06); gaveta e folhas no WebView do APK; abrir um log grande (≥ 200 MB) em aparelho com pouca memória (a leitura inteira para `ArrayBuffer` em `read_file` é risco de falta de memória no Android; isso é assunto do agente `backend`, só registrado aqui).

## 8. Decisões que ficam para o usuário

**Resolvidas em 2026-10-27:** o usuário aceitou as quatro como implementadas (modo foco e predefinições no escopo; `--accent` do tema claro `#1f6bc7`; rótulos curtos Log / Hardware / PID; `markup.js` como fonte editável).

1. **Modo foco e predefinições** (UX-01, UX-13) são recursos novos, não só ajustes. Confirmar que entram no escopo.
2. **Cor do botão primário** (UX-10): escurecer o azul do tema claro muda levemente a identidade; alternativa é só peso de fonte maior.
3. **Rótulos curtos das vistas** ("Log / Hardware / PID") em formatos estreitos: aceitar a abreviação em PT ("Hardware" e "PID" já são curtos; "Log" substitui "Visualizador de Log").
4. **`markup.js` como fonte editável** (UX-09), por causa do cabeçalho "do not edit" sem gerador no repositório.
