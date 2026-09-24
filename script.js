/**
 * ==============================================================================
 * EduGrade - Sistema de Fechamento de Notas e Relatórios Escolares Oficiais
 * ==============================================================================
 * Padrão Oficial:
 * - Página 1: Relatório de Resultados em Matriz (por Turma, Alunos, Disciplinas e Total)
 * - Página 2: Gráfico de Desempenho Total de Atividades por Aluno (Histograma com Média)
 * - Página 3: Auditoria Individual de Atividades (Pause e Responda / Registro)
 * 
 * Processamento 100% Client-side (Privacidade total / LGPD)
 * ==============================================================================
 */

// Estado Global da Aplicação
const appState = {
  // Lista de arquivos processados com dados brutos
  processedFiles: [], 
  // Alunos consolidados individualmente
  studentsData: [], 
  // Matriz consolidada de alunos x disciplinas (Padrão Oficial)
  matrixData: {
    turmaName: '',
    subjects: [], // Lista de nomes de matérias
    students: [], // Lista de objetos de alunos com notas por matéria
    averageActivities: 0
  },
  // Modalidade de cálculo ativa: 'both' | 'pause' | 'registro'
  activityMode: 'both',
  // Aba de visualização ativa: 'matrixView' | 'chartView' | 'listView'
  activeTab: 'matrixView',
  // Filtros ativos
  filters: {
    searchQuery: '',
    selectedSubject: 'all',
    gradeStatus: 'all'
  },
  // Ordenação
  sort: {
    column: 'name',
    direction: 'asc'
  },
  selectedFileForMapping: null,
  selectedStudentForModal: null
};

// ==============================================================================
// 1. INICIALIZAÇÃO
// ==============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initDragAndDrop();
  initFileInputs();
  initActivityModeSelector();
  initViewTabs();
  initColumnMappingModal();
  initFiltersAndSearch();
  initTableSorting();
  initExportButtons();
  initStudentModalEvents();
  initPdfModalEvents();
  initDemoButton();
  
  // Inicia o programa limpo, sem carregar dados de exemplo por padrão
  recalculateAllGrades();
});

function cleanString(str) {
  if (str === undefined || str === null) return '';
  return str
    .toString()
    .replace(/^\uFEFF/, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

function normalizeString(str) {
  return cleanString(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '⚠️';

  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ==============================================================================
// 2. REGRAS DE NEGÓCIO E CLASSIFICAÇÃO DE COLUNAS
// ==============================================================================

function extractSubjectFromFileName(fileName) {
  if (!fileName) return 'Geral';
  let baseName = fileName.replace(/\.[^/.]+$/, '');
  baseName = baseName.replace(/[_-]+/g, ' ');
  baseName = baseName.replace(/([a-zA-Z])([0-9]+[a-zA-Z]?)/g, '$1 $2');
  return baseName.trim();
}

function isEvaluativeColumn(header, mode = appState.activityMode) {
  if (!header) return false;
  const norm = normalizeString(header);
  const hasPause = norm.includes('pause e responda');
  const hasRegistro = norm.includes('registro');

  if (mode === 'pause') return hasPause;
  if (mode === 'registro') return hasRegistro;
  return hasPause || hasRegistro;
}

function findStudentNameColumn(headers, sampleRows = []) {
  if (!headers || headers.length === 0) return 'Nome';

  const directTerms = [
    'nome_aluno', 'nome do aluno', 'nome aluno', 'nome completo', 'aluno', 
    'estudante', 'nome do estudante', 'nome', 'student', 'discente', 'usuario'
  ];

  for (const term of directTerms) {
    const found = headers.find(h => {
      const norm = normalizeString(h);
      return norm === term || norm.startsWith(term + ' ') || norm.replace(/\s+/g, '_') === term;
    });
    if (found) return found;
  }

  const partialNome = headers.find(h => {
    const norm = normalizeString(h);
    if (!norm.includes('nome')) return false;
    return !norm.includes('materia') && !norm.includes('disciplina') && !norm.includes('turma') && !norm.includes('pause') && !norm.includes('registro');
  });
  if (partialNome) return partialNome;

  if (sampleRows && sampleRows.length > 0) {
    for (const h of headers) {
      if (isEvaluativeColumn(h, 'both')) continue;
      const values = sampleRows.map(r => cleanString(r[h])).filter(Boolean);
      const hasFullNames = values.some(v => v.includes(' ') && isNaN(Number(v)) && v.length > 4);
      if (hasFullNames) return h;
    }
  }

  const firstNonEval = headers.find(h => !isEvaluativeColumn(h, 'both'));
  return firstNonEval || headers[0];
}

function findStudentRAColumn(headers) {
  if (!headers || headers.length === 0) return 'RA';

  const raTerms = [
    'codigo sed', 'código sed', 'ra', 'registro do aluno', 'ra do aluno', 
    'matricula', 'matrícula', 'id sed', 'id do aluno', 'sed', 'rm', 'cpf', 'id'
  ];

  for (const term of raTerms) {
    const found = headers.find(h => {
      const norm = normalizeString(h);
      return norm === term || norm.startsWith(term + ' ');
    });
    if (found) return found;
  }

  const nonEval = headers.filter(h => !isEvaluativeColumn(h, 'both'));
  return nonEval.length > 1 ? nonEval[1] : (headers[1] || headers[0]);
}

function isActivityCompleted(cellValue) {
  if (cellValue === undefined || cellValue === null) return false;
  const val = normalizeString(cellValue);
  return (
    val === 'concluido' ||
    val === 'concluida' ||
    val === 'feito' ||
    val === 'sim' ||
    val === 'completed' ||
    val === '1' ||
    val === '100%' ||
    val === 'ok'
  );
}

// ==============================================================================
// 3. CONSOLIDAÇÃO DA MATRIZ OFICIAL (PÁGINA 1) E GRÁFICO (PÁGINA 2)
// ==============================================================================

/**
 * Constrói a Matriz Oficial de Resultados consolidando todos os arquivos/matérias.
 */
function buildOfficialMatrix() {
  if (appState.processedFiles.length === 0) {
    appState.matrixData = {
      turmaName: '',
      subjects: [],
      students: [],
      averageActivities: 0
    };
    return;
  }

  // Lista única de matérias preservando a ordem de inserção
  const subjectsMap = new Map();
  appState.processedFiles.forEach(file => {
    subjectsMap.set(file.subjectName, {
      name: file.subjectName,
      totalActivities: file.totalActivities,
      fileRef: file
    });
  });

  const subjectsList = Array.from(subjectsMap.values());

  // Agrupa os alunos pelo nome normalizado
  const studentsMap = new Map();

  appState.processedFiles.forEach(file => {
    file.students.forEach(st => {
      const key = normalizeString(st.name);
      if (!studentsMap.has(key)) {
        studentsMap.set(key, {
          name: st.name,
          ra: st.ra,
          subjectScores: {},
          totalCompleted: 0,
          overallMaxActivities: 0
        });
      }

      const entry = studentsMap.get(key);
      const gradeVal = st.totalActivities > 0 
        ? Math.round((st.completedActivities / st.totalActivities) * 100) / 10 
        : 0;

      entry.subjectScores[file.subjectName] = {
        completed: st.completedActivities,
        total: st.totalActivities,
        percentage: st.percentage,
        grade: st.grade !== undefined ? st.grade : gradeVal
      };
    });
  });

  // Calcula totais de cada aluno
  const consolidatedStudents = Array.from(studentsMap.values()).map(student => {
    let totalCompleted = 0;
    let totalMax = 0;

    subjectsList.forEach(sub => {
      const score = student.subjectScores[sub.name] || { completed: 0, total: sub.totalActivities, percentage: 0, grade: 0 };
      totalCompleted += score.completed;
      totalMax += score.total;
    });

    return {
      ...student,
      totalCompleted,
      totalMax,
      overallPercentage: totalMax > 0 ? Math.round((totalCompleted / totalMax) * 100) : 0,
      overallGrade: totalMax > 0 ? Math.round(((totalCompleted / totalMax) * 10) * 10) / 10 : 0
    };
  });

  // Ordena por nome para o diário de classe
  consolidatedStudents.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  // Calcula a média da turma
  const totalSum = consolidatedStudents.reduce((acc, s) => acc + s.totalCompleted, 0);
  const avg = consolidatedStudents.length > 0 ? (totalSum / consolidatedStudents.length) : 0;

  // Tenta inferir nome da turma
  let inferredTurma = 'Turma 3A';
  const firstFileName = appState.processedFiles[0].fileName;
  const match = firstFileName.match(/([0-9]+[a-zA-Z])/);
  if (match) {
    inferredTurma = `Turma ${match[1].toUpperCase()}`;
  }

  appState.matrixData = {
    turmaName: inferredTurma,
    subjects: subjectsList,
    students: consolidatedStudents,
    averageActivities: Math.round(avg * 10) / 10
  };
}

/**
 * Renderiza a Tabela em Matriz (Página 1 do PDF oficial).
 */
function renderMatrixReport() {
  const thead = document.getElementById('reportMatrixThead');
  const tbody = document.getElementById('reportMatrixTbody');
  const turmaTitle = document.getElementById('reportTurmaTitle');
  const timestampEl = document.getElementById('reportLiveTimestamp');
  const criteriaLabel = document.getElementById('matrixActiveCriteriaLabel');

  if (!thead || !tbody) return;

  const { turmaName, subjects, students } = appState.matrixData;

  if (turmaTitle) turmaTitle.textContent = turmaName ? `Relatório de Resultados − ${turmaName}` : 'Relatório de Resultados';
  if (timestampEl) {
    if (students.length > 0) {
      const now = new Date();
      timestampEl.textContent = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } else {
      timestampEl.textContent = '';
    }
  }

  if (criteriaLabel) {
    const labels = {
      both: 'Ambos (Pause e Responda + Registro)',
      pause: 'Somente "Pause e Responda"',
      registro: 'Somente "Registro"'
    };
    criteriaLabel.textContent = labels[appState.activityMode];
  }

  if (students.length === 0 || subjects.length === 0) {
    thead.innerHTML = `
      <tr>
        <th class="student-idx-col">#</th>
        <th class="student-name-col">Nome_Aluno</th>
        <th>Nenhuma Matéria Carregada</th>
        <th>Total de Atividades Concluídas</th>
      </tr>
    `;
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="padding: 32px 16px; color: #64748b; text-align: center;">
          <div style="font-size: 1.6rem; margin-bottom: 6px;">📂</div>
          <strong style="color: #334155;">Nenhum relatório carregado ainda</strong><br>
          <span style="font-size: 0.85rem; color: #64748b;">Faça upload de arquivos CSV acima ou clique em "✨ Carregar Dados de Exemplo".</span>
        </td>
      </tr>
    `;
    return;
  }

  // Identifica o rótulo do critério ativo para exibir no cabeçalho das sub-colunas
  let subColLabel = 'Ambos';
  let subColTooltip = 'Contabilizando Pause e Responda + Registro';
  if (appState.activityMode === 'pause') {
    subColLabel = 'Pause e Responda';
    subColTooltip = 'Contabilizando somente Pause e Responda';
  } else if (appState.activityMode === 'registro') {
    subColLabel = 'Registro';
    subColTooltip = 'Contabilizando somente Registro';
  } else {
    subColLabel = 'Ambos (P&R + Reg)';
    subColTooltip = 'Contabilizando Pause e Responda + Registro';
  }

  // Linha 1 de Cabeçalho: Matérias agrupadas com colspan="2"
  let row1 = `
    <tr>
      <th rowspan="2" class="student-idx-col">#</th>
      <th rowspan="2" class="student-name-col">Nome_Aluno</th>
  `;

  // Linha 2 de Cabeçalho: Sub-colunas (Critério selecionado e Nota de 0 a 10)
  let row2 = `<tr>`;

  subjects.forEach(sub => {
    row1 += `<th colspan="2" class="subject-header">${escapeHtml(sub.name)}</th>`;
    row2 += `
      <th class="sub-col-header sub-col-criteria" title="${subColTooltip}">${subColLabel}</th>
      <th class="sub-col-header sub-col-grade" title="Nota de 0 a 10 (100% = 10,0)">Nota</th>
    `;
  });

  row1 += `<th rowspan="2" class="subject-header">Total de Atividades Concluídas<br><span style="font-weight: 600; font-size: 0.72rem; color: #1e40af;">(${subColLabel})</span></th></tr>`;
  row2 += `</tr>`;

  thead.innerHTML = row1 + row2;

  // Renderiza as Linhas dos Alunos
  tbody.innerHTML = '';

  students.forEach((st, idx) => {
    const tr = document.createElement('tr');
    let cells = `
      <td class="student-idx-col">${idx + 1}</td>
      <td class="student-name-col">${escapeHtml(st.name)}</td>
    `;

    subjects.forEach(sub => {
      const score = st.subjectScores[sub.name] || { completed: 0, total: sub.totalActivities, percentage: 0, grade: 0 };
      
      // Cálculo da nota de 0 a 10 (sendo 100% igual a 10,0)
      let gradeVal = 0;
      if (score.grade !== undefined && score.grade > 0) {
        gradeVal = score.grade;
      } else if (score.total > 0) {
        gradeVal = (score.completed / score.total) * 10;
      } else if (score.percentage !== undefined) {
        gradeVal = score.percentage / 10;
      }

      const gradeStr = (Math.round(gradeVal * 10) / 10).toFixed(1).replace('.', ',');

      cells += `
        <td class="val-col">${score.completed}</td>
        <td class="grade-col">${gradeStr}</td>
      `;
    });

    cells += `<td class="total-col">${st.totalCompleted}</td>`;
    tr.innerHTML = cells;
    tbody.appendChild(tr);
  });
}

/**
 * Renderiza o Gráfico de Desempenho Total de Atividades por Aluno (Página 2 do PDF oficial).
 */
function renderPerformanceChart() {
  const container = document.getElementById('chartSvgWrapper');
  const avgBadge = document.getElementById('chartAverageBadge');
  if (!container) return;

  const { students, averageActivities } = appState.matrixData;

  if (avgBadge) {
    avgBadge.textContent = students.length > 0 ? `Média da Turma: ${averageActivities.toFixed(1)}` : 'Média da Turma: -';
  }

  if (students.length === 0) {
    container.innerHTML = `
      <div style="padding: 60px 20px; text-align: center; color: #64748b;">
        <div style="font-size: 2rem; margin-bottom: 8px;">📊</div>
        <strong style="color: #334155;">Nenhum dado para exibir no gráfico</strong><br>
        <span style="font-size: 0.85rem; color: #64748b;">Faça upload de arquivos CSV acima ou carregue o exemplo para visualizar o gráfico de desempenho.</span>
      </div>
    `;
    return;
  }

  // Ordena os alunos em ordem crescente para formar o gráfico em escada idêntico ao modelo
  const sortedStudents = [...students].sort((a, b) => a.totalCompleted - b.totalCompleted);

  // Dimensões do SVG
  const svgWidth = Math.max(900, sortedStudents.length * 48);
  const svgHeight = 520;
  const marginLeft = 65;
  const marginRight = 80;
  const marginTop = 40;
  const marginBottom = 150;

  const chartWidth = svgWidth - marginLeft - marginRight;
  const chartHeight = svgHeight - marginTop - marginBottom;

  // Valor máximo para a escala do eixo Y
  const maxVal = Math.max(300, ...sortedStudents.map(s => s.totalCompleted));
  const yCeil = Math.ceil(maxVal / 100) * 100;

  // Função de mapeamento Y
  const getY = (val) => marginTop + chartHeight - (val / yCeil) * chartHeight;

  // Construção do SVG em string
  let svg = `<svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="chart-svg" xmlns="http://www.w3.org/2000/svg">`;

  // Linhas de Grade e Eixo Y (0, 100, 200, 300, etc.)
  for (let tick = 0; tick <= yCeil; tick += 100) {
    const yPos = getY(tick);
    svg += `
      <line x1="${marginLeft}" y1="${yPos}" x2="${marginLeft + chartWidth}" y2="${yPos}" stroke="#cbd5e1" stroke-width="0.8" />
      <text x="${marginLeft - 12}" y="${yPos + 4}" font-size="11" fill="#64748b" text-anchor="end" font-family="sans-serif">${tick}</text>
    `;
  }

  // Eixo Y e Eixo X
  svg += `
    <line x1="${marginLeft}" y1="${marginTop}" x2="${marginLeft}" y2="${marginTop + chartHeight}" stroke="#0f172a" stroke-width="1.5" />
    <line x1="${marginLeft}" y1="${marginTop + chartHeight}" x2="${marginLeft + chartWidth}" y2="${marginTop + chartHeight}" stroke="#0f172a" stroke-width="1.5" />
  `;

  // Rótulo do Eixo Y ("Total")
  svg += `
    <text x="20" y="${marginTop + chartHeight / 2}" font-size="12" font-weight="bold" fill="#0f172a" font-family="sans-serif" transform="rotate(-90 20 ${marginTop + chartHeight / 2})" text-anchor="middle">Total</text>
  `;

  // Linha da Média da Turma (Linha tracejada vermelha com caixa de texto na ponta)
  const avgY = getY(averageActivities);
  svg += `
    <line x1="${marginLeft}" y1="${avgY}" x2="${marginLeft + chartWidth + 10}" y2="${avgY}" stroke="#ef4444" stroke-width="2.5" stroke-dasharray="6,4" />
    <rect x="${marginLeft + chartWidth + 8}" y="${avgY - 12}" width="82" height="24" rx="4" fill="#ef4444" />
    <text x="${marginLeft + chartWidth + 49}" y="${avgY + 4}" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle" font-family="sans-serif">Média: ${averageActivities.toFixed(1)}</text>
  `;

  // Renderização das Barras e Rótulos
  const barStep = chartWidth / sortedStudents.length;
  const barWidth = Math.max(16, barStep - 8);

  sortedStudents.forEach((st, i) => {
    const barX = marginLeft + i * barStep + (barStep - barWidth) / 2;
    const barY = getY(st.totalCompleted);
    const bHeight = (marginTop + chartHeight) - barY;

    // Barra azul com contorno preto/escuro idêntica à imagem
    svg += `
      <rect 
        x="${barX}" 
        y="${barY}" 
        width="${barWidth}" 
        height="${bHeight}" 
        fill="#3b82f6" 
        stroke="#1e3a8a" 
        stroke-width="1.2"
        rx="2"
      >
        <title>${escapeHtml(st.name)}: ${st.totalCompleted} atividades</title>
      </rect>
    `;

    // Valor no topo da barra
    svg += `
      <text 
        x="${barX + barWidth / 2}" 
        y="${barY - 6}" 
        font-size="11" 
        font-weight="bold" 
        fill="#0f172a" 
        text-anchor="middle" 
        font-family="sans-serif"
      >
        ${st.totalCompleted}
      </text>
    `;

    // Nome do aluno rotacionado 90 graus no eixo X
    const labelX = barX + barWidth / 2;
    const labelY = marginTop + chartHeight + 12;

    svg += `
      <text 
        x="${labelX}" 
        y="${labelY}" 
        font-size="10" 
        font-weight="500" 
        fill="#1e293b" 
        text-anchor="end" 
        font-family="sans-serif" 
        transform="rotate(-90 ${labelX} ${labelY})"
      >
        ${escapeHtml(st.name)}
      </text>
    `;
  });

  // Rótulo do Eixo X ("Aluno")
  svg += `
    <text 
      x="${marginLeft + chartWidth / 2}" 
      y="${svgHeight - 10}" 
      font-size="12" 
      font-weight="bold" 
      fill="#0f172a" 
      text-anchor="middle" 
      font-family="sans-serif"
    >
      Aluno
    </text>
  `;

  svg += `</svg>`;
  container.innerHTML = svg;
}

// ==============================================================================
// 4. CONTROLE DE ABAS (TABS)
// ==============================================================================
function initViewTabs() {
  const tabButtons = document.querySelectorAll('.view-tab-btn');
  const officialReportSec = document.getElementById('officialReportSection');
  const officialChartSec = document.getElementById('officialChartSection');
  const officialListSec = document.getElementById('officialListSection');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      appState.activeTab = target;

      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (target === 'matrixView') {
        if (officialReportSec) officialReportSec.style.display = 'block';
        if (officialChartSec) officialChartSec.style.display = 'none';
        if (officialListSec) officialListSec.style.display = 'none';
      } else if (target === 'chartView') {
        if (officialReportSec) officialReportSec.style.display = 'none';
        if (officialChartSec) officialChartSec.style.display = 'block';
        if (officialListSec) officialListSec.style.display = 'none';
        renderPerformanceChart();
      } else if (target === 'listView') {
        if (officialReportSec) officialReportSec.style.display = 'none';
        if (officialChartSec) officialChartSec.style.display = 'none';
        if (officialListSec) officialListSec.style.display = 'block';
      }
    });
  });
}

// ==============================================================================
// 5. CÁLCULO GERAL E ATUALIZAÇÕES
// ==============================================================================

function computeGradesForFile(fileObj) {
  const { fileName, rawRows, headers, nameColumn, raColumn } = fileObj;
  const subjectName = extractSubjectFromFileName(fileName);
  const activeMode = appState.activityMode;

  const evaluativeColumns = headers.filter(h => isEvaluativeColumn(h, activeMode));
  const allEvaluativeColumns = headers.filter(h => isEvaluativeColumn(h, 'both'));
  const totalActivities = evaluativeColumns.length;

  const students = [];

  rawRows.forEach((row, index) => {
    const rawName = cleanString(row[nameColumn]);
    const rawRA = cleanString(row[raColumn]);

    if (!rawName && !rawRA) return;

    const studentName = rawName || `Aluno ${index + 1}`;
    const studentRA = rawRA || '-';

    const activitiesDetail = [];
    let completedCount = 0;

    evaluativeColumns.forEach(col => {
      const cellVal = cleanString(row[col]);
      const isDone = isActivityCompleted(cellVal);
      if (isDone) completedCount++;

      activitiesDetail.push({
        activityName: col,
        status: cellVal || 'Não concluído',
        isCompleted: isDone,
        isCountedInGrade: true
      });
    });

    if (activeMode !== 'both') {
      const excludedColumns = allEvaluativeColumns.filter(h => !isEvaluativeColumn(h, activeMode));
      excludedColumns.forEach(col => {
        const cellVal = cleanString(row[col]);
        activitiesDetail.push({
          activityName: col,
          status: cellVal || 'Não concluído',
          isCompleted: isActivityCompleted(cellVal),
          isCountedInGrade: false
        });
      });
    }

    let finalGrade = 0;
    let percentage = 0;

    if (totalActivities > 0) {
      finalGrade = (completedCount / totalActivities) * 10;
      percentage = (completedCount / totalActivities) * 100;
    }

    students.push({
      id: `${fileName}_${studentRA}_${index}`,
      name: studentName,
      ra: studentRA,
      subject: subjectName,
      fileName: fileName,
      completedActivities: completedCount,
      totalActivities: totalActivities,
      percentage: Math.round(percentage),
      grade: Math.round(finalGrade * 10) / 10,
      activities: activitiesDetail
    });
  });

  return {
    ...fileObj,
    subjectName,
    totalActivities,
    evaluativeColumns,
    studentCount: students.length,
    students
  };
}

function recalculateAllGrades() {
  appState.studentsData = [];

  appState.processedFiles = appState.processedFiles.map(fileObj => {
    const updated = computeGradesForFile(fileObj);
    appState.studentsData.push(...updated.students);
    return updated;
  });

  buildOfficialMatrix();
  renderMatrixReport();
  renderPerformanceChart();
  updateColumnsAlertBanner();
  updateSubjectFilterOptions();
  updateDashboardAndTable();
  renderUploadedFilesChips();
}

// ==============================================================================
// 6. PARSING DE ARQUIVOS COM PAPAPARSE
// ==============================================================================

function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    if (typeof Papa === 'undefined') {
      reject(new Error('A biblioteca PapaParse não está disponível.'));
      return;
    }

    Papa.parse(file, {
      header: false,
      skipEmptyLines: 'greedy',
      encoding: 'UTF-8',
      complete: (results) => {
        if (!results.data || results.data.length === 0) {
          reject(new Error(`O arquivo "${file.name}" está vazio.`));
          return;
        }

        const rawMatrix = results.data;
        let headerRowIndex = 0;

        for (let i = 0; i < Math.min(rawMatrix.length, 10); i++) {
          const rowText = rawMatrix[i].map(c => normalizeString(c)).join(' | ');
          if (
            rowText.includes('pause e responda') || 
            rowText.includes('registro') || 
            rowText.includes('nome') || 
            rowText.includes('aluno') || 
            rowText.includes('sed') || 
            rowText.includes('ra')
          ) {
            headerRowIndex = i;
            break;
          }
        }

        const headers = rawMatrix[headerRowIndex].map(h => cleanString(h)).filter(h => h.length > 0);
        const dataRows = [];

        for (let i = headerRowIndex + 1; i < rawMatrix.length; i++) {
          const rowVals = rawMatrix[i];
          if (!rowVals || rowVals.length === 0) continue;
          
          const rowObj = {};
          let hasVal = false;
          headers.forEach((h, idx) => {
            const v = cleanString(rowVals[idx]);
            if (v) hasVal = true;
            rowObj[h] = v;
          });

          if (hasVal) dataRows.push(rowObj);
        }

        if (dataRows.length === 0) {
          reject(new Error(`Nenhuma linha de alunos encontrada em "${file.name}".`));
          return;
        }

        const sampleRows = dataRows.slice(0, 5);
        const nameColumn = findStudentNameColumn(headers, sampleRows);
        const raColumn = findStudentRAColumn(headers);

        const rawFileObj = {
          fileName: file.name,
          headers,
          rawRows: dataRows,
          nameColumn,
          raColumn
        };

        const computed = computeGradesForFile(rawFileObj);
        resolve(computed);
      },
      error: (err) => {
        reject(new Error(`Erro ao ler "${file.name}": ${err.message}`));
      }
    });
  });
}

async function handleFilesSelected(files) {
  if (!files || files.length === 0) return;

  const validFiles = Array.from(files).filter(f => 
    f.name.toLowerCase().endsWith('.csv') || f.type === 'text/csv' || f.type === 'application/vnd.ms-excel'
  );

  if (validFiles.length === 0) {
    showToast('Por favor, selecione arquivos .csv válidos.', 'error');
    return;
  }

  showToast(`Processando ${validFiles.length} arquivo(s)...`, 'info');

  let addedCount = 0;

  for (const file of validFiles) {
    try {
      appState.processedFiles = appState.processedFiles.filter(f => f.fileName !== file.name);
      appState.studentsData = appState.studentsData.filter(s => s.fileName !== file.name);

      const processedData = await parseCsvFile(file);
      appState.processedFiles.push(processedData);
      appState.studentsData.push(...processedData.students);
      addedCount++;
    } catch (err) {
      console.error(err);
      showToast(err.message, 'error');
    }
  }

  if (addedCount > 0) {
    showToast(`${addedCount} arquivo(s) carregado(s)!`, 'success');
  }

  buildOfficialMatrix();
  renderMatrixReport();
  renderPerformanceChart();
  updateColumnsAlertBanner();
  updateSubjectFilterOptions();
  updateDashboardAndTable();
  renderUploadedFilesChips();
}

// ==============================================================================
// 7. SELETOR DE MODALIDADE E MAPEAMENTO DE COLUNAS
// ==============================================================================
function initActivityModeSelector() {
  const buttons = document.querySelectorAll('.segmented-btn[data-mode]');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      if (appState.activityMode === mode) return;

      appState.activityMode = mode;
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const labels = {
        both: 'Ambos (Pause e Responda + Registro)',
        pause: 'Somente "Pause e Responda"',
        registro: 'Somente "Registro"'
      };
      showToast(`Modalidade: ${labels[mode]}`, 'info');
      recalculateAllGrades();
    });
  });
}

function updateColumnsAlertBanner() {
  const banner = document.getElementById('columnsAlertBanner');
  const alertText = document.getElementById('columnsAlertText');
  if (!banner || !alertText) return;

  if (appState.processedFiles.length === 0) {
    banner.style.display = 'none';
    return;
  }

  banner.style.display = 'flex';
  const firstFile = appState.processedFiles[0];

  alertText.innerHTML = `
    Arquivo <strong>${escapeHtml(firstFile.fileName)}</strong>: 
    Nome identificado em <strong>"${escapeHtml(firstFile.nameColumn)}"</strong> 
    e RA em <strong>"${escapeHtml(firstFile.raColumn)}"</strong>.
  `;
}

function initColumnMappingModal() {
  const modal = document.getElementById('columnMappingModal');
  const openBtn = document.getElementById('btnOpenColumnMapping');
  const bannerChangeBtn = document.getElementById('btnChangeColumnsFromBanner');
  const closeBtn = document.getElementById('mappingModalCloseBtn');
  const cancelBtn = document.getElementById('mappingModalCancelBtn');
  const saveBtn = document.getElementById('mappingModalSaveBtn');

  const fileSelect = document.getElementById('mappingFileSelect');
  const nameSelect = document.getElementById('mappingNameColSelect');
  const raSelect = document.getElementById('mappingRaColSelect');
  const fileSelectorGroup = document.getElementById('mappingFileSelectorGroup');

  if (!modal) return;

  const openModal = () => {
    if (appState.processedFiles.length === 0) {
      showToast('Carregue ao menos um arquivo CSV.', 'info');
      return;
    }

    appState.selectedFileForMapping = appState.processedFiles[0];

    if (fileSelectorGroup) {
      if (appState.processedFiles.length > 1) {
        fileSelectorGroup.style.display = 'block';
        fileSelect.innerHTML = '';
        appState.processedFiles.forEach((f, idx) => {
          const opt = document.createElement('option');
          opt.value = f.fileName;
          opt.textContent = `${f.fileName} (${f.subjectName})`;
          if (idx === 0) opt.selected = true;
          fileSelect.appendChild(opt);
        });
      } else {
        fileSelectorGroup.style.display = 'none';
      }
    }

    populateColumnSelects();
    updateMappingPreview();
    modal.classList.add('active');
  };

  const closeModal = () => modal.classList.remove('active');

  if (openBtn) openBtn.addEventListener('click', openModal);
  if (bannerChangeBtn) bannerChangeBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  if (fileSelect) {
    fileSelect.addEventListener('change', () => {
      const selected = appState.processedFiles.find(f => f.fileName === fileSelect.value);
      if (selected) {
        appState.selectedFileForMapping = selected;
        populateColumnSelects();
        updateMappingPreview();
      }
    });
  }

  if (nameSelect) nameSelect.addEventListener('change', updateMappingPreview);
  if (raSelect) raSelect.addEventListener('change', updateMappingPreview);

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const curFile = appState.selectedFileForMapping;
      if (!curFile) return;

      curFile.nameColumn = nameSelect.value;
      curFile.raColumn = raSelect.value;

      recalculateAllGrades();
      closeModal();
      showToast(`Mapeamento atualizado para "${curFile.fileName}".`, 'success');
    });
  }
}

function populateColumnSelects() {
  const curFile = appState.selectedFileForMapping;
  const nameSelect = document.getElementById('mappingNameColSelect');
  const raSelect = document.getElementById('mappingRaColSelect');

  if (!curFile || !nameSelect || !raSelect) return;

  nameSelect.innerHTML = '';
  raSelect.innerHTML = '';

  curFile.headers.forEach(header => {
    const isEval = isEvaluativeColumn(header, 'both');
    const label = isEval ? `${header} (Atividade)` : header;

    const optName = document.createElement('option');
    optName.value = header;
    optName.textContent = label;
    if (header === curFile.nameColumn) optName.selected = true;
    nameSelect.appendChild(optName);

    const optRa = document.createElement('option');
    optRa.value = header;
    optRa.textContent = label;
    if (header === curFile.raColumn) optRa.selected = true;
    raSelect.appendChild(optRa);
  });
}

function updateMappingPreview() {
  const curFile = appState.selectedFileForMapping;
  const nameSelect = document.getElementById('mappingNameColSelect');
  const raSelect = document.getElementById('mappingRaColSelect');
  const tbody = document.getElementById('mappingPreviewTbody');

  if (!curFile || !nameSelect || !raSelect || !tbody) return;

  tbody.innerHTML = '';
  const sample = curFile.rawRows.slice(0, 3);

  sample.forEach((row, i) => {
    const tr = document.createElement('tr');
    const nameVal = cleanString(row[nameSelect.value]) || `Aluno ${i + 1}`;
    const raVal = cleanString(row[raSelect.value]) || '-';

    tr.innerHTML = `
      <td><strong>${escapeHtml(nameVal)}</strong></td>
      <td><code>${escapeHtml(raVal)}</code></td>
    `;
    tbody.appendChild(tr);
  });
}

// ==============================================================================
// 8. DRAG & DROP E UPLOAD
// ==============================================================================
function initDragAndDrop() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');

  if (!dropzone || !fileInput) return;

  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      handleFilesSelected(dt.files);
    }
  });

  dropzone.addEventListener('click', (e) => {
    if (e.target.closest('#btnLoadDemo')) return;
    fileInput.click();
  });
}

function initFileInputs() {
  const fileInput = document.getElementById('fileInput');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFilesSelected(e.target.files);
        e.target.value = '';
      }
    });
  }
}

function renderUploadedFilesChips() {
  const container = document.getElementById('uploadedFilesList');
  const card = document.getElementById('uploadedFilesCard');
  if (!container || !card) return;

  if (appState.processedFiles.length === 0) {
    card.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  card.style.display = 'block';
  container.innerHTML = '';

  appState.processedFiles.forEach((f) => {
    const chip = document.createElement('div');
    chip.className = 'file-chip';
    chip.innerHTML = `
      <div class="file-chip-info">
        <span class="file-chip-icon">📄</span>
        <div class="file-chip-meta">
          <div class="file-chip-name" title="${f.fileName}">${f.fileName}</div>
          <div class="file-chip-details">
            ${f.studentCount} alunos • ${f.totalActivities} atividades
          </div>
        </div>
      </div>
      <button class="file-remove-btn" title="Remover" data-filename="${f.fileName}">✕</button>
    `;

    chip.querySelector('.file-remove-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      removeFile(f.fileName);
    });

    container.appendChild(chip);
  });
}

function removeFile(fileName) {
  appState.processedFiles = appState.processedFiles.filter(f => f.fileName !== fileName);
  appState.studentsData = appState.studentsData.filter(s => s.fileName !== fileName);
  
  showToast(`Arquivo "${fileName}" removido.`, 'info');
  recalculateAllGrades();
}

// ==============================================================================
// 9. TABELA DINÂMICA DE CONSULTA E AUDITORIA (VISÃO 3)
// ==============================================================================
function initFiltersAndSearch() {
  const searchInput = document.getElementById('searchInput');
  const subjectFilter = document.getElementById('subjectFilter');
  const gradeFilter = document.getElementById('gradeFilter');
  const clearAllBtn = document.getElementById('clearAllBtn');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      appState.filters.searchQuery = e.target.value.toLowerCase().trim();
      renderTableRows();
    });
  }

  if (subjectFilter) {
    subjectFilter.addEventListener('change', (e) => {
      appState.filters.selectedSubject = e.target.value;
      renderTableRows();
    });
  }

  if (gradeFilter) {
    gradeFilter.addEventListener('change', (e) => {
      appState.filters.gradeStatus = e.target.value;
      renderTableRows();
    });
  }

  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      if (appState.studentsData.length === 0 && appState.processedFiles.length === 0) {
        showToast('O sistema já está limpo.', 'info');
        return;
      }
      if (confirm('Deseja limpar todos os dados carregados?')) {
        appState.processedFiles = [];
        appState.studentsData = [];
        appState.matrixData = {
          turmaName: '',
          subjects: [],
          students: [],
          averageActivities: 0
        };
        recalculateAllGrades();
        showToast('Dados limpos com sucesso.', 'info');
      }
    });
  }
}

function updateSubjectFilterOptions() {
  const select = document.getElementById('subjectFilter');
  if (!select) return;

  const currentVal = select.value;
  const uniqueSubjects = [...new Set(appState.studentsData.map(s => s.subject))].sort();

  select.innerHTML = '<option value="all">Todas as Matérias / Turmas</option>';
  uniqueSubjects.forEach(subject => {
    const opt = document.createElement('option');
    opt.value = subject;
    opt.textContent = subject;
    select.appendChild(opt);
  });

  if (uniqueSubjects.includes(currentVal)) {
    select.value = currentVal;
  } else {
    select.value = 'all';
    appState.filters.selectedSubject = 'all';
  }
}

function initTableSorting() {
  const headers = document.querySelectorAll('.grade-table th[data-sort]');
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const col = header.getAttribute('data-sort');
      if (appState.sort.column === col) {
        appState.sort.direction = appState.sort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        appState.sort.column = col;
        appState.sort.direction = 'asc';
      }

      headers.forEach(h => {
        h.classList.remove('sorted');
        const icon = h.querySelector('.sort-icon');
        if (icon) icon.textContent = '↕';
      });

      header.classList.add('sorted');
      const currentIcon = header.querySelector('.sort-icon');
      if (currentIcon) {
        currentIcon.textContent = appState.sort.direction === 'asc' ? '↑' : '↓';
      }

      renderTableRows();
    });
  });
}

function getFilteredAndSortedStudents() {
  let list = [...appState.studentsData];

  if (appState.filters.searchQuery) {
    const q = normalizeString(appState.filters.searchQuery);
    list = list.filter(student => 
      normalizeString(student.name).includes(q) || 
      normalizeString(student.ra).includes(q)
    );
  }

  if (appState.filters.selectedSubject !== 'all') {
    list = list.filter(student => student.subject === appState.filters.selectedSubject);
  }

  if (appState.filters.gradeStatus === 'approved') {
    list = list.filter(student => student.grade >= 6.0);
  } else if (appState.filters.gradeStatus === 'recovery') {
    list = list.filter(student => student.grade < 6.0);
  } else if (appState.filters.gradeStatus === 'perfect') {
    list = list.filter(student => student.grade === 10.0);
  }

  const { column, direction } = appState.sort;
  list.sort((a, b) => {
    let res = 0;
    if (column === 'name') res = a.name.localeCompare(b.name, 'pt-BR');
    else if (column === 'ra') res = a.ra.localeCompare(b.ra, 'pt-BR', { numeric: true });
    else if (column === 'subject') res = a.subject.localeCompare(b.subject, 'pt-BR');
    else if (column === 'completed') res = a.completedActivities - b.completedActivities;
    else if (column === 'grade') res = a.grade - b.grade;

    return direction === 'asc' ? res : -res;
  });

  return list;
}

function updateDashboardMetrics() {
  const totalStudentsEl = document.getElementById('statTotalStudents');
  const totalClassesEl = document.getElementById('statTotalClasses');
  const avgGradeEl = document.getElementById('statAvgGrade');
  const approvalRateEl = document.getElementById('statApprovalRate');

  const { students, subjects, averageActivities } = appState.matrixData;
  const total = students.length;

  if (total === 0) {
    if (totalStudentsEl) totalStudentsEl.textContent = '0';
    if (totalClassesEl) totalClassesEl.textContent = '0';
    if (avgGradeEl) avgGradeEl.textContent = '0,0';
    if (approvalRateEl) approvalRateEl.textContent = '0%';
    return;
  }

  const approvedCount = students.filter(s => s.overallGrade >= 6.0).length;
  const rate = Math.round((approvedCount / total) * 100);

  if (totalStudentsEl) totalStudentsEl.textContent = total.toString();
  if (totalClassesEl) totalClassesEl.textContent = subjects.length.toString();
  if (avgGradeEl) avgGradeEl.textContent = `${averageActivities.toFixed(1)} ativ.`;
  if (approvalRateEl) approvalRateEl.textContent = `${rate}%`;
}

function renderTableRows() {
  const tbody = document.getElementById('studentsTableBody');
  const emptyState = document.getElementById('tableEmptyState');
  const tableWrapper = document.getElementById('tableWrapper');
  const tableCountInfo = document.getElementById('tableCountInfo');

  if (!tbody) return;

  const students = getFilteredAndSortedStudents();

  if (tableCountInfo) {
    tableCountInfo.textContent = `Exibindo ${students.length} de ${appState.studentsData.length} registros`;
  }

  if (students.length === 0) {
    tbody.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    if (tableWrapper) tableWrapper.style.display = 'none';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (tableWrapper) tableWrapper.style.display = 'block';

  tbody.innerHTML = '';

  students.forEach((student) => {
    const tr = document.createElement('tr');

    let gradeBadgeClass = 'grade-high';
    let progressBarClass = 'high';
    let statusLabel = 'Aprovado';
    let statusPillClass = 'status-approved';

    if (student.grade < 5.0) {
      gradeBadgeClass = 'grade-low';
      progressBarClass = 'low';
      statusLabel = 'Abaixo da Média';
      statusPillClass = 'status-critical';
    } else if (student.grade < 6.0) {
      gradeBadgeClass = 'grade-medium';
      progressBarClass = 'medium';
      statusLabel = 'Em Atenção';
      statusPillClass = 'status-attention';
    }

    const formattedGrade = student.grade.toFixed(1).replace('.', ',');

    tr.innerHTML = `
      <td class="student-name-cell">${escapeHtml(student.name)}</td>
      <td><span class="student-ra-badge">${escapeHtml(student.ra)}</span></td>
      <td><span class="subject-badge">📚 ${escapeHtml(student.subject)}</span></td>
      <td>
        <div class="progress-container">
          <div class="progress-bar-bg">
            <div class="progress-bar-fill ${progressBarClass}" style="width: ${student.percentage}%;"></div>
          </div>
          <span class="progress-text">${student.completedActivities}/${student.totalActivities} (${student.percentage}%)</span>
        </div>
      </td>
      <td><span class="grade-badge ${gradeBadgeClass}">${formattedGrade}</span></td>
      <td>
        <span class="status-pill ${statusPillClass}">
          <span class="status-dot"></span>
          ${statusLabel}
        </span>
      </td>
      <td style="text-align: right;">
        <button class="btn btn-secondary btn-sm view-details-btn">🔍 Detalhes</button>
      </td>
    `;

    tr.querySelector('.view-details-btn').addEventListener('click', () => {
      openStudentModal(student);
    });

    tbody.appendChild(tr);
  });
}

function updateDashboardAndTable() {
  updateDashboardMetrics();
  renderTableRows();
}

function escapeHtml(string) {
  const div = document.createElement('div');
  div.textContent = string || '';
  return div.innerHTML;
}

// ==============================================================================
// 10. MODAL DE AUDITORIA DE ATIVIDADES
// ==============================================================================
function initStudentModalEvents() {
  const modal = document.getElementById('studentModal');
  const closeBtn = document.getElementById('modalCloseBtn');
  const closeFooterBtn = document.getElementById('modalCloseFooterBtn');

  if (!modal) return;

  const closeModal = () => modal.classList.remove('active');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (closeFooterBtn) closeFooterBtn.addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

function openStudentModal(student) {
  const modal = document.getElementById('studentModal');
  const nameEl = document.getElementById('modalStudentName');
  const raEl = document.getElementById('modalStudentRA');
  const subjectEl = document.getElementById('modalStudentSubject');
  const gradeEl = document.getElementById('modalStudentGrade');
  const listEl = document.getElementById('modalActivitiesList');

  if (!modal) return;

  if (nameEl) nameEl.textContent = student.name;
  if (raEl) raEl.textContent = `RA / SED: ${student.ra}`;
  if (subjectEl) subjectEl.textContent = student.subject;
  if (gradeEl) {
    gradeEl.textContent = `Nota: ${student.grade.toFixed(1).replace('.', ',')} (${student.completedActivities}/${student.totalActivities} concluídas)`;
  }

  if (listEl) {
    listEl.innerHTML = '';
    if (!student.activities || student.activities.length === 0) {
      listEl.innerHTML = '<p style="color: #64748b;">Nenhuma atividade avaliativa encontrada.</p>';
    } else {
      student.activities.forEach(act => {
        const item = document.createElement('div');
        item.className = 'activity-item';
        const badgeClass = act.isCompleted ? 'completed' : 'not-completed';
        const badgeText = act.isCompleted ? '✓ Concluído' : '✗ ' + escapeHtml(act.status);

        item.innerHTML = `
          <div class="activity-name">${escapeHtml(act.activityName)}</div>
          <span class="activity-tag ${badgeClass}">${badgeText}</span>
        `;
        listEl.appendChild(item);
      });
    }
  }

  modal.classList.add('active');
}

// ==============================================================================
// 11. EXPORTAÇÃO EXCEL, CSV, IMPRESSÃO E GERAÇÃO DE PDF PARA ALUNOS
// ==============================================================================
function initExportButtons() {
  const btnOpenPdfModal = document.getElementById('btnOpenPdfModal');
  const btnExportXlsx = document.getElementById('btnExportXlsx');
  const btnExportCsv = document.getElementById('btnExportCsv');
  const btnPrint = document.getElementById('btnPrint');

  if (btnOpenPdfModal) btnOpenPdfModal.addEventListener('click', () => openPdfModal());
  if (btnExportXlsx) btnExportXlsx.addEventListener('click', () => exportMatrixToExcel());
  if (btnExportCsv) btnExportCsv.addEventListener('click', () => exportMatrixToCsv());
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      // Garante que o gráfico e a matriz estejam renderizados para a impressão
      const reportSec = document.getElementById('officialReportSection');
      const chartSec = document.getElementById('officialChartSection');
      if (reportSec) reportSec.style.display = 'block';
      if (chartSec) {
        chartSec.style.display = 'block';
        renderPerformanceChart();
      }
      setTimeout(() => window.print(), 100);
    });
  }
}

/**
 * Inicializa os eventos do modal de geração de PDF formatado para alunos.
 */
function initPdfModalEvents() {
  const modal = document.getElementById('pdfModal');
  const closeBtn = document.getElementById('pdfModalCloseBtn');
  const cancelBtn = document.getElementById('btnPdfModalClose');
  const downloadBtn = document.getElementById('btnDownloadPdfConfirm');
  const directPrintBtn = document.getElementById('btnPrintPdfDirect');
  const typeCards = document.querySelectorAll('.pdf-type-card');

  if (closeBtn) closeBtn.addEventListener('click', closePdfModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closePdfModal);

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closePdfModal();
    });
  }

  // Interatividade nos cards de tipo de documento
  typeCards.forEach(card => {
    card.addEventListener('click', () => {
      typeCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => handleDownloadPdf());
  }

  if (directPrintBtn) {
    directPrintBtn.addEventListener('click', () => {
      closePdfModal();
      const reportSec = document.getElementById('officialReportSection');
      const chartSec = document.getElementById('officialChartSection');
      if (reportSec) reportSec.style.display = 'block';
      if (chartSec) {
        chartSec.style.display = 'block';
        renderPerformanceChart();
      }
      setTimeout(() => window.print(), 150);
    });
  }
}

function openPdfModal() {
  const modal = document.getElementById('pdfModal');
  if (!modal) return;

  const turmaInput = document.getElementById('pdfInputTurma');
  if (turmaInput) {
    turmaInput.value = appState.matrixData.turmaName || '';
  }

  modal.classList.add('active');
}

function closePdfModal() {
  const modal = document.getElementById('pdfModal');
  if (modal) modal.classList.remove('active');
}

/**
 * Converte um elemento SVG em Data URL PNG de alta resolução para inserção em PDF.
 */
function svgToPngDataUrl(svgElement) {
  return new Promise((resolve) => {
    try {
      if (!svgElement) return resolve(null);

      const clonedSvg = svgElement.cloneNode(true);
      const bbox = svgElement.viewBox?.baseVal;
      const width = (bbox && bbox.width > 0) ? bbox.width : 1000;
      const height = (bbox && bbox.height > 0) ? bbox.height : 520;
      clonedSvg.setAttribute('width', width);
      clonedSvg.setAttribute('height', height);

      const xml = new XMLSerializer().serializeToString(clonedSvg);
      const svgBase64 = btoa(unescape(encodeURIComponent(xml)));
      const imageSrc = 'data:image/svg+xml;base64,' + svgBase64;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = 2; // Qualidade dobrada para impressão nítida
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png', 0.95));
      };
      img.onerror = (e) => {
        console.warn('Erro ao carregar SVG como imagem:', e);
        resolve(null);
      };
      img.src = imageSrc;
    } catch (err) {
      console.warn('Falha no svgToPngDataUrl:', err);
      resolve(null);
    }
  });
}

/**
 * Ponto de entrada para processamento e download do arquivo PDF.
 */
async function handleDownloadPdf() {
  const { students, subjects, turmaName } = appState.matrixData;

  if (students.length === 0 || subjects.length === 0) {
    showToast('Nenhum dado carregado para gerar PDF. Carregue um CSV primeiro.', 'error');
    return;
  }

  const spinner = document.getElementById('pdfSpinnerIcon');
  const btn = document.getElementById('btnDownloadPdfConfirm');

  // Tipo de documento selecionado
  const docTypeRadio = document.querySelector('input[name="pdfDocType"]:checked');
  const docType = docTypeRadio ? docTypeRadio.value : 'official';

  const turmaInput = document.getElementById('pdfInputTurma');
  const periodoInput = document.getElementById('pdfInputPeriodo');
  const schoolInput = document.getElementById('pdfInputSchool');
  const highlightGrades = document.getElementById('pdfOptHighlightGrades')?.checked ?? true;
  const includeStats = document.getElementById('pdfOptIncludeStats')?.checked ?? true;
  const signatureLine = document.getElementById('pdfOptSignatureLine')?.checked ?? true;

  const turma = turmaInput ? turmaInput.value.trim() || turmaName : turmaName;
  const periodo = periodoInput ? periodoInput.value.trim() || '3º Bimestre' : '3º Bimestre';
  const school = schoolInput ? schoolInput.value.trim() : '';

  if (btn) btn.disabled = true;
  if (spinner) spinner.style.display = 'inline-block';

  showToast('Gerando PDF formatado para os alunos... Aguarde.', 'info');

  try {
    if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
      throw new Error('Biblioteca jsPDF não encontrada no navegador.');
    }

    if (docType === 'official') {
      await generateOfficialClassPdf({
        turma,
        periodo,
        school,
        highlightGrades,
        includeStats,
        signatureLine
      });
    } else if (docType === 'individual') {
      await generateIndividualReportCardsPdf({
        turma,
        periodo,
        school,
        highlightGrades,
        includeStats,
        signatureLine
      });
    } else if (docType === 'chart') {
      await generateChartOnlyPdf({
        turma,
        periodo,
        school,
        includeStats,
        signatureLine
      });
    }

    closePdfModal();
    showToast('PDF baixado com sucesso! Arquivo pronto para compartilhar com os alunos.', 'success');
  } catch (err) {
    console.error('Erro na geração do PDF:', err);
    showToast('Erro ao gerar arquivo PDF direto. Abrindo janela de impressão alternativa.', 'warning');
    setTimeout(() => {
      window.print();
    }, 400);
  } finally {
    if (btn) btn.disabled = false;
    if (spinner) spinner.style.display = 'none';
  }
}

/**
 * MODELO 1: RELATÓRIO COMPLETO DA TURMA (Padrão Oficial - Matriz + Gráfico)
 * Página 1: Matriz com notas de 0 a 10 e sub-colunas
 * Página 2: Gráfico comparativo de desempenho com ranking e média da turma
 */
async function generateOfficialClassPdf(options) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const { turma, periodo, school, highlightGrades, includeStats, signatureLine } = options;
  const { subjects, students, averageActivities } = appState.matrixData;

  const modeLabels = {
    both: 'Ambos (Pause e Responda + Registro)',
    pause: 'Somente "Pause e Responda"',
    registro: 'Somente "Registro"'
  };
  const criteriaLabel = modeLabels[appState.activityMode] || 'Ambos';
  const criteriaShort = appState.activityMode === 'pause' ? 'P&R' : (appState.activityMode === 'registro' ? 'Reg' : 'Ambos');

  const pageWidth = doc.internal.pageSize.getWidth(); // 297mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 210mm

  // ==========================================
  // PÁGINA 1: MATRIZ DE RESULTADOS E NOTAS
  // ==========================================
  // Faixa azul no topo
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageWidth, 4, 'F');

  let currentY = 13;
  if (school) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(school.toUpperCase(), 14, currentY);
    currentY += 5.5;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text(`Relatório de Resultados e Notas − ${turma}`, 14, currentY);

  // Data e Período no topo direito
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`${periodo} • Emissão: ${dateStr}`, pageWidth - 14, currentY, { align: 'right' });

  currentY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Critério: ${criteriaLabel}  |  Escala de Avaliação: 0,0 a 10,0 proporcional às atividades concluídas`, 14, currentY);

  currentY += 3.5;

  // Cabeçalho da Matriz
  const headRow1 = [
    { content: '#', rowSpan: 2, styles: { halign: 'center', valign: 'middle', fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' } },
    { content: 'Nome do Aluno', rowSpan: 2, styles: { halign: 'left', valign: 'middle', fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' } }
  ];

  subjects.forEach(sub => {
    headRow1.push({
      content: sub.name,
      colSpan: 2,
      styles: { halign: 'center', valign: 'middle', fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' }
    });
  });

  headRow1.push({
    content: `Total Concluído (${criteriaShort})`,
    rowSpan: 2,
    styles: { halign: 'center', valign: 'middle', fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' }
  });

  const headRow2 = [];
  subjects.forEach(() => {
    headRow2.push({ content: criteriaShort, styles: { halign: 'center', fillColor: [239, 246, 255], textColor: [29, 78, 216], fontSize: 6.5, fontStyle: 'bold' } });
    headRow2.push({ content: 'Nota (0-10)', styles: { halign: 'center', fillColor: [248, 250, 252], textColor: [15, 23, 42], fontSize: 6.8, fontStyle: 'bold' } });
  });

  // Linhas da Matriz
  const bodyRows = students.map((st, idx) => {
    const row = [
      { content: String(idx + 1), styles: { halign: 'center', textColor: [100, 116, 139] } },
      { content: st.name, styles: { fontStyle: 'bold', halign: 'left', textColor: [15, 23, 42] } }
    ];

    subjects.forEach(sub => {
      const score = st.subjectScores[sub.name] || { completed: 0, total: sub.totalActivities, percentage: 0, grade: 0 };
      let gradeVal = 0;
      if (score.grade !== undefined && score.grade > 0) {
        gradeVal = score.grade;
      } else if (score.total > 0) {
        gradeVal = (score.completed / score.total) * 10;
      } else if (score.percentage !== undefined) {
        gradeVal = score.percentage / 10;
      }
      gradeVal = Math.round(gradeVal * 10) / 10;
      const gradeStr = gradeVal.toFixed(1).replace('.', ',');

      row.push({ content: String(score.completed), styles: { halign: 'center' } });

      const isLow = highlightGrades && gradeVal < 6.0;
      row.push({
        content: gradeStr,
        styles: {
          halign: 'center',
          fontStyle: 'bold',
          textColor: isLow ? [220, 38, 38] : [15, 23, 42],
          fillColor: isLow ? [254, 242, 242] : undefined
        }
      });
    });

    row.push({
      content: String(st.totalCompleted),
      styles: { halign: 'center', fontStyle: 'bold', textColor: [15, 23, 42], fillColor: [241, 245, 249] }
    });

    return row;
  });

  // Linha de Rodapé com Médias
  const footRow = [
    { content: 'MÉDIA DA TURMA', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [15, 23, 42] } }
  ];

  subjects.forEach(sub => {
    let sumComp = 0;
    let sumGrade = 0;
    students.forEach(st => {
      const score = st.subjectScores[sub.name] || { completed: 0, total: sub.totalActivities };
      sumComp += score.completed;
      let g = (score.grade !== undefined && score.grade > 0) ? score.grade : (score.total > 0 ? (score.completed / score.total) * 10 : 0);
      sumGrade += g;
    });
    const avgComp = students.length > 0 ? (sumComp / students.length).toFixed(1) : '0';
    const avgG = students.length > 0 ? (sumGrade / students.length).toFixed(1).replace('.', ',') : '0,0';

    footRow.push({ content: avgComp, styles: { halign: 'center', fontStyle: 'bold', fillColor: [241, 245, 249] } });
    footRow.push({ content: avgG, styles: { halign: 'center', fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [37, 99, 235] } });
  });

  footRow.push({
    content: averageActivities.toFixed(1),
    styles: { halign: 'center', fontStyle: 'bold', fillColor: [226, 232, 240], textColor: [15, 23, 42] }
  });

  // Renderiza a tabela da Página 1
  doc.autoTable({
    startY: currentY,
    head: [headRow1, headRow2],
    body: bodyRows,
    foot: [footRow],
    theme: 'grid',
    styles: {
      fontSize: 7.2,
      cellPadding: 1.6,
      lineColor: [203, 213, 225],
      lineWidth: 0.12,
      textColor: [15, 23, 42]
    },
    alternateRowStyles: {
      fillColor: [234, 242, 252] // #eaf2fc oficial
    },
    margin: { left: 14, right: 14, bottom: 12 }
  });

  // Rodapé da Página 1
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('EduGrade • Relatório Oficial de Fechamento de Notas • 100% Processamento Client-side', 14, pageHeight - 5);
  doc.text('Página 1 de 2', pageWidth - 14, pageHeight - 5, { align: 'right' });

  // ==========================================
  // PÁGINA 2: GRÁFICO DE DESEMPENHO E MÉDIA
  // ==========================================
  doc.addPage('a4', 'landscape');

  // Faixa azul decorativa no topo
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageWidth, 4, 'F');

  // Cabeçalho da Página 2
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text(`Desempenho Total de Atividades por Aluno − ${turma}`, 14, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Ranking comparativo de atividades concluídas por estudante com linha de média geral da turma (${averageActivities.toFixed(1)} atividades)`, 14, 19);

  // Captura e inclusão da imagem do gráfico
  renderPerformanceChart();
  const svgEl = document.querySelector('#chartSvgWrapper svg');
  if (svgEl) {
    const chartPngUrl = await svgToPngDataUrl(svgEl);
    if (chartPngUrl) {
      doc.addImage(chartPngUrl, 'PNG', 14, 23, 269, 122);
    }
  }

  // Cards de Resumo Estatístico
  if (includeStats) {
    const statsY = 150;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, statsY, 269, 28, 3, 3, 'FD');

    // Taxa de aprovação (nota média >= 6.0)
    let approvedCount = 0;
    students.forEach(st => {
      let sumG = 0;
      let countG = 0;
      subjects.forEach(sub => {
        const score = st.subjectScores[sub.name];
        if (score) {
          let g = (score.grade !== undefined && score.grade > 0) ? score.grade : (score.total > 0 ? (score.completed / score.total) * 10 : 0);
          sumG += g;
          countG++;
        }
      });
      const avg = countG > 0 ? sumG / countG : 0;
      if (avg >= 6.0) approvedCount++;
    });
    const approvalRate = students.length > 0 ? ((approvedCount / students.length) * 100).toFixed(1) : '0,0';

    const colW = 269 / 4;
    
    // 1. Alunos
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(37, 99, 235);
    doc.text(String(students.length), 14 + colW * 0.5, statsY + 11, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(100, 116, 139);
    doc.text('Total de Alunos Avaliados', 14 + colW * 0.5, statsY + 19, { align: 'center' });

    // 2. Matérias
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(147, 51, 234);
    doc.text(String(subjects.length), 14 + colW * 1.5, statsY + 11, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(100, 116, 139);
    doc.text('Disciplinas Integradas', 14 + colW * 1.5, statsY + 19, { align: 'center' });

    // 3. Média da Turma
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(217, 119, 6);
    doc.text(averageActivities.toFixed(1), 14 + colW * 2.5, statsY + 11, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(100, 116, 139);
    doc.text('Média Geral de Atividades', 14 + colW * 2.5, statsY + 19, { align: 'center' });

    // 4. Aproveitamento
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(5, 150, 105);
    doc.text(`${approvalRate}%`, 14 + colW * 3.5, statsY + 11, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(100, 116, 139);
    doc.text('Aproveitamento (Nota ≥ 6,0)', 14 + colW * 3.5, statsY + 19, { align: 'center' });
  }

  // Linha de visto / assinatura docente
  if (signatureLine) {
    const signY = 192;
    doc.setDrawColor(148, 163, 184);
    doc.line(pageWidth - 110, signY, pageWidth - 14, signY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Assinatura do(a) Professor(a) / Coordenação Pedagógica', pageWidth - 62, signY + 4, { align: 'center' });
  }

  // Rodapé da Página 2
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('EduGrade • Relatório Oficial de Fechamento de Notas • 100% Processamento Client-side', 14, pageHeight - 5);
  doc.text('Página 2 de 2', pageWidth - 14, pageHeight - 5, { align: 'right' });

  // Download do arquivo
  const sanitizedTurma = turma.replace(/[^\w\s-]/gi, '').replace(/\s+/g, '_');
  const fileName = `Relatorio_Notas_${sanitizedTurma}_Alunos.pdf`;
  doc.save(fileName);
}

/**
 * MODELO 2: BOLETINS INDIVIDUAIS (Fichas por Aluno para Envio Privado / LGPD)
 * Gera uma ficha limpa e formal por aluno com suas notas de cada disciplina.
 */
async function generateIndividualReportCardsPdf(options) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const { turma, periodo, school, highlightGrades, signatureLine } = options;
  const { subjects, students } = appState.matrixData;
  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm

  const modeLabels = {
    both: 'Ambos (Pause e Responda + Registro)',
    pause: 'Somente "Pause e Responda"',
    registro: 'Somente "Registro"'
  };
  const criteriaLabel = modeLabels[appState.activityMode] || 'Ambos';
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR');

  students.forEach((st, sIdx) => {
    if (sIdx > 0) doc.addPage('a4', 'portrait');

    // Faixa azul no topo
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageWidth, 5, 'F');

    let currentY = 16;
    if (school) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      doc.text(school.toUpperCase(), pageWidth / 2, currentY, { align: 'center' });
      currentY += 6;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text('BOLETIM ESCOLAR INDIVIDUAL', pageWidth / 2, currentY, { align: 'center' });
    currentY += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Fechamento de Notas de Atividades • ${periodo}`, pageWidth / 2, currentY, { align: 'center' });
    currentY += 8;

    // Cartão com dados do Aluno
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, currentY, pageWidth - 28, 26, 3, 3, 'FD');

    const matched = appState.studentsData.find(s => s.name === st.name);
    const raVal = matched ? matched.ra : (st.ra || '-');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`Aluno(a): ${st.name}`, 18, currentY + 7);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`RA (Código SED): ${raVal}`, 18, currentY + 14);
    doc.text(`Turma: ${turma}`, 18, currentY + 21);

    doc.text(`Data de Emissão: ${dateStr}`, pageWidth - 20, currentY + 14, { align: 'right' });
    doc.text(`Critério: ${criteriaLabel}`, pageWidth - 20, currentY + 21, { align: 'right' });

    currentY += 32;

    // Tabela das Disciplinas
    const tableHead = [
      [
        { content: 'Disciplina / Matéria', styles: { halign: 'left', fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'Concluídas', styles: { halign: 'center', fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'Total', styles: { halign: 'center', fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'Conclusão (%)', styles: { halign: 'center', fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'Nota Final (0-10)', styles: { halign: 'center', fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'Situação', styles: { halign: 'center', fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' } }
      ]
    ];

    let totalCompletedAll = 0;
    let totalActivitiesAll = 0;
    let sumGrades = 0;

    const tableBody = subjects.map(sub => {
      const score = st.subjectScores[sub.name] || { completed: 0, total: sub.totalActivities, percentage: 0, grade: 0 };
      const tot = score.total || sub.totalActivities || 1;
      const comp = score.completed || 0;
      totalCompletedAll += comp;
      totalActivitiesAll += tot;

      let gradeVal = 0;
      if (score.grade !== undefined && score.grade > 0) {
        gradeVal = score.grade;
      } else if (tot > 0) {
        gradeVal = (comp / tot) * 10;
      } else if (score.percentage !== undefined) {
        gradeVal = score.percentage / 10;
      }
      gradeVal = Math.round(gradeVal * 10) / 10;
      sumGrades += gradeVal;

      const pct = Math.round((comp / tot) * 100);
      const isLow = highlightGrades && gradeVal < 6.0;

      let statusText = 'Aprovado';
      let statusTextColor = [5, 150, 105];
      if (gradeVal < 5.0) {
        statusText = 'Abaixo da Média';
        statusTextColor = [220, 38, 38];
      } else if (gradeVal < 6.0) {
        statusText = 'Em Atenção';
        statusTextColor = [217, 119, 6];
      }

      return [
        { content: sub.name, styles: { fontStyle: 'bold', halign: 'left' } },
        { content: String(comp), styles: { halign: 'center' } },
        { content: String(tot), styles: { halign: 'center' } },
        { content: `${pct}%`, styles: { halign: 'center' } },
        {
          content: gradeVal.toFixed(1).replace('.', ','),
          styles: {
            halign: 'center',
            fontStyle: 'bold',
            textColor: isLow ? [220, 38, 38] : [15, 23, 42],
            fillColor: isLow ? [254, 242, 242] : undefined
          }
        },
        {
          content: statusText,
          styles: {
            halign: 'center',
            fontStyle: 'bold',
            textColor: statusTextColor
          }
        }
      ];
    });

    const overallAvgGrade = subjects.length > 0 ? (sumGrades / subjects.length).toFixed(1).replace('.', ',') : '0,0';
    const overallPct = totalActivitiesAll > 0 ? Math.round((totalCompletedAll / totalActivitiesAll) * 100) : 0;
    const isApprovedGlobal = Number(overallAvgGrade.replace(',', '.')) >= 6.0;

    const tableFoot = [
      [
        { content: 'MÉDIA / TOTAL GERAL', styles: { fontStyle: 'bold', halign: 'left', fillColor: [241, 245, 249] } },
        { content: String(totalCompletedAll), styles: { halign: 'center', fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: String(totalActivitiesAll), styles: { halign: 'center', fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: `${overallPct}%`, styles: { halign: 'center', fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: overallAvgGrade, styles: { halign: 'center', fontStyle: 'bold', fillColor: [226, 232, 240], textColor: [37, 99, 235] } },
        {
          content: isApprovedGlobal ? 'Aprovado' : 'Recuperação',
          styles: { halign: 'center', fontStyle: 'bold', fillColor: [241, 245, 249], textColor: isApprovedGlobal ? [5, 150, 105] : [220, 38, 38] }
        }
      ]
    ];

    doc.autoTable({
      startY: currentY,
      head: tableHead,
      body: tableBody,
      foot: tableFoot,
      theme: 'grid',
      styles: {
        fontSize: 8.5,
        cellPadding: 3,
        lineColor: [203, 213, 225],
        lineWidth: 0.15,
        textColor: [15, 23, 42]
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      margin: { left: 14, right: 14 }
    });

    const finalY = doc.lastAutoTable.finalY + 12;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('* As notas são calculadas de 0 a 10 de acordo com as atividades concluídas pelo aluno.', 14, finalY);

    if (signatureLine) {
      const signY = finalY + 28;
      doc.setDrawColor(148, 163, 184);
      doc.line(18, signY, 95, signY);
      doc.line(115, signY, pageWidth - 18, signY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text('Assinatura do(a) Professor(a)', 56, signY + 4, { align: 'center' });
      doc.text('Ciente do Aluno / Responsável', 158, signY + 4, { align: 'center' });
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text('EduGrade • Boletim Individual • Processado 100% no navegador', 14, pageHeight - 6);
    doc.text(`Aluno ${sIdx + 1} de ${students.length}`, pageWidth - 14, pageHeight - 6, { align: 'right' });
  });

  const sanitizedTurma = turma.replace(/[^\w\s-]/gi, '').replace(/\s+/g, '_');
  const fileName = `Boletins_Individuais_${sanitizedTurma}.pdf`;
  doc.save(fileName);
}

/**
 * MODELO 3: APENAS GRÁFICO DE DESEMPENHO
 */
async function generateChartOnlyPdf(options) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const { turma, periodo, school, signatureLine } = options;
  const { averageActivities } = appState.matrixData;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Top banner
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageWidth, 4, 'F');

  let currentY = 14;
  if (school) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(school.toUpperCase(), 14, currentY);
    currentY += 6;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(`Gráfico de Desempenho Total por Aluno − ${turma}`, 14, currentY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Atividades Concluídas em Relação à Média da Turma (${averageActivities.toFixed(1)}) • ${periodo}`, 14, currentY + 6);

  // Injeta a imagem do gráfico
  renderPerformanceChart();
  const svgEl = document.querySelector('#chartSvgWrapper svg');
  if (svgEl) {
    const chartPngUrl = await svgToPngDataUrl(svgEl);
    if (chartPngUrl) {
      doc.addImage(chartPngUrl, 'PNG', 14, 30, 269, 140);
    }
  }

  if (signatureLine) {
    const signY = 194;
    doc.setDrawColor(148, 163, 184);
    doc.line(pageWidth - 110, signY, pageWidth - 14, signY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Assinatura do(a) Professor(a) / Coordenação', pageWidth - 62, signY + 4, { align: 'center' });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('EduGrade • Gráfico de Desempenho Escolar • 100% Client-side', 14, pageHeight - 5);

  const sanitizedTurma = turma.replace(/[^\w\s-]/gi, '').replace(/\s+/g, '_');
  const fileName = `Grafico_Desempenho_${sanitizedTurma}.pdf`;
  doc.save(fileName);
}

/**
 * Exporta a planilha Excel no formato exato da Matriz Oficial (Página 1).
 */
function exportMatrixToExcel() {
  const { turmaName, subjects, students } = appState.matrixData;

  if (students.length === 0) {
    showToast('Nenhum dado carregado para exportar.', 'error');
    return;
  }

  if (typeof XLSX === 'undefined') {
    showToast('Biblioteca SheetJS indisponível.', 'error');
    return;
  }

  const modeLabels = {
    both: 'Ambos',
    pause: 'Pause e Responda',
    registro: 'Registro'
  };
  const criteriaLabel = modeLabels[appState.activityMode] || 'Ambos';

  try {
    // Monta os dados em linhas e colunas exatas
    const data = [];

    // Cabeçalho da Matriz
    const headers = ['#', 'Nome_Aluno'];
    subjects.forEach(sub => {
      headers.push(`${sub.name} (${criteriaLabel})`);
      headers.push(`${sub.name} (Nota 0-10)`);
    });
    headers.push(`Total de Atividades Concluídas (${criteriaLabel})`);
    data.push(headers);

    // Linhas de Alunos
    students.forEach((st, idx) => {
      const row = [idx + 1, st.name];
      subjects.forEach(sub => {
        const score = st.subjectScores[sub.name] || { completed: 0, total: sub.totalActivities, percentage: 0, grade: 0 };
        let gradeVal = 0;
        if (score.grade !== undefined && score.grade > 0) {
          gradeVal = score.grade;
        } else if (score.total > 0) {
          gradeVal = (score.completed / score.total) * 10;
        } else if (score.percentage !== undefined) {
          gradeVal = score.percentage / 10;
        }
        row.push(score.completed);
        row.push(Number((Math.round(gradeVal * 10) / 10).toFixed(1)));
      });
      row.push(st.totalCompleted);
      data.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatório de Resultados');

    const fileName = `Relatorio_Resultados_${turmaName.replace(/\s+/g, '_')}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast(`Planilha "${fileName}" exportada com sucesso!`, 'success');
  } catch (err) {
    console.error(err);
    showToast('Erro ao exportar Excel: ' + err.message, 'error');
  }
}

function exportMatrixToCsv() {
  const { turmaName, subjects, students } = appState.matrixData;

  if (students.length === 0) {
    showToast('Nenhum dado para exportar.', 'error');
    return;
  }

  const modeLabels = {
    both: 'Ambos',
    pause: 'Pause e Responda',
    registro: 'Registro'
  };
  const criteriaLabel = modeLabels[appState.activityMode] || 'Ambos';

  try {
    const headers = ['#', 'Nome_Aluno'];
    subjects.forEach(sub => {
      headers.push(`"${sub.name} (${criteriaLabel})"`);
      headers.push(`"${sub.name} (Nota)"`);
    });
    headers.push(`"Total de Atividades Concluídas (${criteriaLabel})"`);

    const rows = students.map((st, idx) => {
      const row = [idx + 1, `"${st.name.replace(/"/g, '""')}"`];
      subjects.forEach(sub => {
        const score = st.subjectScores[sub.name] || { completed: 0, total: sub.totalActivities, percentage: 0, grade: 0 };
        let gradeVal = 0;
        if (score.grade !== undefined && score.grade > 0) {
          gradeVal = score.grade;
        } else if (score.total > 0) {
          gradeVal = (score.completed / score.total) * 10;
        } else if (score.percentage !== undefined) {
          gradeVal = score.percentage / 10;
        }
        const gradeFormatted = (Math.round(gradeVal * 10) / 10).toFixed(1).replace('.', ',');
        row.push(score.completed);
        row.push(`"${gradeFormatted}"`);
      });
      row.push(st.totalCompleted);
      return row.join(';');
    });

    const csvContent = [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `Relatorio_Resultados_${turmaName.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Arquivo CSV baixado!', 'success');
  } catch (err) {
    console.error(err);
    showToast('Erro ao exportar CSV: ' + err.message, 'error');
  }
}

// ==============================================================================
// 12. DADOS DE DEMONSTRAÇÃO OFICIAIS (TURMA 3A - IDÊNTICO À IMAGEM)
// ==============================================================================
function initDemoButton() {
  const btnLoadDemo = document.getElementById('btnLoadDemo');
  if (!btnLoadDemo) return;

  btnLoadDemo.addEventListener('click', (e) => {
    e.stopPropagation();
    loadOfficialStandardDemo();
  });
}

/**
 * Carrega a Turma 3A com as 7 disciplinas exatas da imagem do usuário:
 * Versionamento, IA, Mobile, Back-End, Front-End, Banco de Dados, Projetos
 * e os 23 alunos com as quantidades exatas de atividades.
 */
function loadOfficialStandardDemo() {
  // Lista dos 23 alunos oficiais com valores exatos da imagem
  const officialRoster = [
    { name: 'Ana Carolina Lima Dias', ra: '0001-SP', scores: { 'Versionamento': 0, 'IA': 37, 'Mobile': 0, 'Back-End': 0, 'Front-End': 0, 'Banco de Dados': 0, 'Projetos': 0 } },
    { name: 'Ana Laura Monteiro Nunes', ra: '0002-SP', scores: { 'Versionamento': 54, 'IA': 49, 'Mobile': 56, 'Back-End': 49, 'Front-End': 49, 'Banco de Dados': 55, 'Projetos': 49 } },
    { name: 'Arthur Henrique Rosa Argenton', ra: '0003-SP', scores: { 'Versionamento': 54, 'IA': 49, 'Mobile': 56, 'Back-End': 49, 'Front-End': 49, 'Banco de Dados': 55, 'Projetos': 49 } },
    { name: 'Brian Eduardo Américo Vitorino', ra: '0004-SP', scores: { 'Versionamento': 0, 'IA': 8, 'Mobile': 4, 'Back-End': 1, 'Front-End': 0, 'Banco de Dados': 6, 'Projetos': 0 } },
    { name: 'Cauane Vitoria Torres Bignardi', ra: '0005-SP', scores: { 'Versionamento': 51, 'IA': 43, 'Mobile': 51, 'Back-End': 43, 'Front-End': 42, 'Banco de Dados': 49, 'Projetos': 47 } },
    { name: 'Christian Damasceno Passos', ra: '0006-SP', scores: { 'Versionamento': 33, 'IA': 18, 'Mobile': 18, 'Back-End': 42, 'Front-End': 42, 'Banco de Dados': 48, 'Projetos': 0 } },
    { name: 'Davi Silveira Costa', ra: '0007-SP', scores: { 'Versionamento': 0, 'IA': 0, 'Mobile': 15, 'Back-End': 0, 'Front-End': 1, 'Banco de Dados': 14, 'Projetos': 0 } },
    { name: 'Felipe Clemente Spilla Ferreira', ra: '0008-SP', scores: { 'Versionamento': 0, 'IA': 15, 'Mobile': 32, 'Back-End': 0, 'Front-End': 0, 'Banco de Dados': 3, 'Projetos': 0 } },
    { name: 'Felipe Costa Soares Toledo', ra: '0009-SP', scores: { 'Versionamento': 50, 'IA': 49, 'Mobile': 54, 'Back-End': 43, 'Front-End': 42, 'Banco de Dados': 55, 'Projetos': 44 } },
    { name: 'Felipe Gonçalves Gedra', ra: '0010-SP', scores: { 'Versionamento': 0, 'IA': 23, 'Mobile': 40, 'Back-End': 0, 'Front-End': 0, 'Banco de Dados': 0, 'Projetos': 2 } },
    { name: 'Felipe Romão da Silva', ra: '0011-SP', scores: { 'Versionamento': 54, 'IA': 16, 'Mobile': 56, 'Back-End': 49, 'Front-End': 49, 'Banco de Dados': 55, 'Projetos': 49 } },
    { name: 'Gabriel Eduardo dos Santos Tamura', ra: '0012-SP', scores: { 'Versionamento': 0, 'IA': 24, 'Mobile': 0, 'Back-End': 1, 'Front-End': 0, 'Banco de Dados': 14, 'Projetos': 0 } },
    { name: 'Guilherme Hayashi Nomiyama', ra: '0013-SP', scores: { 'Versionamento': 36, 'IA': 36, 'Mobile': 49, 'Back-End': 42, 'Front-End': 42, 'Banco de Dados': 48, 'Projetos': 42 } },
    { name: 'Isabella Pereira de Andrade', ra: '0014-SP', scores: { 'Versionamento': 9, 'IA': 16, 'Mobile': 4, 'Back-End': 0, 'Front-End': 2, 'Banco de Dados': 20, 'Projetos': 0 } },
    { name: 'Isaque Silva do Nascimento', ra: '0015-SP', scores: { 'Versionamento': 0, 'IA': 8, 'Mobile': 0, 'Back-End': 1, 'Front-End': 0, 'Banco de Dados': 1, 'Projetos': 0 } },
    { name: 'Joao Pedro Oliveira Silva', ra: '0016-SP', scores: { 'Versionamento': 37, 'IA': 36, 'Mobile': 49, 'Back-End': 0, 'Front-End': 42, 'Banco de Dados': 48, 'Projetos': 42 } },
    { name: 'Jorge Matheus da Silva Vitor', ra: '0017-SP', scores: { 'Versionamento': 0, 'IA': 22, 'Mobile': 36, 'Back-End': 12, 'Front-End': 24, 'Banco de Dados': 31, 'Projetos': 0 } },
    { name: 'Maria Clara Simonelli Mesquita de Almeida', ra: '0018-SP', scores: { 'Versionamento': 54, 'IA': 49, 'Mobile': 56, 'Back-End': 49, 'Front-End': 49, 'Banco de Dados': 55, 'Projetos': 49 } },
    { name: 'Miguel da Silva Nunes Molinos', ra: '0019-SP', scores: { 'Versionamento': 40, 'IA': 18, 'Mobile': 1, 'Back-End': 1, 'Front-End': 0, 'Banco de Dados': 0, 'Projetos': 0 } },
    { name: 'Nicolly Victoria Martins Leal', ra: '0020-SP', scores: { 'Versionamento': 12, 'IA': 31, 'Mobile': 26, 'Back-End': 41, 'Front-End': 0, 'Banco de Dados': 48, 'Projetos': 0 } },
    { name: 'Pablo Leandro', ra: '0021-SP', scores: { 'Versionamento': 48, 'IA': 22, 'Mobile': 33, 'Back-End': 24, 'Front-End': 24, 'Banco de Dados': 20, 'Projetos': 12 } },
    { name: 'Raul Fernandes Alencar', ra: '0022-SP', scores: { 'Versionamento': 19, 'IA': 24, 'Mobile': 21, 'Back-End': 18, 'Front-End': 18, 'Banco de Dados': 20, 'Projetos': 24 } },
    { name: 'Vinicius Reis Buim Neves', ra: '0023-SP', scores: { 'Versionamento': 39, 'IA': 39, 'Mobile': 0, 'Back-End': 0, 'Front-End': 42, 'Banco de Dados': 0, 'Projetos': 42 } }
  ];

  // Totais de atividades de cada disciplina na Turma 3A oficial
  const subjectTotals = {
    'Versionamento': 54,
    'IA': 49,
    'Mobile': 56,
    'Back-End': 49,
    'Front-End': 49,
    'Banco de Dados': 55,
    'Projetos': 49
  };

  appState.processedFiles = [];
  appState.studentsData = [];

  // Gera arquivos sintéticos para cada disciplina
  Object.keys(subjectTotals).forEach(subjName => {
    const totalActs = subjectTotals[subjName];
    const headers = ['Nome_Aluno', 'RA'];

    for (let a = 1; a <= totalActs; a++) {
      headers.push(a % 2 === 0 ? `Registro - Aula ${a}` : `Pause e Responda - Aula ${a}`);
    }

    const dataRows = [];
    const studentsList = [];

    officialRoster.forEach((rosterStudent, idx) => {
      const completedTarget = rosterStudent.scores[subjName] || 0;
      const row = {
        'Nome_Aluno': rosterStudent.name,
        'RA': rosterStudent.ra
      };

      const activitiesDetail = [];

      for (let a = 1; a <= totalActs; a++) {
        const colName = headers[1 + a];
        const isDone = a <= completedTarget;
        row[colName] = isDone ? 'Concluído' : 'Não concluído';

        activitiesDetail.push({
          activityName: colName,
          status: isDone ? 'Concluído' : 'Não concluído',
          isCompleted: isDone,
          isCountedInGrade: true
        });
      }

      dataRows.push(row);

      const pct = Math.round((completedTarget / totalActs) * 100);
      const grade = (completedTarget / totalActs) * 10;

      studentsList.push({
        id: `${subjName}_${rosterStudent.ra}_${idx}`,
        name: rosterStudent.name,
        ra: rosterStudent.ra,
        subject: subjName,
        fileName: `${subjName}_3A.csv`,
        completedActivities: completedTarget,
        totalActivities: totalActs,
        percentage: pct,
        grade: Math.round(grade * 10) / 10,
        activities: activitiesDetail
      });
    });

    const fileObj = {
      fileName: `${subjName}_3A.csv`,
      subjectName: subjName,
      headers,
      rawRows: dataRows,
      nameColumn: 'Nome_Aluno',
      raColumn: 'RA',
      totalActivities: totalActs,
      studentCount: studentsList.length,
      students: studentsList
    };

    appState.processedFiles.push(fileObj);
    appState.studentsData.push(...studentsList);
  });

  buildOfficialMatrix();
  renderMatrixReport();
  renderPerformanceChart();
  updateColumnsAlertBanner();
  updateSubjectFilterOptions();
  updateDashboardAndTable();
  renderUploadedFilesChips();

  showToast('Exemplo oficial da Turma 3A carregado com sucesso!', 'success');
}
