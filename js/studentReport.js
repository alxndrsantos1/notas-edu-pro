import { extractWeekFromActivityName, isActivityCompleted, isEvaluativeColumn, parseFileNameInfo } from './rules.js';
import { appState } from './state.js';
import { cleanString, escapeHtml, normalizeString, showToast } from './utils.js';

// ==============================================================================
// 13. RELATÓRIO COMPLETO DO ALUNO (todas as matérias, por bimestre, para imprimir)
// ==============================================================================
// Junta, para um aluno, cada "Pause e Responda" e cada "Registro de Aula" de todos os
// arquivos carregados. O bimestre vem do nome do arquivo (ex.: "2DS_Logica..._4BI.csv")
// e, se não houver, da semana no nome da atividade (ex.: "S12"), pelas faixas editáveis.

const NOMES_BIM = { 1: '1º bimestre', 2: '2º bimestre', 3: '3º bimestre', 4: '4º bimestre', 0: 'Sem bimestre identificado' };
const NOMES_BIM_CURTO = { 1: '1º bim.', 2: '2º bim.', 3: '3º bim.', 4: '4º bim.', 0: 'Sem bim.' };
const NOMES_TIPO = { pause: 'Pause e Responda', registro: 'Registro de Aula' };

export function bimestreDoArquivo(fileName) {
  return parseFileNameInfo(fileName).bimestre;
}

// Nome da matéria sem turma e sem bimestre, para juntar o mesmo componente de bimestres diferentes
export function materiaDoArquivo(file) {
  const isFirst = appState.processedFiles[0] === file;
  if (isFirst && appState.customDisciplinaName) return appState.customDisciplinaName;
  return parseFileNameInfo(file.fileName).materia || file.subjectName || 'Matéria';
}

// Número da aula no código do AVA: "Pause e Responda (S21A3a)" -> 3
function numeroDaAula(nome) {
  const m = nome.match(/S\d{1,2}A(\d{1,2})/i);
  return m ? parseInt(m[1], 10) : null;
}

function bimestreDaSemana(semana) {
  if (semana === null || semana === undefined) return 0;
  const faixa = appState.studentReport.ranges.find(r => semana >= r.de && semana <= r.ate);
  return faixa ? faixa.bim : 0;
}

function turmaAtual() {
  if (appState.customTurmaName) return appState.customTurmaName;
  const comTurma = appState.processedFiles.map(f => parseFileNameInfo(f.fileName).turma).find(Boolean);
  return comTurma || '';
}

// O RA só serve de chave se for único no arquivo e diferente do nome (evita fundir a turma toda)
function raConfiavel(file) {
  const ras = file.students
    .filter(st => normalizeString(st.ra) !== normalizeString(st.name))
    .map(st => normalizeString(st.ra))
    .filter(ra => ra && ra !== '-');
  return ras.length === file.students.length && new Set(ras).size === ras.length;
}

// Lista única de alunos de todos os arquivos, com as linhas de cada arquivo
export function coletarAlunos() {
  const porChave = new Map();
  const chaveDoNome = new Map();
  appState.processedFiles.forEach(file => {
    const usaRa = raConfiavel(file);
    file.students.forEach((st, i) => {
      const nomeKey = normalizeString(st.name);
      const raKey = usaRa ? `ra:${normalizeString(st.ra)}` : null;
      const chave = (raKey && porChave.has(raKey)) ? raKey : (chaveDoNome.get(nomeKey) || raKey || `nome:${nomeKey}`);
      if (!porChave.has(chave)) {
        porChave.set(chave, { key: chave, name: st.name, ra: st.ra, refs: [] });
      }
      const aluno = porChave.get(chave);
      if ((!aluno.ra || aluno.ra === '-') && st.ra && st.ra !== '-') aluno.ra = st.ra;
      chaveDoNome.set(nomeKey, chave);
      aluno.refs.push({ file, rowIndex: st.rowIndex !== undefined ? st.rowIndex : i });
    });
  });
  return Array.from(porChave.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

// Todas as atividades avaliativas do aluno, sem filtro, na ordem de exibição
export function atividadesDoAluno(aluno) {
  const lista = [];
  const ordemMateria = new Map();
  let seq = 0;
  aluno.refs.forEach(({ file, rowIndex }) => {
    const row = file.rawRows && file.rawRows[rowIndex];
    if (!row) return;
    const datas = (file.rowDates && file.rowDates[rowIndex]) || {};
    const bimArquivo = bimestreDoArquivo(file.fileName);
    const materia = materiaDoArquivo(file);
    if (!ordemMateria.has(materia)) ordemMateria.set(materia, ordemMateria.size);
    file.headers.forEach(h => {
      if (!isEvaluativeColumn(h, 'both')) return;
      const semana = extractWeekFromActivityName(h);
      const valor = cleanString(row[h]);
      lista.push({
        materia,
        bim: bimArquivo || bimestreDaSemana(semana),
        semana,
        aula: numeroDaAula(h),
        tipo: isEvaluativeColumn(h, 'pause') ? 'pause' : 'registro',
        nome: h.replace(/\s\(\d+\)$/, ''),
        situacao: valor || 'Não concluído',
        feita: isActivityCompleted(valor),
        data: datas[h] || '',
        ordem: seq++
      });
    });
  });
  const bimOrdem = b => (b === 0 ? 9 : b);
  lista.sort((a, b) =>
    ordemMateria.get(a.materia) - ordemMateria.get(b.materia) ||
    bimOrdem(a.bim) - bimOrdem(b.bim) ||
    ((a.semana ?? 999) - (b.semana ?? 999)) ||
    ((a.aula ?? 999) - (b.aula ?? 999)) ||
    (a.tipo === b.tipo ? 0 : a.tipo === 'pause' ? -1 : 1) ||
    a.ordem - b.ordem
  );
  return lista;
}

function filtrar(lista) {
  const { excludedBims, excludedTipos, excludedMaterias } = appState.studentReport;
  return lista.filter(a => !excludedBims.has(a.bim) && !excludedTipos.has(a.tipo) && !excludedMaterias.has(a.materia));
}

// Data do AVA ("2026-10-28 12:48:57") no formato brasileiro ("28/10/2026 12:48")
function dataBr(texto) {
  const m = (texto || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return texto || '';
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ''}`;
}

function nota(feitas, total) {
  return total > 0 ? (Math.round((feitas / total) * 100) / 10).toFixed(1).replace('.', ',') : '—';
}

function porcento(feitas, total) {
  return total > 0 ? `${Math.round((feitas / total) * 100)}%` : '—';
}

function listaComE(itens) {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

// HTML de um relatório (usado na pré-visualização e na impressão)
export function htmlRelatorio(aluno) {
  const todas = atividadesDoAluno(aluno);
  const lista = filtrar(todas);
  const bims = [...new Set(lista.map(a => a.bim))].sort((a, b) => (a || 9) - (b || 9));
  const materias = [...new Set(lista.map(a => a.materia))];
  const turma = turmaAtual();
  const tipos = ['pause', 'registro'].filter(t => !appState.studentReport.excludedTipos.has(t)).map(t => NOMES_TIPO[t]);
  const hoje = new Date().toLocaleDateString('pt-BR');
  const temData = lista.some(a => a.data);

  let html = `<article class="sr-doc">
  <header class="sr-head">
    <h2>Relatório de atividades do aluno</h2>
    <p class="sr-sub">${escapeHtml(listaComE(tipos))}${bims.length ? ` · ${escapeHtml(listaComE(bims.map(b => NOMES_BIM[b])))}` : ''}</p>
    <dl class="sr-meta">
      <div><dt>Aluno(a)</dt><dd>${escapeHtml(aluno.name)}</dd></div>
      ${aluno.ra && aluno.ra !== '-' ? `<div><dt>RA (Código SED)</dt><dd>${escapeHtml(aluno.ra)}</dd></div>` : ''}
      ${turma ? `<div><dt>Turma</dt><dd>${escapeHtml(turma)}</dd></div>` : ''}
      <div><dt>Gerado em</dt><dd>${hoje}</dd></div>
    </dl>
  </header>`;

  if (lista.length === 0) {
    html += `<p class="sr-vazio">Nenhuma atividade encontrada para este aluno com os filtros escolhidos.</p></article>`;
    return html;
  }

  // Resumo: matéria x bimestre
  const conta = (m, b) => {
    const sel = lista.filter(a => (m === null || a.materia === m) && (b === null || a.bim === b));
    return { feitas: sel.filter(a => a.feita).length, total: sel.length };
  };
  html += `<h3 class="sr-h3">Resumo</h3>
  <table class="sr-table sr-resumo"><thead><tr><th>Matéria</th>${bims.map(b => `<th>${NOMES_BIM_CURTO[b]}</th>`).join('')}<th>Total</th><th>Nota</th></tr></thead><tbody>`;
  materias.forEach(m => {
    const t = conta(m, null);
    html += `<tr><td>${escapeHtml(m)}</td>${bims.map(b => { const c = conta(m, b); return `<td>${c.total ? `${c.feitas}/${c.total}` : '—'}</td>`; }).join('')}<td><strong>${t.feitas}/${t.total}</strong> <span class="sr-pct">(${porcento(t.feitas, t.total)})</span></td><td><strong>${nota(t.feitas, t.total)}</strong></td></tr>`;
  });
  const g = conta(null, null);
  if (materias.length > 1) {
    html += `<tr class="sr-total"><td>Todas as matérias</td>${bims.map(b => { const c = conta(null, b); return `<td>${c.feitas}/${c.total}</td>`; }).join('')}<td><strong>${g.feitas}/${g.total}</strong> <span class="sr-pct">(${porcento(g.feitas, g.total)})</span></td><td><strong>${nota(g.feitas, g.total)}</strong></td></tr>`;
  }
  html += `</tbody></table>
  <p class="sr-nota">Nota = atividades concluídas ÷ total × 10, como no restante do sistema.</p>`;

  // Detalhe: matéria > bimestre > atividades
  materias.forEach(m => {
    html += `<section class="sr-materia"><h3 class="sr-h3">${escapeHtml(m)}</h3>`;
    bims.forEach(b => {
      const itens = lista.filter(a => a.materia === m && a.bim === b);
      if (!itens.length) return;
      const feitas = itens.filter(a => a.feita).length;
      html += `<h4 class="sr-h4">${NOMES_BIM[b]} <span>${feitas} de ${itens.length} concluídas (${porcento(feitas, itens.length)})</span></h4>
      <table class="sr-table"><thead><tr><th class="sr-c">Semana</th><th>Atividade</th><th>Tipo</th><th>Situação</th>${temData ? '<th>Concluída em</th>' : ''}</tr></thead><tbody>`;
      itens.forEach(a => {
        html += `<tr class="${a.feita ? 'sr-ok' : 'sr-pend'}"><td class="sr-c">${a.semana ?? '—'}</td><td>${escapeHtml(a.nome)}</td><td>${NOMES_TIPO[a.tipo]}</td><td class="sr-sit">${a.feita ? '✔ Concluída' : '✘ Não concluída'}</td>${temData ? `<td>${escapeHtml(dataBr(a.data)) || '—'}</td>` : ''}</tr>`;
      });
      html += `</tbody></table>`;
    });
    html += `</section>`;
  });

  const r = appState.studentReport.ranges;
  html += `<footer class="sr-foot">Bimestre de cada atividade: pelo nome do arquivo (quando indica o bimestre) ou pela semana da atividade (${r.map(x => `${x.bim}º = S${x.de} a S${x.ate}`).join('; ')}). Gerado pelo Notas Edu Pro · ferramentasdoprofessor.com.br</footer>
  </article>`;
  return html;
}

// Estilo da página de impressão (independente do site)
const CSS_IMPRESSAO = `
@page { size: A4; margin: 14mm 12mm; }
* { box-sizing: border-box; }
body { margin: 0; font: 11px/1.4 "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif; color: #0f172a; background: #fff; }
.barra { position: sticky; top: 0; display: flex; gap: 8px; align-items: center; justify-content: space-between; padding: 10px 14px; background: #eef2ff; border-bottom: 1px solid #c7d2fe; font-size: 13px; }
.barra button { font: inherit; font-weight: 700; padding: 8px 18px; border: 0; border-radius: 999px; background: #4f46e5; color: #fff; cursor: pointer; }
.paginas { padding: 14px; }
.sr-doc { break-after: page; page-break-after: always; }
.sr-doc:last-child { break-after: auto; page-break-after: auto; }
.sr-head { border-bottom: 2px solid #4f46e5; padding-bottom: 8px; margin-bottom: 10px; }
.sr-head h2 { margin: 0; font-size: 17px; }
.sr-sub { margin: 2px 0 8px; color: #475569; }
.sr-meta { display: flex; flex-wrap: wrap; gap: 4px 22px; margin: 0; }
.sr-meta div { display: flex; gap: 6px; }
.sr-meta dt { color: #475569; }
.sr-meta dd { margin: 0; font-weight: 700; }
.sr-h3 { font-size: 13px; margin: 14px 0 6px; }
.sr-h4 { font-size: 11.5px; margin: 10px 0 4px; display: flex; justify-content: space-between; gap: 8px; }
.sr-h4 span { font-weight: 500; color: #475569; }
.sr-table { width: calc(100% - 2px); border-collapse: collapse; }
.sr-table th, .sr-table td { border: 1px solid #cbd5e1; padding: 3px 6px; text-align: left; vertical-align: top; }
.sr-table th { background: #f1f5f9; font-size: 10px; }
.sr-table tr { break-inside: avoid; page-break-inside: avoid; }
.sr-c { text-align: center !important; width: 52px; }
.sr-pend .sr-sit { color: #be123c; font-weight: 700; }
.sr-ok .sr-sit { color: #047857; }
.sr-total td { background: #f8fafc; font-weight: 700; }
.sr-pct { color: #475569; font-weight: 400; }
.sr-nota, .sr-foot { color: #475569; font-size: 9.5px; margin-top: 6px; }
.sr-foot { margin-top: 14px; border-top: 1px solid #e2e8f0; padding-top: 6px; }
.sr-materia { break-inside: auto; }
.sr-vazio { padding: 20px 0; color: #475569; }
@media print { .barra { display: none; } .paginas { padding: 0; } }
`;

function documentoImpressao(corpo, titulo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(titulo)}</title><style>${CSS_IMPRESSAO}</style></head><body>
<div class="barra"><span>Use "Salvar como PDF" no destino da impressão para guardar o arquivo.</span><button type="button" onclick="window.print()">Imprimir</button></div>
<div class="paginas">${corpo}</div>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},300)});<\/script>
</body></html>`;
}

function abrirImpressao(corpo, titulo) {
  const html = documentoImpressao(corpo, titulo);
  const janela = window.open('', '_blank');
  if (janela) {
    janela.document.open();
    janela.document.write(html);
    janela.document.close();
    janela.focus();
    return;
  }
  // Janela bloqueada: imprime por um quadro invisível
  const quadro = document.createElement('iframe');
  quadro.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(quadro);
  quadro.contentDocument.open();
  quadro.contentDocument.write(html.replace(/<script>[\s\S]*?<\/script>/, ''));
  quadro.contentDocument.close();
  setTimeout(() => {
    quadro.contentWindow.focus();
    quadro.contentWindow.print();
    setTimeout(() => quadro.remove(), 2000);
  }, 300);
}

// ------------------------------------------------------------------------------
// Tela da aba
// ------------------------------------------------------------------------------
function chip(grupo, valor, rotulo, marcado, extra = '') {
  return `<label class="sr-chip${marcado ? ' on' : ''}"><input type="checkbox" data-grupo="${grupo}" value="${escapeHtml(String(valor))}"${marcado ? ' checked' : ''}> ${escapeHtml(rotulo)}${extra}</label>`;
}

export function renderStudentReportView() {
  const secao = document.getElementById('officialStudentReportSection');
  if (!secao) return;
  const sel = document.getElementById('srAluno');
  const preview = document.getElementById('srPreview');
  const st = appState.studentReport;

  const alunos = coletarAlunos();
  if (alunos.length === 0) {
    if (sel) sel.innerHTML = '';
    if (preview) preview.innerHTML = '<p class="sr-vazio">Carregue os arquivos do AVA para montar o relatório.</p>';
    return;
  }
  if (!alunos.some(a => a.key === st.key)) st.key = alunos[0].key;
  const aluno = alunos.find(a => a.key === st.key);

  sel.innerHTML = alunos.map(a => `<option value="${escapeHtml(a.key)}"${a.key === st.key ? ' selected' : ''}>${escapeHtml(a.name)}</option>`).join('');

  // Opções a partir das atividades do aluno (antes dos filtros)
  const todas = atividadesDoAluno(aluno);
  const conta = (campo, v) => todas.filter(a => a[campo] === v).length;
  const bims = [...new Set(todas.map(a => a.bim))].sort((a, b) => (a || 9) - (b || 9));
  const materias = [...new Set(todas.map(a => a.materia))];

  document.getElementById('srBims').innerHTML = bims.length
    ? bims.map(b => chip('bim', b, NOMES_BIM[b], !st.excludedBims.has(b), ` <small>(${conta('bim', b)})</small>`)).join('')
    : '<span class="sr-hint">Nenhuma atividade de Pause e Responda ou Registro encontrada.</span>';
  document.getElementById('srTipos').innerHTML = ['pause', 'registro']
    .map(t => chip('tipo', t, NOMES_TIPO[t], !st.excludedTipos.has(t), ` <small>(${conta('tipo', t)})</small>`)).join('');
  document.getElementById('srMaterias').innerHTML = materias
    .map(m => chip('materia', m, m, !st.excludedMaterias.has(m), ` <small>(${conta('materia', m)})</small>`)).join('');

  const faixas = document.getElementById('srRanges');
  if (faixas && !faixas.dataset.pronto) {
    faixas.innerHTML = st.ranges.map((r, i) => `<label class="sr-range">${r.bim}º bimestre: semanas <input type="number" min="1" max="60" data-faixa="${i}" data-campo="de" value="${r.de}"> a <input type="number" min="1" max="60" data-faixa="${i}" data-campo="ate" value="${r.ate}"></label>`).join('');
    faixas.dataset.pronto = '1';
  }

  preview.innerHTML = htmlRelatorio(aluno);
}

export function initStudentReport() {
  const secao = document.getElementById('officialStudentReportSection');
  if (!secao) return;
  const st = appState.studentReport;

  secao.addEventListener('change', e => {
    const alvo = e.target;
    if (alvo.id === 'srAluno') {
      st.key = alvo.value;
    } else if (alvo.dataset.grupo) {
      const conjunto = { bim: st.excludedBims, tipo: st.excludedTipos, materia: st.excludedMaterias }[alvo.dataset.grupo];
      const valor = alvo.dataset.grupo === 'bim' ? parseInt(alvo.value, 10) : alvo.value;
      if (alvo.checked) conjunto.delete(valor); else conjunto.add(valor);
    } else if (alvo.dataset.faixa !== undefined) {
      const n = parseInt(alvo.value, 10);
      if (!Number.isFinite(n) || n < 1) return;
      st.ranges[parseInt(alvo.dataset.faixa, 10)][alvo.dataset.campo] = n;
    } else {
      return;
    }
    renderStudentReportView();
  });

  document.getElementById('srPrint')?.addEventListener('click', () => {
    const aluno = coletarAlunos().find(a => a.key === st.key);
    if (!aluno) { showToast('Carregue os arquivos e escolha um aluno.', 'error'); return; }
    abrirImpressao(htmlRelatorio(aluno), `Relatório - ${aluno.name}`);
  });

  document.getElementById('srPrintAll')?.addEventListener('click', () => {
    const alunos = coletarAlunos();
    if (!alunos.length) { showToast('Carregue os arquivos primeiro.', 'error'); return; }
    abrirImpressao(alunos.map(a => htmlRelatorio(a)).join(''), `Relatórios - Turma ${turmaAtual() || ''}`.trim());
  });
}
