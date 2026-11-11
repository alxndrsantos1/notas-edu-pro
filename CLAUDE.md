# Notas Edu Pro

Ajuda a extrair as notas do AVA da Educação Profissional (o professor exporta as notas no AVA e carrega o arquivo aqui). Todo o processamento é feito no navegador. Publicado em `https://notas-edu-pro.onrender.com` e em `/fechamento/` do domínio principal.

## Arquivos e build
- App em Vite (JavaScript puro): `index.html`, `style.css`, `script.js` e módulos em `js/`.
- Render: serviço estático `notas-edu-pro`, build `npm run build`, publica `dist`.
- `vite.config.ts` usa `base: './'` (caminhos relativos). **Não remova**: sem isso o site quebra em `/fechamento/`.
- `index.html` tem um pequeno script no `<head>` que leva `/fechamento` (sem barra) para `/fechamento/`, para os arquivos relativos carregarem. Mantenha.
- Bibliotecas vêm da CDN `cdnjs.cloudflare.com` (PapaParse, SheetJS, jsPDF, jsPDF-AutoTable, html2pdf): leitura de CSV e exportação em Excel e PDF.

## Visual
- `style.css` usa variáveis (`--primary` índigo, raios `--radius-*`) e um bloco final "Visual alinhado às Ferramentas do Professor". Para mudar cores, altere as variáveis em vez de cada regra.
- Cores azuis antigas foram trocadas por índigo, inclusive em `js/charts.js`, `js/weeks.js` e `js/matrix.js`.
- O cabeçalho `.print-header-only` só aparece na impressão. O PDF exportado ainda menciona "EduGrade" (nome antigo); só mude se o Alexandre pedir.
- O botão "dados de exemplo" (`#btnLoadDemo`) carrega uma turma fictícia, ótimo para testar.

## Idioma e público
- Tudo em português do Brasil (interface, textos, commits e respostas).
- Público: professores da rede estadual de SP (usam no computador e no celular, em redes de escola). Mantenha a interface simples e legível.

## Identidade visual (igual em todas as Ferramentas do Professor)
- Paleta índigo: botão principal `#4f46e5` (hover `#4338ca`), fundos suaves `#eef2ff`, texto `#0f172a` e `#475569`, bordas `#e2e8f0`.
- Fonte Plus Jakarta Sans (Google Fonts), fundo em degradê `#eef2ff` → `#fff` → `#faf5ff` com manchas de cor desfocadas.
- Cartões com cantos bem arredondados (24 a 28 px), botões e abas em formato pill (totalmente arredondados), ícones SVG no estilo Lucide.
- Só tema claro (sem modo escuro).
- Barra de topo com o logo do site e o botão "Ferramentas do Professor" que volta para `https://www.ferramentasdoprofessor.com.br/`.
- Rodapé: "Desenvolvido por Prof. Alexandre Santos" + link "Contato" para `https://www.ferramentasdoprofessor.com.br/contato/`. Não escreva "Especialista" no nome.
- Cores semânticas das etiquetas: âmbar = notas e faltas, azul-céu = AVA/fechamento, roxo = orientação, esmeralda = estágio.

## Privacidade
- Planilhas e relatórios têm dados de alunos (menores). Nunca coloque dados reais de alunos no repositório, em exemplos, testes ou capturas de tela. Use dados inventados.
- Nunca grave telefone, e-mail ou chaves de API em arquivos do repositório (os repositórios, exceto o vagas-ciee, são públicos).

## Fluxo de trabalho com Git
- Faça as mudanças numa branch `claude/<assunto>` a partir da `main` atualizada (`git fetch origin main`).
- Mudanças de visual, lógica ou novas funções: envie a branch e peça aprovação ao Alexandre antes do merge na `main`.
- Ajustes de texto pedidos de forma explícita podem ir direto para a `main`.
- O merge é um avanço direto (fast-forward): `git push origin <branch>:main`. Só faça se `main` for ancestral da branch.
- A `main` publica sozinha no Render. Não crie pull request se não for pedido.
- Não faça commit de `package-lock.json`, `node_modules/` nem `dist/`.
- Mensagens de commit em português, no imperativo, com o corpo explicando o porquê.
- O aviso do hook sobre "commit sem branch remota" pode aparecer atrasado: confirme com `git ls-remote --heads origin <branch>` antes de reenviar.

## Como testar
- Use o Playwright (já instalado: `require('playwright')`) e confira sempre em 1280 px e em 390 px de largura. Verifique que não há rolagem horizontal (`scrollWidth <= innerWidth`) e que não há erros de página.
- A rede da sessão bloqueia vários endereços (CDNs, Google Fonts, GoatCounter, onrender.com). Isso não é defeito do código: as fontes caem para a fonte do sistema e o contador não carrega nos testes locais.
- Capturas de tela com `fullPage` mostram a barra fixa no meio da página: é efeito da captura, não bug.
