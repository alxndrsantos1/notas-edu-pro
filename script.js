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
  // Aba de visualização ativa: 'matrixView' | 'conselhoView' | 'chartView' | 'listView'
  activeTab: 'matrixView',
  // Média de corte mínima para aprovação (padrão 5.0)
  passingGradeCutoff: 5.0,
  // Filtro na matriz para exibir somente alunos em risco
  filterOnlyRisk: false,
  // Estado do simulador do Conselho de Classe
  simulatorState: {
    studentId: '',
    subjectName: '',
    extraActivities: 0
  },
  // Estilo de gráfico selecionado: 'horizontal' | 'distribution' | 'subjects' | 'columns'
  chartType: 'horizontal',
  // Ordenação do gráfico: 'desc' | 'asc' | 'alpha'
  chartSort: 'desc',
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
  selectedStudentForModal: null,
  // Recorte temporal de semanas letivas (Conteúdo cobrado até o momento)
  weekFilter: {
    mode: 'all', // 'all' | 'upTo' | 'custom'
    upToWeek: null, // número da semana máxima cobrada (ex: 18)
    selectedWeeks: [] // lista de semanas ativas (ex: [15, 16, 17, 18])
  },
  detectedWeeks: [], // Lista ordenada de semanas identificadas (ex: [15, 16, 17, 18, 19, 20])
  weeksFocus: null, // Semana em foco na aba de acompanhamento (ex: 18)
  weeksStatusFilter: 'all', // Filtro de status na visão semanal
  customTurmaName: '',
  customDisciplinaName: ''
};

// ==============================================================================
// 1. INICIALIZAÇÃO
// ==============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Lê parâmetros opcionais da URL para integração automática (Bookmarklet)
  const urlParams = new URLSearchParams(window.location.search);
  const paramTurma = urlParams.get('turma');
  const paramDisciplina = urlParams.get('disciplina');
  if (paramTurma) appState.customTurmaName = paramTurma;
  if (paramDisciplina) appState.customDisciplinaName = paramDisciplina;

  initDragAndDrop();
  initFileInputs();
  initClearButtons();
  initChartControls();
  initActivityModeSelector();
  initViewTabs();
  initMatrixRiskControls();
  initConselhoDeClasse();
  initWeeksModule();
  initColumnMappingModal();
  initFiltersAndSearch();
  initTableSorting();
  initExportButtons();
  initCommunicationModule();
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

function isIgnoredNonEvaluativeColumn(header) {
  if (!header) return true;
  const norm = normalizeString(header);
  if (!norm) return true;
  return (
    norm.includes('material de aula') ||
    norm.includes('material da aula') ||
    norm.includes('material de apoio') ||
    norm.includes('material didatico') ||
    norm.includes('material') ||
    norm.includes('roteiro de atividade pratica') ||
    norm.includes('roteiro de atividade') ||
    norm.includes('roteiro') ||
    norm.includes('endereco de e-mail') ||
    norm.includes('e-mail') ||
    norm.includes('email')
  );
}

function isEvaluativeColumn(header, mode = appState.activityMode) {
  if (!header) return false;
  const norm = normalizeString(header);
  if (!norm) return false;

  // Desconsiderar explicitamente colunas ignoradas (Material, Roteiro, Dados Cadastrais)
  if (isIgnoredNonEvaluativeColumn(header)) {
    return false;
  }

  // Não confundir colunas cadastrais de aluno com atividade de registro
  if (
    norm.includes('registro do aluno') ||
    norm.includes('registro de aluno') ||
    norm.includes('registro escolar') ||
    norm.includes('registro academico') ||
    norm.includes('registro sed')
  ) {
    return false;
  }

  // REQUISITO ESTRITO: O sistema deve considerar APENAS colunas que contenham:
  // 1. "Pause e Responda"
  // 2. "Registro de Aula" ou "Registro da Aula"
  const isPause = norm.includes('pause e responda') || norm.includes('pause');
  const isRegistroAula = norm.includes('registro da aula') || norm.includes('registro de aula') || (norm.includes('registro') && norm.includes('aula'));

  if (!isPause && !isRegistroAula) {
    return false;
  }

  if (mode === 'pause') {
    return isPause;
  }
  
  if (mode === 'registro') {
    return isRegistroAula;
  }

  return isPause || isRegistroAula;
}

/**
 * Extrai o número da semana letiva a partir do nome da atividade/coluna.
 * Exemplos aceitos: "Pause e Responda (S16A1a)" -> 16, "(S18)" -> 18, "Semana 18" -> 18, "Sem 15" -> 15.
 */
function extractWeekFromActivityName(header) {
  if (!header) return null;
  const h = header.toString();
  
  // Padrão 1: (S16A1a), (S16), S16A1
  const m1 = h.match(/\(S(\d{1,2})[A-Za-z0-9]*\)/i) || h.match(/\bS(\d{1,2})A\d+/i);
  if (m1) return parseInt(m1[1], 10);

  // Padrão 2: Semana 16, Sem 16
  const m2 = h.match(/Semana\s*(\d{1,2})/i) || h.match(/Sem\s*(\d{1,2})/i);
  if (m2) return parseInt(m2[1], 10);

  // Padrão 3: S16 isolado
  const m3 = h.match(/\bS(\d{1,2})\b/i);
  if (m3) return parseInt(m3[1], 10);

  return null;
}

/**
 * Verifica se a coluna está dentro do recorte temporal de semanas selecionado pelo usuário.
 */
function isColumnIncludedInWeekFilter(header) {
  const wk = extractWeekFromActivityName(header);
  if (wk === null) return true; // Atividades sem numeração de semana são incluídas por padrão

  const { mode, upToWeek, selectedWeeks } = appState.weekFilter;
  if (mode === 'all') {
    return true;
  }
  if (mode === 'upTo' && upToWeek !== null) {
    return wk <= upToWeek;
  }
  if (mode === 'custom' && selectedWeeks && selectedWeeks.length > 0) {
    return selectedWeeks.includes(wk);
  }
  return true;
}

function findStudentNameColumn(headers, sampleRows = []) {
  if (!headers || headers.length === 0) return 'Nome';

  // 1. Prioridade absoluta por inspeção do conteúdo das linhas de exemplo (se contém nomes completos de pessoas)
  if (sampleRows && sampleRows.length > 0) {
    for (const h of headers) {
      if (isEvaluativeColumn(h, 'both')) continue;
      if (isIgnoredNonEvaluativeColumn(h)) continue;
      
      const normH = normalizeString(h);
      // Evita colunas explicitamente de RA, email, data, código
      if (
        normH.includes('email') || 
        normH.includes('data') || 
        normH.includes('hora') || 
        normH.includes('codigo') || 
        normH.includes('id') || 
        normH.includes('ra')
      ) {
        continue;
      }

      const values = sampleRows.map(r => cleanString(r[h])).filter(Boolean);
      // Nomes de alunos têm espaço, mais de 5 caracteres e NÃO começam com números (ex: "Daniellen Alves da Cruz")
      const allTextNames = values.length > 0 && values.every(v => 
        v.includes(' ') && 
        v.length >= 5 && 
        !/^[0-9]/.test(v) && 
        !v.includes('@')
      );
      if (allTextNames) {
        return h;
      }
    }
  }

  // 2. Termos diretos do cabeçalho que indicam nome
  const directTerms = [
    'nome_aluno', 'nome do aluno', 'nome aluno', 'nome completo', 'aluno', 
    'estudante', 'nome do estudante', 'nome', 'student', 'discente', 'usuario'
  ];

  for (const term of directTerms) {
    const found = headers.find(h => {
      const norm = normalizeString(h);
      return (norm === term || norm.startsWith(term + ' ') || norm.replace(/\s+/g, '_') === term) && !isIgnoredNonEvaluativeColumn(h);
    });
    if (found) return found;
  }

  // 3. Fallback inteligente: procura coluna que tem nomes nas primeiras linhas
  if (sampleRows && sampleRows.length > 0) {
    for (const h of headers) {
      if (isEvaluativeColumn(h, 'both')) continue;
      const values = sampleRows.map(r => cleanString(r[h])).filter(Boolean);
      const hasFullNames = values.some(v => v.includes(' ') && !/^[0-9]/.test(v) && !v.includes('@'));
      if (hasFullNames) return h;
    }
  }

  // 4. Primeira coluna não avaliativa
  const firstNonEval = headers.find(h => !isEvaluativeColumn(h, 'both') && !isIgnoredNonEvaluativeColumn(h));
  return firstNonEval || headers[0];
}

function findStudentRAColumn(headers, sampleRows = []) {
  if (!headers || headers.length === 0) return 'RA';

  // 1. Termos diretos de RA / SED / Matrícula
  const raTerms = [
    'codigo sed', 'código sed', 'codigo usuario sed', 'codigo do usuario', 
    'identificacao de usuario', 'identificacao do usuario', 'identificacao',
    'id sed', 'id do aluno', 'id externo', 'sed', 'ra', 'registro do aluno', 
    'ra do aluno', 'matricula', 'matrícula', 'rm', 'cpf'
  ];

  for (const term of raTerms) {
    const found = headers.find(h => {
      const norm = normalizeString(h);
      return norm === term || norm.includes(term);
    });
    if (found) return found;
  }

  // 2. Inspeção de conteúdo: coluna que contenha padrões de RA (ex: "00001230916957sp" ou números com 8+ dígitos)
  if (sampleRows && sampleRows.length > 0) {
    for (const h of headers) {
      if (isEvaluativeColumn(h, 'both')) continue;
      const values = sampleRows.map(r => cleanString(r[h])).filter(Boolean);
      const isRaFormat = values.some(v => /^[0-9]{8,}/.test(v) || /sp$/i.test(v));
      if (isRaFormat) return h;
    }
  }

  const nonEval = headers.filter(h => !isEvaluativeColumn(h, 'both') && !isIgnoredNonEvaluativeColumn(h));
  return nonEval.length > 1 ? nonEval[1] : (nonEval[0] || headers[1] || headers[0]);
}

function isActivityCompleted(cellValue) {
  if (cellValue === undefined || cellValue === null) return false;
  const rawStr = cleanString(cellValue);
  if (!rawStr) return false;

  // Se for data/hora de conclusão do Moodle (ex: "2026-08-12 12:11:44"), NÃO é o valor da atividade
  if (/^\d{4}-\d{2}-\d{2}/.test(rawStr)) {
    return false;
  }

  const val = normalizeString(rawStr);
  if (!val) return false;

  // Se for explicitamente "Não concluído"
  if (val.includes('nao concluido') || val.includes('nao concluida') || val === 'pendente') {
    return false;
  }

  // Palavras de conclusão comuns
  if (
    val === 'concluido' ||
    val === 'concluida' ||
    val === 'feito' ||
    val === 'feita' ||
    val === 'realizado' ||
    val === 'realizada' ||
    val === 'entregue' ||
    val === 'finalizado' ||
    val === 'finalizada' ||
    val === 'sim' ||
    val === 's' ||
    val === 'completed' ||
    val === 'ok' ||
    val === 'x' ||
    val === '1' ||
    val === '100%' ||
    val === '100' ||
    val === 'c'
  ) {
    return true;
  }

  return false;
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
      <th rowspan="2" class="student-name-col">Nome</th>
  `;

  // Linha 2 de Cabeçalho: Sub-colunas (Critério selecionado e Nota de 0 a 10)
  let row2 = `<tr>`;

  subjects.forEach(sub => {
    row1 += `<th colspan="2" class="subject-header">${escapeHtml(sub.name)}</th>`;
    row2 += `
      <th class="sub-col-header sub-col-criteria" title="${subColTooltip}">${subColLabel} (${sub.totalActivities} ativ.)</th>
      <th class="sub-col-header sub-col-grade" title="Nota de 0 a 10 (100% = 10,0)">Nota</th>
    `;
  });

  row1 += `<th rowspan="2" class="subject-header">Total de Atividades Concluídas<br><span style="font-weight: 600; font-size: 0.72rem; color: #1e40af;">(${subColLabel})</span></th></tr>`;
  row2 += `</tr>`;

  thead.innerHTML = row1 + row2;

  // Lógica de Diagnóstico e Risco na Matriz
  const cutoff = appState.passingGradeCutoff !== undefined ? appState.passingGradeCutoff : 5.0;

  // Identifica alunos com pelo menos uma disciplina abaixo da média de corte
  let riskStudentsCount = 0;
  students.forEach(st => {
    let hasDeficit = false;
    subjects.forEach(sub => {
      const score = st.subjectScores[sub.name] || { completed: 0, total: sub.totalActivities };
      let g = score.grade !== undefined ? score.grade : (score.total > 0 ? (score.completed / score.total) * 10 : 0);
      if (g < cutoff) hasDeficit = true;
    });
    if (hasDeficit) riskStudentsCount++;
  });

  const riskBadge = document.getElementById('riskCountBadge');
  if (riskBadge) riskBadge.textContent = String(riskStudentsCount);

  const summaryText = document.getElementById('matrixFilterSummaryText');
  if (summaryText) {
    if (appState.filterOnlyRisk) {
      summaryText.innerHTML = `Exibindo <strong>${riskStudentsCount}</strong> aluno(s) em recuperação de ${students.length}`;
    } else {
      summaryText.textContent = `Exibindo todos os ${students.length} alunos (${riskStudentsCount} em recuperação)`;
    }
  }

  // Filtra a lista se o botão de risco estiver ativo
  let displayedStudents = students;
  if (appState.filterOnlyRisk) {
    displayedStudents = students.filter(st => {
      return subjects.some(sub => {
        const score = st.subjectScores[sub.name] || { completed: 0, total: sub.totalActivities };
        let g = score.grade !== undefined ? score.grade : (score.total > 0 ? (score.completed / score.total) * 10 : 0);
        return g < cutoff;
      });
    });
  }

  // Renderiza as Linhas dos Alunos
  tbody.innerHTML = '';

  if (displayedStudents.length === 0) {
    const totalCols = 2 + subjects.length * 2 + 1;
    tbody.innerHTML = `
      <tr>
        <td colspan="${totalCols}" style="padding: 32px 16px; text-align: center; color: #166534; background-color: #f0fdf4;">
          <div style="font-size: 1.5rem; margin-bottom: 4px;">🎉</div>
          <strong>Nenhum aluno em situação de risco encontrado!</strong><br>
          <span style="font-size: 0.82rem; color: #15803d;">Todos os estudantes estão com nota igual ou superior à média de corte (${cutoff.toFixed(1).replace('.', ',')}).</span>
        </td>
      </tr>
    `;
    return;
  }

  displayedStudents.forEach((st, idx) => {
    const tr = document.createElement('tr');
    let cells = `
      <td class="student-idx-col">${idx + 1}</td>
      <td class="student-name-col">${escapeHtml(st.name)}</td>
    `;

    subjects.forEach(sub => {
      const score = st.subjectScores[sub.name] || { completed: 0, total: sub.totalActivities, percentage: 0, grade: 0 };
      
      // Cálculo da nota de 0 a 10 estritamente baseado no critério ativo
      let gradeVal = 0;
      if (score.grade !== undefined) {
        gradeVal = score.grade;
      } else if (score.total > 0) {
        gradeVal = (score.completed / score.total) * 10;
      }
      gradeVal = Math.min(10, Math.max(0, gradeVal));

      const gradeStr = (Math.round(gradeVal * 10) / 10).toFixed(1).replace('.', ',');

      // Destaque pedagógico em vermelho se abaixo da média de corte da escola
      const isLow = gradeVal < cutoff;
      const gradeStyle = isLow 
        ? 'color: #dc2626; font-weight: 700; background-color: #fef2f2;' 
        : (gradeVal >= 8.0 ? 'color: #059669; font-weight: 700;' : '');

      cells += `
        <td class="val-col">${score.completed}</td>
        <td class="grade-col" style="${gradeStyle}">${gradeStr}</td>
      `;
    });

    cells += `<td class="total-col">${st.totalCompleted}</td>`;
    tr.innerHTML = cells;
    tbody.appendChild(tr);
  });
}

// Helper para calcular a nota média do aluno entre as disciplinas
function getStudentAvgGrade(st, subjects) {
  if (!st || !subjects || subjects.length === 0) return 0;
  let sum = 0;
  let count = 0;
  subjects.forEach(sub => {
    const sc = st.subjectScores ? st.subjectScores[sub.name] : null;
    if (sc) {
      let g = sc.grade !== undefined ? sc.grade : (sc.total > 0 ? (sc.completed / sc.total) * 10 : 0);
      sum += g;
      count++;
    }
  });
  const avg = count > 0 ? sum / count : (st.totalActivities > 0 ? (st.completedActivities / st.totalActivities) * 10 : 0);
  return Math.min(10, Math.max(0, Math.round(avg * 10) / 10));
}

// Helper para definir cor e rótulo de desempenho pedagógico
function getPerformanceTier(grade) {
  if (grade >= 8.0) {
    return { 
      name: 'Alto Desempenho', 
      color: '#10b981', 
      dark: '#059669', 
      lightBg: '#dcfce7',
      range: '≥ 8,0',
      icon: '🌟'
    };
  }
  if (grade >= 6.0) {
    return { 
      name: 'Adequado (Aprovado)', 
      color: '#3b82f6', 
      dark: '#1d4ed8', 
      lightBg: '#dbeafe',
      range: '6,0 a 7,9',
      icon: '🟢'
    };
  }
  if (grade >= 4.0) {
    return { 
      name: 'Atenção / Recuperação', 
      color: '#f59e0b', 
      dark: '#b45309', 
      lightBg: '#fef3c7',
      range: '4,0 a 5,9',
      icon: '🟡'
    };
  }
  return { 
    name: 'Crítico / Baixo', 
    color: '#ef4444', 
    dark: '#b91c1c', 
    lightBg: '#fee2e2',
    range: '< 4,0',
    icon: '🔴'
  };
}

// Ordena alunos conforme o modo selecionado
function getSortedStudentsForChart(students, subjects, sortMode) {
  const list = [...students];
  if (sortMode === 'desc') {
    return list.sort((a, b) => b.totalCompleted - a.totalCompleted || a.name.localeCompare(b.name));
  }
  if (sortMode === 'asc') {
    return list.sort((a, b) => a.totalCompleted - b.totalCompleted || a.name.localeCompare(b.name));
  }
  if (sortMode === 'alpha') {
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return list;
}

/**
 * Ponto de entrada do Gráfico de Desempenho (Renderiza o modelo ativo escolhido pelo usuário).
 */
function renderPerformanceChart() {
  const container = document.getElementById('chartSvgWrapper');
  const avgBadge = document.getElementById('chartAverageBadge');
  const titleEl = document.getElementById('chartMainTitle');
  if (!container) return;

  const { students, subjects, averageActivities } = appState.matrixData;

  if (avgBadge) {
    avgBadge.textContent = students.length > 0 ? `Média da Turma: ${averageActivities.toFixed(1)} ativ.` : 'Média da Turma: -';
  }

  if (students.length === 0) {
    container.innerHTML = `
      <div style="padding: 60px 20px; text-align: center; color: #64748b;">
        <div style="font-size: 2.2rem; margin-bottom: 8px;">📊</div>
        <strong style="color: #334155; font-size: 1.1rem;">Nenhum dado para exibir no painel gráfico</strong><br>
        <span style="font-size: 0.88rem; color: #64748b;">Faça upload de arquivos CSV acima ou clique em "Carregar Dados de Exemplo" para visualizar os gráficos.</span>
      </div>
    `;
    return;
  }

  // Atualiza título dinâmico de acordo com o estilo
  const titles = {
    horizontal: 'Ranking Geral de Desempenho por Aluno',
    distribution: 'Distribuição por Faixas de Aproveitamento da Turma',
    subjects: 'Comparativo de Engajamento por Disciplina',
    columns: 'Colunas de Desempenho com Linha de Média'
  };
  if (titleEl) {
    titleEl.textContent = titles[appState.chartType] || 'Painel Gráfico de Desempenho Escolar';
  }

  // Roteia para o estilo de gráfico escolhido
  if (appState.chartType === 'horizontal') {
    renderHorizontalBarChart(students, subjects, averageActivities, container);
  } else if (appState.chartType === 'distribution') {
    renderDistributionChart(students, subjects, averageActivities, container);
  } else if (appState.chartType === 'subjects') {
    renderSubjectsComparisonChart(students, subjects, averageActivities, container);
  } else if (appState.chartType === 'columns') {
    renderModernColumnsChart(students, subjects, averageActivities, container);
  }
}

/**
 * ESTILO 1: RANKING HORIZONTAL (Recomendado - Fácil Leitura e Cores por Desempenho)
 */
function renderHorizontalBarChart(students, subjects, averageActivities, container) {
  const sortedStudents = getSortedStudentsForChart(students, subjects, appState.chartSort);
  const rowHeight = 34;
  const marginTop = 50;
  const marginBottom = 40;
  const marginLeft = 230;
  const marginRight = 160;
  const svgWidth = 1000;
  const svgHeight = Math.max(480, marginTop + sortedStudents.length * rowHeight + marginBottom);
  const barAreaWidth = svgWidth - marginLeft - marginRight;

  const maxVal = Math.max(1, ...sortedStudents.map(s => s.totalCompleted));
  const maxScale = Math.ceil(maxVal / 10) * 10;

  let svg = `<svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="chart-svg" xmlns="http://www.w3.org/2000/svg">`;

  // Linhas de Grade Verticais (0%, 25%, 50%, 75%, 100%)
  const steps = [0, 0.25, 0.5, 0.75, 1];
  steps.forEach(frac => {
    const x = marginLeft + frac * barAreaWidth;
    const val = Math.round(frac * maxScale);
    svg += `
      <line x1="${x}" y1="${marginTop - 15}" x2="${x}" y2="${marginTop + sortedStudents.length * rowHeight}" stroke="#e2e8f0" stroke-width="0.8" stroke-dasharray="2,2" />
      <text x="${x}" y="${marginTop - 22}" font-size="10.5" fill="#94a3b8" text-anchor="middle" font-family="system-ui, sans-serif">${val}</text>
    `;
  });

  // Linha Vertical da Média da Turma
  const avgX = marginLeft + (averageActivities / maxScale) * barAreaWidth;
  svg += `
    <line x1="${avgX}" y1="${marginTop - 12}" x2="${avgX}" y2="${marginTop + sortedStudents.length * rowHeight + 10}" stroke="#dc2626" stroke-width="2" stroke-dasharray="5,4" />
    <rect x="${avgX - 48}" y="${marginTop - 40}" width="96" height="22" rx="4" fill="#dc2626" />
    <text x="${avgX}" y="${marginTop - 25}" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle" font-family="system-ui, sans-serif">Média: ${averageActivities.toFixed(1)}</text>
  `;

  // Renderiza as Barras dos Alunos
  sortedStudents.forEach((st, i) => {
    const y = marginTop + i * rowHeight;
    const avgGrade = getStudentAvgGrade(st, subjects);
    const tier = getPerformanceTier(avgGrade);
    const gradeStr = avgGrade.toFixed(1).replace('.', ',');
    const barW = Math.max(6, (st.totalCompleted / maxScale) * barAreaWidth);

    // Nome do aluno à esquerda
    svg += `
      <text 
        x="${marginLeft - 14}" 
        y="${y + 17}" 
        font-size="12" 
        font-weight="600" 
        fill="#1e293b" 
        text-anchor="end" 
        font-family="system-ui, sans-serif"
      >
        <tspan fill="#94a3b8" font-size="10.5" font-weight="normal">#${i + 1} </tspan>${escapeHtml(st.name)}
      </text>
    `;

    // Trilho de fundo
    svg += `
      <rect 
        x="${marginLeft}" 
        y="${y + 4}" 
        width="${barAreaWidth}" 
        height="18" 
        rx="4" 
        fill="#f1f5f9" 
      />
    `;

    // Barra colorida do progresso
    svg += `
      <rect 
        x="${marginLeft}" 
        y="${y + 4}" 
        width="${barW}" 
        height="18" 
        rx="4" 
        fill="${tier.color}" 
      >
        <title>${escapeHtml(st.name)}: ${st.totalCompleted} atividades • Nota Média: ${gradeStr} (${tier.name})</title>
      </rect>
    `;

    // Rótulo de quantidade e nota à direita
    svg += `
      <text 
        x="${marginLeft + barAreaWidth + 12}" 
        y="${y + 17}" 
        font-size="11.5" 
        font-weight="700" 
        fill="#0f172a" 
        font-family="system-ui, sans-serif"
      >
        ${st.totalCompleted} <tspan font-weight="normal" fill="#64748b" font-size="10.5">ativ. (${gradeStr})</tspan>
      </text>
    `;
  });

  svg += `</svg>`;
  container.innerHTML = svg;
}

/**
 * ESTILO 2: DISTRIBUIÇÃO PEDAGÓGICA (Conselho de Classe: Donut + Cards das Faixas)
 */
function renderDistributionChart(students, subjects, averageActivities, container) {
  const cutoff = appState.passingGradeCutoff !== undefined ? appState.passingGradeCutoff : 5.0;
  const cutoffStr = cutoff.toFixed(1).replace('.', ',');

  const groups = {
    excelencia: { title: 'Destaque / Excelência', range: '≥ 8,0', color: '#10b981', dark: '#059669', lightBg: '#dcfce7', icon: '🌟', students: [] },
    adequado: { title: 'Adequado / Aprovados', range: `${cutoffStr} a 7,9`, color: '#3b82f6', dark: '#1d4ed8', lightBg: '#dbeafe', icon: '🟢', students: [] },
    atencao: { title: 'Atenção / Recuperação', range: `${(cutoff - 1.0 > 0 ? (cutoff - 1.0).toFixed(1).replace('.', ',') : '0,0')} a ${(cutoff - 0.1).toFixed(1).replace('.', ',')}`, color: '#f59e0b', dark: '#b45309', lightBg: '#fef3c7', icon: '🟡', students: [] },
    critico: { title: 'Crítico / Defasagem', range: `< ${(cutoff - 1.0 > 0 ? (cutoff - 1.0).toFixed(1).replace('.', ',') : cutoffStr)}`, color: '#ef4444', dark: '#b91c1c', lightBg: '#fee2e2', icon: '🔴', students: [] }
  };

  const attentionThreshold = Math.max(0, cutoff - 1.0);

  students.forEach(st => {
    const grade = getStudentAvgGrade(st, subjects);
    if (grade >= 8.0) groups.excelencia.students.push({ ...st, grade });
    else if (grade >= cutoff) groups.adequado.students.push({ ...st, grade });
    else if (grade >= attentionThreshold) groups.atencao.students.push({ ...st, grade });
    else groups.critico.students.push({ ...st, grade });
  });

  const total = students.length;
  const approvedTotal = groups.excelencia.students.length + groups.adequado.students.length;
  const approvedPct = total > 0 ? Math.round((approvedTotal / total) * 100) : 0;

  const svgWidth = 1000;
  const svgHeight = 520;

  let svg = `<svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="chart-svg" xmlns="http://www.w3.org/2000/svg">`;

  // ==========================================
  // GRÁFICO DE ROSCA (DONUT) NO LADO ESQUERDO
  // ==========================================
  const cx = 195;
  const cy = 260;
  const rOuter = 135;
  const rInner = 82;

  let currentAngle = -Math.PI / 2;
  const groupKeys = ['excelencia', 'adequado', 'atencao', 'critico'];

  groupKeys.forEach(key => {
    const grp = groups[key];
    const count = grp.students.length;
    if (count === 0) return;

    const sliceAngle = (count / total) * (Math.PI * 2);
    const endAngle = currentAngle + sliceAngle;

    const x1 = cx + rOuter * Math.cos(currentAngle);
    const y1 = cy + rOuter * Math.sin(currentAngle);
    const x2 = cx + rOuter * Math.cos(endAngle);
    const y2 = cy + rOuter * Math.sin(endAngle);
    const x3 = cx + rInner * Math.cos(endAngle);
    const y3 = cy + rInner * Math.sin(endAngle);
    const x4 = cx + rInner * Math.cos(currentAngle);
    const y4 = cy + rInner * Math.sin(currentAngle);

    const largeArc = sliceAngle > Math.PI ? 1 : 0;
    const pathData = `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4} Z`;

    svg += `<path d="${pathData}" fill="${grp.color}" stroke="#ffffff" stroke-width="2.5"><title>${grp.title}: ${count} alunos (${Math.round((count / total) * 100)}%)</title></path>`;
    currentAngle = endAngle;
  });

  // Centro da Rosca com Totais
  svg += `
    <circle cx="${cx}" cy="${cy}" r="${rInner - 2}" fill="#ffffff" />
    <text x="${cx}" y="${cy - 10}" font-size="22" font-weight="800" fill="#0f172a" text-anchor="middle" font-family="system-ui, sans-serif">${total} Alunos</text>
    <text x="${cx}" y="${cy + 12}" font-size="11.5" font-weight="600" fill="#64748b" text-anchor="middle" font-family="system-ui, sans-serif">100% Avaliados</text>
    <text x="${cx}" y="${cy + 30}" font-size="11.5" font-weight="700" fill="#059669" text-anchor="middle" font-family="system-ui, sans-serif">${approvedPct}% Aprovados</text>
  `;

  // ==========================================
  // CARDS DETALHADOS DAS FAIXAS NO LADO DIREITO
  // ==========================================
  const startX = 405;
  const cardW = 560;
  const cardH = 104;

  groupKeys.forEach((key, idx) => {
    const grp = groups[key];
    const count = grp.students.length;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const cardY = 32 + idx * (cardH + 12);

    // Fundo do card
    svg += `
      <rect x="${startX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.2" />
      <rect x="${startX}" y="${cardY}" width="7" height="${cardH}" rx="3" fill="${grp.color}" />
    `;

    // Título e Faixa
    svg += `
      <text x="${startX + 22}" y="${cardY + 26}" font-size="14" font-weight="700" fill="#0f172a" font-family="system-ui, sans-serif">
        ${grp.icon} ${grp.title} <tspan font-weight="normal" fill="#64748b" font-size="12">(Nota ${grp.range})</tspan>
      </text>
    `;

    // Badge com contagem
    svg += `
      <rect x="${startX + cardW - 145}" y="${cardY + 12}" width="130" height="24" rx="12" fill="${grp.lightBg}" />
      <text x="${startX + cardW - 80}" y="${cardY + 28}" font-size="11.5" font-weight="bold" fill="${grp.dark}" text-anchor="middle" font-family="system-ui, sans-serif">${count} aluno${count !== 1 ? 's' : ''} (${pct}%)</text>
    `;

    // Barra de proporção dentro do card
    svg += `
      <rect x="${startX + 22}" y="${cardY + 44}" width="${cardW - 44}" height="7" rx="3.5" fill="#e2e8f0" />
      <rect x="${startX + 22}" y="${cardY + 44}" width="${Math.max(4, (count / total) * (cardW - 44))}" height="7" rx="3.5" fill="${grp.color}" />
    `;

    // Nomes dos alunos da faixa (com corte elegante se exceder)
    let studentNamesText = grp.students.map(s => s.name.split(' ')[0] + ' ' + (s.name.split(' ')[1] || '')).join(', ');
    if (studentNamesText.length > 70) {
      studentNamesText = studentNamesText.substring(0, 68) + '...';
    }
    if (!studentNamesText) studentNamesText = 'Nenhum aluno nesta faixa de nota.';

    svg += `
      <text x="${startX + 22}" y="${cardY + 76}" font-size="11.5" fill="#475569" font-family="system-ui, sans-serif">
        <tspan font-weight="600" fill="#334155">Estudantes: </tspan>${escapeHtml(studentNamesText)}
      </text>
    `;
  });

  svg += `</svg>`;
  container.innerHTML = svg;
}

/**
 * ESTILO 3: COMPARATIVO POR DISCIPLINA (Engajamento e Entregas por Matéria)
 */
function renderSubjectsComparisonChart(students, subjects, averageActivities, container) {
  if (subjects.length === 0) {
    container.innerHTML = '<div style="padding: 40px; text-align: center; color: #64748b;">Nenhuma disciplina identificada para comparação.</div>';
    return;
  }

  const svgWidth = 1000;
  const cardH = 68;
  const marginTop = 50;
  const marginBottom = 40;
  const svgHeight = Math.max(460, marginTop + subjects.length * cardH + marginBottom);

  const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899', '#6366f1'];

  let svg = `<svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="chart-svg" xmlns="http://www.w3.org/2000/svg">`;

  // Cabeçalho da seção
  svg += `
    <text x="50" y="${marginTop - 20}" font-size="12" font-weight="700" fill="#64748b" font-family="system-ui, sans-serif">DISCIPLINA</text>
    <text x="360" y="${marginTop - 20}" font-size="12" font-weight="700" fill="#64748b" font-family="system-ui, sans-serif">TAXA DE CONCLUSÃO DA TURMA</text>
    <text x="760" y="${marginTop - 20}" font-size="12" font-weight="700" fill="#64748b" font-family="system-ui, sans-serif">MÉDIA DE ATIVIDADES</text>
    <text x="910" y="${marginTop - 20}" font-size="12" font-weight="700" fill="#64748b" font-family="system-ui, sans-serif">NOTA</text>
  `;

  subjects.forEach((sub, i) => {
    const y = marginTop + i * cardH;
    const color = colors[i % colors.length];

    // Calcula métricas da disciplina
    let sumCompleted = 0;
    let sumGrade = 0;
    students.forEach(st => {
      const sc = st.subjectScores ? st.subjectScores[sub.name] : null;
      if (sc) {
        sumCompleted += sc.completed || 0;
        let g = sc.grade !== undefined ? sc.grade : (sc.total > 0 ? (sc.completed / sc.total) * 10 : 0);
        sumGrade += g;
      }
    });

    const avgCompleted = students.length > 0 ? sumCompleted / students.length : 0;
    const avgGrade = students.length > 0 ? sumGrade / students.length : 0;
    const deliveryRate = sub.totalActivities > 0 ? Math.round((avgCompleted / sub.totalActivities) * 100) : 0;

    // Fundo do card
    svg += `
      <rect x="40" y="${y}" width="920" height="54" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.2" />
      <rect x="40" y="${y}" width="6" height="54" rx="3" fill="${color}" />
    `;

    // Nome da matéria e total avaliado
    svg += `
      <text x="60" y="${y + 24}" font-size="13.5" font-weight="700" fill="#0f172a" font-family="system-ui, sans-serif">${escapeHtml(sub.name)}</text>
      <text x="60" y="${y + 42}" font-size="11" fill="#64748b" font-family="system-ui, sans-serif">${sub.totalActivities} atividades avaliadas</text>
    `;

    // Barra de progresso da disciplina
    const barAreaW = 340;
    const barW = Math.max(8, (deliveryRate / 100) * barAreaW);
    svg += `
      <rect x="360" y="${y + 18}" width="${barAreaW}" height="14" rx="4" fill="#e2e8f0" />
      <rect x="360" y="${y + 18}" width="${barW}" height="14" rx="4" fill="${color}" />
      <text x="360 + ${barAreaW} + 12" x="${360 + barAreaW + 12}" y="${y + 30}" font-size="12" font-weight="bold" fill="#0f172a" font-family="system-ui, sans-serif">${deliveryRate}%</text>
    `;

    // Média de Atividades
    svg += `
      <text x="760" y="${y + 32}" font-size="13.5" font-weight="700" fill="#1e293b" font-family="system-ui, sans-serif">${avgCompleted.toFixed(1)} <tspan font-size="11" font-weight="normal" fill="#64748b">/ ${sub.totalActivities}</tspan></text>
    `;

    // Nota Média
    const gradeColor = avgGrade >= 6.0 ? '#059669' : '#dc2626';
    svg += `
      <text x="910" y="${y + 32}" font-size="14" font-weight="800" fill="${gradeColor}" font-family="system-ui, sans-serif">${avgGrade.toFixed(1).replace('.', ',')}</text>
    `;
  });

  svg += `</svg>`;
  container.innerHTML = svg;
}

/**
 * ESTILO 4: COLUNAS MODERNIZADAS COM LINHA DE MÉDIA
 */
function renderModernColumnsChart(students, subjects, averageActivities, container) {
  const sortedStudents = getSortedStudentsForChart(students, subjects, appState.chartSort);
  const svgWidth = Math.max(920, sortedStudents.length * 44);
  const svgHeight = 520;
  const marginLeft = 65;
  const marginRight = 75;
  const marginTop = 45;
  const marginBottom = 130;

  const chartWidth = svgWidth - marginLeft - marginRight;
  const chartHeight = svgHeight - marginTop - marginBottom;

  const maxVal = Math.max(1, ...sortedStudents.map(s => s.totalCompleted));
  const yCeil = Math.ceil(maxVal / 50) * 50 || 100;
  const getY = (val) => marginTop + chartHeight - (val / yCeil) * chartHeight;

  let svg = `<svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="chart-svg" xmlns="http://www.w3.org/2000/svg">`;

  // Linhas Horizontais do Eixo Y
  const step = yCeil <= 100 ? 25 : (yCeil <= 300 ? 50 : 100);
  for (let tick = 0; tick <= yCeil; tick += step) {
    const yPos = getY(tick);
    svg += `
      <line x1="${marginLeft}" y1="${yPos}" x2="${marginLeft + chartWidth}" y2="${yPos}" stroke="#e2e8f0" stroke-width="0.8" />
      <text x="${marginLeft - 10}" y="${yPos + 4}" font-size="11" fill="#64748b" text-anchor="end" font-family="system-ui, sans-serif">${tick}</text>
    `;
  }

  // Linha da Média da Turma
  const avgY = getY(averageActivities);
  svg += `
    <line x1="${marginLeft}" y1="${avgY}" x2="${marginLeft + chartWidth + 10}" y2="${avgY}" stroke="#ef4444" stroke-width="2.2" stroke-dasharray="6,4" />
    <rect x="${marginLeft + chartWidth + 6}" y="${avgY - 11}" width="82" height="22" rx="4" fill="#ef4444" />
    <text x="${marginLeft + chartWidth + 47}" y="${avgY + 4}" font-size="10.5" font-weight="bold" fill="#ffffff" text-anchor="middle" font-family="system-ui, sans-serif">Média: ${averageActivities.toFixed(1)}</text>
  `;

  // Renderização das Colunas Verticais
  const barStep = chartWidth / sortedStudents.length;
  const barWidth = Math.max(16, barStep - 8);

  sortedStudents.forEach((st, i) => {
    const barX = marginLeft + i * barStep + (barStep - barWidth) / 2;
    const barY = getY(st.totalCompleted);
    const bHeight = (marginTop + chartHeight) - barY;
    const isAboveAvg = st.totalCompleted >= averageActivities;
    const color = isAboveAvg ? '#3b82f6' : '#f97316';
    const strokeColor = isAboveAvg ? '#1d4ed8' : '#c2410c';

    svg += `
      <rect 
        x="${barX}" 
        y="${barY}" 
        width="${barWidth}" 
        height="${bHeight}" 
        fill="${color}" 
        stroke="${strokeColor}" 
        stroke-width="1.2"
        rx="3"
      >
        <title>${escapeHtml(st.name)}: ${st.totalCompleted} atividades</title>
      </rect>
    `;

    // Valor acima da barra
    svg += `
      <text 
        x="${barX + barWidth / 2}" 
        y="${barY - 6}" 
        font-size="10.5" 
        font-weight="bold" 
        fill="#0f172a" 
        text-anchor="middle" 
        font-family="system-ui, sans-serif"
      >
        ${st.totalCompleted}
      </text>
    `;

    // Nome inclinado a 45 graus para facilitar leitura
    const labelX = barX + barWidth / 2;
    const labelY = marginTop + chartHeight + 14;

    svg += `
      <text 
        x="${labelX}" 
        y="${labelY}" 
        font-size="10" 
        font-weight="600" 
        fill="#334155" 
        text-anchor="end" 
        font-family="system-ui, sans-serif" 
        transform="rotate(-45 ${labelX} ${labelY})"
      >
        ${escapeHtml(st.name)}
      </text>
    `;
  });

  svg += `</svg>`;
  container.innerHTML = svg;
}

// ==============================================================================
// 4. CONTROLE DE ABAS (TABS)
// ==============================================================================
function initViewTabs() {
  const tabButtons = document.querySelectorAll('.view-tab-btn');
  const officialReportSec = document.getElementById('officialReportSection');
  const officialConselhoSec = document.getElementById('officialConselhoSection');
  const officialWeeksSec = document.getElementById('officialWeeksSection');
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
        if (officialConselhoSec) officialConselhoSec.style.display = 'none';
        if (officialWeeksSec) officialWeeksSec.style.display = 'none';
        if (officialChartSec) officialChartSec.style.display = 'none';
        if (officialListSec) officialListSec.style.display = 'none';
      } else if (target === 'conselhoView') {
        if (officialReportSec) officialReportSec.style.display = 'none';
        if (officialConselhoSec) officialConselhoSec.style.display = 'block';
        if (officialWeeksSec) officialWeeksSec.style.display = 'none';
        if (officialChartSec) officialChartSec.style.display = 'none';
        if (officialListSec) officialListSec.style.display = 'none';
        renderConselhoDeClasseView();
      } else if (target === 'weeksView') {
        if (officialReportSec) officialReportSec.style.display = 'none';
        if (officialConselhoSec) officialConselhoSec.style.display = 'none';
        if (officialWeeksSec) officialWeeksSec.style.display = 'block';
        if (officialChartSec) officialChartSec.style.display = 'none';
        if (officialListSec) officialListSec.style.display = 'none';
        renderWeeksView();
      } else if (target === 'chartView') {
        if (officialReportSec) officialReportSec.style.display = 'none';
        if (officialConselhoSec) officialConselhoSec.style.display = 'none';
        if (officialWeeksSec) officialWeeksSec.style.display = 'none';
        if (officialChartSec) officialChartSec.style.display = 'block';
        if (officialListSec) officialListSec.style.display = 'none';
        renderPerformanceChart();
      } else if (target === 'listView') {
        if (officialReportSec) officialReportSec.style.display = 'none';
        if (officialConselhoSec) officialConselhoSec.style.display = 'none';
        if (officialWeeksSec) officialWeeksSec.style.display = 'none';
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
  const subjectName = appState.customDisciplinaName || extractSubjectFromFileName(fileName);
  const activeMode = appState.activityMode;

  // Todas as colunas avaliativas no modo ativo (Pause, Registro ou Ambos)
  const modeEvaluativeColumns = headers.filter(h => isEvaluativeColumn(h, activeMode));
  const allEvaluativeColumns = headers.filter(h => isEvaluativeColumn(h, 'both'));

  // Colunas ativas considerando o recorte de semanas (Conteúdo cobrado até o momento)
  const evaluativeColumns = modeEvaluativeColumns.filter(h => isColumnIncludedInWeekFilter(h));
  const totalActivities = evaluativeColumns.length;

  const students = [];

  rawRows.forEach((row, index) => {
    let studentName = cleanString(row[nameColumn]);
    let studentRA = cleanString(row[raColumn]);

    // Verificação de troca acidental de Nome por RA:
    // Se o campo Nome parecer um RA (ex: começar por 0000 ou terminar em sp, ou ser numérico puro)
    // e o campo RA parecer um Nome (ter espaços e letras), inverte-os automaticamente!
    const nameLooksLikeRa = /^[0-9]{7,}/.test(studentName) || /sp$/i.test(studentName);
    const raLooksLikeName = studentRA && studentRA.includes(' ') && !/^[0-9]/.test(studentRA);

    if (nameLooksLikeRa && raLooksLikeName) {
      const temp = studentName;
      studentName = studentRA;
      studentRA = temp;
    } else if (nameLooksLikeRa && (!studentRA || studentRA === '-')) {
      // Procura em outras colunas da linha se há algum nome de aluno
      for (const colKey of Object.keys(row)) {
        const val = cleanString(row[colKey]);
        if (val && val.includes(' ') && val.length > 5 && !/^[0-9]/.test(val) && !val.includes('@') && !isEvaluativeColumn(colKey, 'both')) {
          studentRA = studentName;
          studentName = val;
          break;
        }
      }
    }

    if (!studentName && !studentRA) return;

    studentName = studentName || `Aluno ${index + 1}`;
    studentRA = studentRA || '-';

    const activitiesDetail = [];
    let completedCount = 0;

    // Detalhamento por semana letiva deste aluno (para a matriz de semanas)
    const weeklyBreakdown = {};
    if (appState.detectedWeeks && appState.detectedWeeks.length > 0) {
      appState.detectedWeeks.forEach(w => {
        weeklyBreakdown[w] = { week: w, completed: 0, total: 0, percentage: 0 };
      });
    }

    modeEvaluativeColumns.forEach(col => {
      const wk = extractWeekFromActivityName(col);
      const cellVal = cleanString(row[col]);
      const isDone = isActivityCompleted(cellVal);

      if (wk !== null) {
        if (!weeklyBreakdown[wk]) {
          weeklyBreakdown[wk] = { week: wk, completed: 0, total: 0, percentage: 0 };
        }
        weeklyBreakdown[wk].total++;
        if (isDone) weeklyBreakdown[wk].completed++;
      }
    });

    Object.keys(weeklyBreakdown).forEach(w => {
      const info = weeklyBreakdown[w];
      info.percentage = info.total > 0 ? Math.round((info.completed / info.total) * 100) : 0;
    });

    // Colunas contabilizadas na nota (dentro do recorte de semana e modo)
    evaluativeColumns.forEach(col => {
      const cellVal = cleanString(row[col]);
      const isDone = isActivityCompleted(cellVal);
      if (isDone) completedCount++;

      activitiesDetail.push({
        activityName: col,
        status: cellVal || 'Não concluído',
        isCompleted: isDone,
        isCountedInGrade: true,
        weekNumber: extractWeekFromActivityName(col)
      });
    });

    // Colunas excluídas pelo corte de semana (não cobradas ainda)
    const excludedByWeekColumns = modeEvaluativeColumns.filter(h => !isColumnIncludedInWeekFilter(h));
    excludedByWeekColumns.forEach(col => {
      const cellVal = cleanString(row[col]);
      activitiesDetail.push({
        activityName: col,
        status: cellVal || 'Não concluído',
        isCompleted: isActivityCompleted(cellVal),
        isCountedInGrade: false,
        isFutureWeek: true,
        weekNumber: extractWeekFromActivityName(col)
      });
    });

    // Colunas excluídas pelo critério de modalidade (ex: registro excluído quando em modo pause)
    if (activeMode !== 'both') {
      const excludedByModeColumns = allEvaluativeColumns.filter(h => !isEvaluativeColumn(h, activeMode));
      excludedByModeColumns.forEach(col => {
        const cellVal = cleanString(row[col]);
        activitiesDetail.push({
          activityName: col,
          status: cellVal || 'Não concluído',
          isCompleted: isActivityCompleted(cellVal),
          isCountedInGrade: false,
          isFutureWeek: false,
          weekNumber: extractWeekFromActivityName(col)
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
      activities: activitiesDetail,
      weeklyBreakdown
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
  // 1. Detecta todas as semanas letivas presentes nos arquivos
  const weeksSet = new Set();
  appState.processedFiles.forEach(fileObj => {
    fileObj.headers.forEach(h => {
      if (isEvaluativeColumn(h, 'both')) {
        const wk = extractWeekFromActivityName(h);
        if (wk !== null) weeksSet.add(wk);
      }
    });
  });
  appState.detectedWeeks = Array.from(weeksSet).sort((a, b) => a - b);

  // Inicializa a semana em foco caso não esteja definida
  if (appState.detectedWeeks.length > 0 && !appState.weeksFocus) {
    appState.weeksFocus = appState.detectedWeeks[appState.detectedWeeks.length - 1];
  }

  // 2. Recalcula as notas de cada arquivo e aluno
  appState.studentsData = [];
  appState.processedFiles = appState.processedFiles.map(fileObj => {
    const updated = computeGradesForFile(fileObj);
    appState.studentsData.push(...updated.students);
    return updated;
  });

  buildOfficialMatrix();
  renderMatrixReport();
  renderPerformanceChart();
  renderConselhoDeClasseView();
  updateWeeksFilterUI();
  renderWeeksView();
  updateColumnsAlertBanner();
  updateSubjectFilterOptions();
  updateDashboardAndTable();
  renderUploadedFilesChips();
}

// ==============================================================================
// 5.5. RECORTE TEMPORAL E ACOMPANHAMENTO POR SEMANAS LETIVAS
// ==============================================================================

function initWeeksModule() {
  const selectCutoff = document.getElementById('selectWeekCutoff');
  const btnSelectAll = document.getElementById('btnSelectAllWeeks');
  const btnSelectUpToActive = document.getElementById('btnSelectUpToCurrentWeek');
  const statusFilterSelect = document.getElementById('weeksStatusFilterSelect');
  const focusSelect = document.getElementById('weeksFocusSelect');
  const btnCopyPending = document.getElementById('btnCopyPendingWeekList');
  const btnExportExcel = document.getElementById('btnExportWeeksExcel');

  if (selectCutoff) {
    selectCutoff.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'all') {
        appState.weekFilter.mode = 'all';
        appState.weekFilter.upToWeek = null;
        appState.weekFilter.selectedWeeks = [...appState.detectedWeeks];
      } else {
        const wNum = parseInt(val, 10);
        appState.weekFilter.mode = 'upTo';
        appState.weekFilter.upToWeek = wNum;
        appState.weekFilter.selectedWeeks = appState.detectedWeeks.filter(w => w <= wNum);
      }
      recalculateAllGrades();
    });
  }

  if (btnSelectAll) {
    btnSelectAll.addEventListener('click', () => {
      appState.weekFilter.mode = 'all';
      appState.weekFilter.upToWeek = null;
      appState.weekFilter.selectedWeeks = [...appState.detectedWeeks];
      if (selectCutoff) selectCutoff.value = 'all';
      recalculateAllGrades();
      showToast('Todas as semanas letivas selecionadas.', 'info');
    });
  }

  if (btnSelectUpToActive) {
    btnSelectUpToActive.addEventListener('click', () => {
      if (appState.detectedWeeks.length === 0) return;
      // Encontra a maior semana onde houve entregas
      let maxActiveWeek = appState.detectedWeeks[0];
      appState.studentsData.forEach(st => {
        if (st.weeklyBreakdown) {
          appState.detectedWeeks.forEach(w => {
            if (st.weeklyBreakdown[w] && st.weeklyBreakdown[w].completed > 0) {
              if (w > maxActiveWeek) maxActiveWeek = w;
            }
          });
        }
      });
      appState.weekFilter.mode = 'upTo';
      appState.weekFilter.upToWeek = maxActiveWeek;
      appState.weekFilter.selectedWeeks = appState.detectedWeeks.filter(w => w <= maxActiveWeek);
      if (selectCutoff) selectCutoff.value = maxActiveWeek.toString();
      recalculateAllGrades();
      showToast(`Recorte ajustado até a Semana ${maxActiveWeek} (conteúdo ministrado).`, 'info');
    });
  }

  if (statusFilterSelect) {
    statusFilterSelect.addEventListener('change', (e) => {
      appState.weeksStatusFilter = e.target.value;
      renderWeeksView();
    });
  }

  if (focusSelect) {
    focusSelect.addEventListener('change', (e) => {
      appState.weeksFocus = parseInt(e.target.value, 10);
      renderWeeksView();
    });
  }

  if (btnCopyPending) {
    btnCopyPending.addEventListener('click', () => {
      copyPendingStudentsForWeek();
    });
  }

  if (btnExportExcel) {
    btnExportExcel.addEventListener('click', () => {
      exportWeeksToExcel();
    });
  }
}

function updateWeeksFilterUI() {
  const card = document.getElementById('weeksFilterCard');
  const selectCutoff = document.getElementById('selectWeekCutoff');
  const chipsContainer = document.getElementById('weeksChipsContainer');
  const infoAlert = document.getElementById('weeksInfoAlert');
  const infoAlertText = document.getElementById('weeksInfoAlertText');

  if (!card) return;

  const weeks = appState.detectedWeeks;
  if (!weeks || weeks.length === 0) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';

  // 1. Popula o Select de Corte de Semana
  if (selectCutoff) {
    const currentVal = appState.weekFilter.mode === 'upTo' ? appState.weekFilter.upToWeek?.toString() : 'all';
    selectCutoff.innerHTML = `
      <option value="all">Todas as Semanas (${weeks[0]} a ${weeks[weeks.length - 1]})</option>
      ${weeks.map(w => {
        const isUpTo = w === appState.weekFilter.upToWeek;
        return `<option value="${w}" ${isUpTo ? 'selected' : ''}>Até a Semana ${w}</option>`;
      }).join('')}
    `;
    selectCutoff.value = currentVal || 'all';
  }

  // 2. Popula os Chips de Semanas
  if (chipsContainer) {
    chipsContainer.innerHTML = '';
    weeks.forEach(w => {
      const isIncluded = appState.weekFilter.mode === 'all' 
        ? true 
        : (appState.weekFilter.mode === 'upTo' ? w <= appState.weekFilter.upToWeek : appState.weekFilter.selectedWeeks.includes(w));

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `week-chip-btn ${isIncluded ? 'active' : 'excluded'}`;
      btn.innerHTML = `<span>${isIncluded ? '✓' : '✗'}</span> Semana ${w}`;
      btn.title = isIncluded 
        ? `Semana ${w} incluída na nota. Clique para definir corte até esta semana.` 
        : `Semana ${w} desconsiderada no fechamento. Clique para incluir até a Semana ${w}.`;

      btn.addEventListener('click', () => {
        appState.weekFilter.mode = 'upTo';
        appState.weekFilter.upToWeek = w;
        appState.weekFilter.selectedWeeks = weeks.filter(x => x <= w);
        if (selectCutoff) selectCutoff.value = w.toString();
        recalculateAllGrades();
        showToast(`Recorte definido até a Semana ${w}.`, 'info');
      });

      chipsContainer.appendChild(btn);
    });
  }

  // 3. Alerta Informativo do Corte
  if (infoAlert && infoAlertText) {
    if (appState.weekFilter.mode === 'upTo' && appState.weekFilter.upToWeek !== null) {
      const cutoffWk = appState.weekFilter.upToWeek;
      const totalCutoffActivities = appState.matrixData.students.length > 0 ? (appState.matrixData.students[0].totalActivities || 0) : 0;
      infoAlert.style.display = 'block';
      infoAlertText.innerHTML = `📌 <strong>Corte Ativo:</strong> Fechamento calculado com base no conteúdo ministrado até a <strong>Semana ${cutoffWk}</strong> (${totalCutoffActivities} atividades avaliativas). Semanas posteriores à ${cutoffWk} não diminuem a nota do aluno.`;
    } else {
      infoAlert.style.display = 'none';
    }
  }
}

function renderWeeksView() {
  const tableThead = document.getElementById('weeksMatrixThead');
  const tableTbody = document.getElementById('weeksMatrixTbody');
  const summaryCards = document.getElementById('weeksSummaryCards');
  const statusFilterSelect = document.getElementById('weeksStatusFilterSelect');
  const focusSelect = document.getElementById('weeksFocusSelect');

  if (!tableThead || !tableTbody) return;

  const weeks = appState.detectedWeeks;
  const students = appState.matrixData.students;

  if (!weeks || weeks.length === 0 || !students || students.length === 0) {
    tableThead.innerHTML = `
      <tr>
        <th>#</th>
        <th>Nome do Aluno</th>
        <th>Acompanhamento por Semana</th>
      </tr>
    `;
    tableTbody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: center; padding: 32px; color: #64748b;">
          Nenhum relatório de atividades com identificação de semanas (ex: S15, S16, S18) carregado ainda.
        </td>
      </tr>
    `;
    if (summaryCards) summaryCards.innerHTML = '';
    return;
  }

  // Atualiza semana em foco
  const focusWeek = appState.weeksFocus || weeks[weeks.length - 1];

  // 1. Popula Selects de Filtro e Foco
  if (statusFilterSelect) {
    const prevVal = statusFilterSelect.value;
    statusFilterSelect.innerHTML = `
      <option value="all">Todos os Alunos (${students.length})</option>
      <option value="upToDate">✅ 100% em dia em todas as semanas avaliadas</option>
      <option value="hasPending">⚠️ Alunos com qualquer pendência</option>
      ${weeks.map(w => `<option value="missing_week_${w}">🚨 Pendentes na Semana ${w}</option>`).join('')}
      ${weeks.map(w => `<option value="zero_week_${w}">❌ Zeraram a Semana ${w} (0%)</option>`).join('')}
    `;
    if (prevVal) statusFilterSelect.value = prevVal;
  }

  if (focusSelect) {
    focusSelect.innerHTML = weeks.map(w => {
      const isSel = w === focusWeek;
      return `<option value="${w}" ${isSel ? 'selected' : ''}>Semana ${w}</option>`;
    }).join('');
  }

  // 2. Renderiza os Cards de Resumo da Turma em cada Semana
  if (summaryCards) {
    summaryCards.innerHTML = weeks.map(w => {
      let totalWeekPossible = 0;
      let totalWeekDone = 0;
      let studentsFinished100 = 0;

      students.forEach(st => {
        const info = st.weeklyBreakdown ? st.weeklyBreakdown[w] : null;
        if (info && info.total > 0) {
          totalWeekPossible += info.total;
          totalWeekDone += info.completed;
          if (info.completed === info.total) studentsFinished100++;
        }
      });

      const pct = totalWeekPossible > 0 ? Math.round((totalWeekDone / totalWeekPossible) * 100) : 0;
      const isFocus = w === focusWeek;
      let pctClass = 'high';
      if (pct < 45) pctClass = 'low';
      else if (pct < 75) pctClass = 'medium';

      return `
        <div class="week-card ${isFocus ? 'active-focus' : ''}" data-week="${w}" style="cursor: pointer;" title="Clique para focar na Semana ${w}">
          <div class="week-card-title">Semana ${w}</div>
          <div class="week-card-pct ${pctClass}">${pct}%</div>
          <div class="week-card-sub">${studentsFinished100}/${students.length} alunos 100%</div>
        </div>
      `;
    }).join('');

    summaryCards.querySelectorAll('.week-card').forEach(card => {
      card.addEventListener('click', () => {
        const wVal = parseInt(card.getAttribute('data-week'), 10);
        appState.weeksFocus = wVal;
        if (focusSelect) focusSelect.value = wVal.toString();
        renderWeeksView();
      });
    });
  }

  // 3. Renderiza o Cabeçalho da Tabela
  tableThead.innerHTML = `
    <tr>
      <th style="width: 44px; text-align: center;">#</th>
      <th style="min-width: 220px; text-align: left;">Nome do Aluno</th>
      <th style="width: 120px; text-align: center;">RA / SED</th>
      ${weeks.map(w => {
        const isFoc = w === focusWeek;
        const headerStyle = isFoc ? 'background: #eff6ff; color: #1d4ed8; border-bottom: 2px solid #3b82f6;' : '';
        return `<th style="text-align: center; min-width: 110px; ${headerStyle}">Semana ${w}</th>`;
      }).join('')}
      <th style="text-align: center; min-width: 100px;">Atividades Feitas</th>
      <th style="text-align: center; width: 90px;">Nota Atual</th>
      <th style="text-align: center; width: 110px;">Situação</th>
      <th style="text-align: center; width: 110px;">Ações</th>
    </tr>
  `;

  // 4. Filtra e Renderiza os Alunos
  let displayStudents = [...students];

  // Filtro de texto de busca
  if (appState.filters.searchQuery) {
    const q = normalizeString(appState.filters.searchQuery);
    displayStudents = displayStudents.filter(st => 
      normalizeString(st.name).includes(q) || normalizeString(st.ra).includes(q)
    );
  }

  // Filtro de status específico da visão semanal
  const stFilter = appState.weeksStatusFilter || 'all';
  if (stFilter === 'upToDate') {
    displayStudents = displayStudents.filter(st => {
      const activeWeeks = appState.weekFilter.mode === 'upTo' 
        ? weeks.filter(w => w <= appState.weekFilter.upToWeek) 
        : weeks;
      return activeWeeks.every(w => {
        const info = st.weeklyBreakdown ? st.weeklyBreakdown[w] : null;
        return !info || info.total === 0 || info.completed === info.total;
      });
    });
  } else if (stFilter === 'hasPending') {
    displayStudents = displayStudents.filter(st => {
      const activeWeeks = appState.weekFilter.mode === 'upTo' 
        ? weeks.filter(w => w <= appState.weekFilter.upToWeek) 
        : weeks;
      return activeWeeks.some(w => {
        const info = st.weeklyBreakdown ? st.weeklyBreakdown[w] : null;
        return info && info.total > 0 && info.completed < info.total;
      });
    });
  } else if (stFilter.startsWith('missing_week_')) {
    const targetWk = parseInt(stFilter.replace('missing_week_', ''), 10);
    displayStudents = displayStudents.filter(st => {
      const info = st.weeklyBreakdown ? st.weeklyBreakdown[targetWk] : null;
      return info && info.total > 0 && info.completed < info.total;
    });
  } else if (stFilter.startsWith('zero_week_')) {
    const targetWk = parseInt(stFilter.replace('zero_week_', ''), 10);
    displayStudents = displayStudents.filter(st => {
      const info = st.weeklyBreakdown ? st.weeklyBreakdown[targetWk] : null;
      return info && info.total > 0 && info.completed === 0;
    });
  }

  if (displayStudents.length === 0) {
    tableTbody.innerHTML = `
      <tr>
        <td colspan="${7 + weeks.length}" style="text-align: center; padding: 24px; color: #64748b;">
          Nenhum estudante corresponde ao filtro selecionado.
        </td>
      </tr>
    `;
    return;
  }

  tableTbody.innerHTML = displayStudents.map((st, idx) => {
    const cellsHtml = weeks.map(w => {
      const info = st.weeklyBreakdown ? st.weeklyBreakdown[w] : null;
      const isOutside = appState.weekFilter.mode === 'upTo' && appState.weekFilter.upToWeek !== null && w > appState.weekFilter.upToWeek;
      const isFoc = w === focusWeek;
      const bgCell = isFoc ? 'background-color: #f8fafc;' : '';

      if (!info || info.total === 0) {
        return `<td style="text-align: center; color: #94a3b8; ${bgCell}">-</td>`;
      }

      if (isOutside) {
        return `
          <td style="text-align: center; ${bgCell}">
            <span class="badge-week-status future" title="Conteúdo posterior ao corte cobrado">${info.completed}/${info.total}</span>
          </td>
        `;
      }

      if (info.completed === info.total) {
        return `
          <td style="text-align: center; ${bgCell}">
            <span class="badge-week-status done" title="100% das atividades da Semana ${w} concluídas">✓ 100% (${info.completed}/${info.total})</span>
          </td>
        `;
      }

      if (info.completed > 0) {
        return `
          <td style="text-align: center; ${bgCell}">
            <span class="badge-week-status partial" title="Faltam ${info.total - info.completed} atividade(s) da Semana ${w}">⚠️ ${info.percentage}% (${info.completed}/${info.total})</span>
          </td>
        `;
      }

      return `
        <td style="text-align: center; ${bgCell}">
          <span class="badge-week-status missing" title="Nenhuma atividade da Semana ${w} realizada">✗ 0% (0/${info.total})</span>
        </td>
      `;
    }).join('');

    const formattedGrade = (st.overallGrade !== undefined ? st.overallGrade : (st.grade || 0)).toFixed(1).replace('.', ',');
    const cutoff = appState.passingGradeCutoff || 6.0;
    const isApproved = (st.overallGrade !== undefined ? st.overallGrade : (st.grade || 0)) >= cutoff;

    return `
      <tr>
        <td style="text-align: center; font-weight: bold; color: #64748b;">${idx + 1}</td>
        <td><strong style="color: #0f172a;">${escapeHtml(st.name)}</strong></td>
        <td style="text-align: center;"><span class="student-ra-badge">${escapeHtml(st.ra)}</span></td>
        ${cellsHtml}
        <td style="text-align: center; font-weight: 600;">${st.totalCompleted} / ${st.totalMax}</td>
        <td style="text-align: center; font-weight: 800; color: ${isApproved ? '#15803d' : '#dc2626'};">${formattedGrade}</td>
        <td style="text-align: center;">
          <span class="status-pill ${isApproved ? 'status-approved' : 'status-critical'}">
            <span class="status-dot"></span>
            ${isApproved ? 'Em dia' : 'Em risco'}
          </span>
        </td>
        <td style="text-align: center;">
          <button type="button" class="btn-comm-action btn-week-comm" data-student-name="${escapeHtml(st.name)}" title="Enviar recado aos responsáveis com o resumo das semanas">
            💬 Recado
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tableTbody.querySelectorAll('.btn-week-comm').forEach(btn => {
    btn.addEventListener('click', () => {
      const sName = btn.getAttribute('data-student-name');
      openCommunicationModal(sName, 'recovery');
    });
  });
}

function copyPendingStudentsForWeek() {
  const weeks = appState.detectedWeeks;
  if (!weeks || weeks.length === 0) {
    showToast('Nenhuma semana detectada nos dados.', 'error');
    return;
  }

  const focusWk = appState.weeksFocus || weeks[weeks.length - 1];
  const students = appState.matrixData.students;
  const turmaName = appState.matrixData.turmaName || 'Turma';

  const pendingList = [];
  students.forEach(st => {
    const info = st.weeklyBreakdown ? st.weeklyBreakdown[focusWk] : null;
    if (info && info.total > 0 && info.completed < info.total) {
      pendingList.push({
        name: st.name,
        ra: st.ra,
        completed: info.completed,
        total: info.total,
        missing: info.total - info.completed
      });
    }
  });

  if (pendingList.length === 0) {
    showToast(`Parabéns! Todos os alunos concluíram a Semana ${focusWk}! 🎉`, 'success');
    return;
  }

  const textLines = [
    `📢 RELAÇÃO DE ESTUDANTES COM ATIVIDADES PENDENTES − SEMANA ${focusWk}`,
    `📚 Turma: ${turmaName}`,
    `⚠️ Total de alunos com pendência nesta semana: ${pendingList.length} de ${students.length}`,
    ``,
    ...pendingList.map((s, i) => `${i + 1}. ${s.name} (Entregou ${s.completed}/${s.total} - faltam ${s.missing} ativ.)`),
    ``,
    `📌 Favor acessar a plataforma e regularizar as entregas da Semana ${focusWk}.`
  ];

  const fullText = textLines.join('\n');

  navigator.clipboard.writeText(fullText).then(() => {
    showToast(`Lista de ${pendingList.length} alunos com pendência na Semana ${focusWk} copiada com sucesso!`, 'success');
  }).catch(() => {
    prompt('Copie a lista abaixo:', fullText);
  });
}

function exportWeeksToExcel() {
  try {
    const { students, turmaName } = appState.matrixData;
    const weeks = appState.detectedWeeks;
    if (!students || students.length === 0 || !weeks || weeks.length === 0) {
      showToast('Nenhum dado semanal para exportar.', 'error');
      return;
    }

    if (typeof XLSX === 'undefined') {
      showToast('Biblioteca SheetJS indisponível.', 'error');
      return;
    }

    const header = [
      '#', 'Nome do Aluno', 'RA / SED', 
      ...weeks.map(w => `Semana ${w}`),
      'Atividades Concluídas', 'Total Cobrado', 'Aproveitamento %', 'Nota Proporcional', 'Status'
    ];

    const data = [
      [`Acompanhamento por Semana Letiva - ${turmaName}`],
      [`Emissão: ${new Date().toLocaleDateString('pt-BR')}`],
      [],
      header
    ];

    students.forEach((st, idx) => {
      const weekCells = weeks.map(w => {
        const info = st.weeklyBreakdown ? st.weeklyBreakdown[w] : null;
        if (!info || info.total === 0) return '-';
        return `${info.completed}/${info.total} (${info.percentage}%)`;
      });

      const grade = (st.overallGrade !== undefined ? st.overallGrade : (st.grade || 0));
      const status = grade >= (appState.passingGradeCutoff || 6.0) ? 'Em Dia' : 'Em Risco';

      data.push([
        idx + 1,
        st.name,
        st.ra || '-',
        ...weekCells,
        st.totalCompleted,
        st.totalMax,
        st.overallPercentage + '%',
        grade.toFixed(1).replace('.', ','),
        status
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Acompanhamento Semanal');

    const fileName = `Acompanhamento_Semanal_${(turmaName || 'Turma').replace(/\s+/g, '_')}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast(`Arquivo "${fileName}" exportado com sucesso!`, 'success');
  } catch (err) {
    showToast('Erro ao exportar Excel semanal: ' + err.message, 'error');
  }
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

        const rawHeaders = rawMatrix[headerRowIndex];
        const columnMappings = [];
        rawHeaders.forEach((h, colIdx) => {
          let cleanH = cleanString(h);
          // Caso especial do Moodle: se a coluna 0 está em branco ou sem nome, é a coluna do Nome do Aluno!
          if (!cleanH && colIdx === 0) {
            cleanH = 'Nome do Aluno';
          }
          // Ignora cabeçalhos em branco secundários (colunas de data/hora do Moodle com header vazio)
          if (cleanH) {
            columnMappings.push({
              headerName: cleanH,
              colIndex: colIdx
            });
          }
        });

        const headers = columnMappings.map(c => c.headerName);
        const dataRows = [];

        for (let i = headerRowIndex + 1; i < rawMatrix.length; i++) {
          const rowVals = rawMatrix[i];
          if (!rowVals || rowVals.length === 0) continue;
          
          const rowObj = {};
          let hasVal = false;
          columnMappings.forEach(col => {
            const v = cleanString(rowVals[col.colIndex]);
            if (v) hasVal = true;
            rowObj[col.headerName] = v;
          });

          if (hasVal) dataRows.push(rowObj);
        }

        if (dataRows.length === 0) {
          reject(new Error(`Nenhuma linha de alunos encontrada em "${file.name}".`));
          return;
        }

        const sampleRows = dataRows.slice(0, 5);
        const nameColumn = findStudentNameColumn(headers, sampleRows);
        const raColumn = findStudentRAColumn(headers, sampleRows);

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
  renderConselhoDeClasseView();
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
    const isIgnored = isIgnoredNonEvaluativeColumn(header);
    let label = header;
    if (isEval) {
      label = `${header} (Atividade Avaliativa)`;
    } else if (isIgnored) {
      label = `${header} (Desconsiderada - Material de Aula)`;
    }

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
  const countSpan = document.getElementById('uploadedFilesCount');
  const dropzoneClearBtn = document.getElementById('btnDropzoneClear');

  const fileCount = appState.processedFiles.length;
  if (countSpan) countSpan.textContent = String(fileCount);
  if (dropzoneClearBtn) dropzoneClearBtn.style.display = fileCount > 0 ? 'inline-flex' : 'none';

  if (!container || !card) return;

  if (fileCount === 0) {
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

/**
 * Remove todos os arquivos carregados e redefine o sistema para o estado limpo.
 */
function clearAllUploadedFiles() {
  if (appState.studentsData.length === 0 && appState.processedFiles.length === 0) {
    showToast('Nenhum arquivo ou dado para limpar.', 'info');
    return;
  }

  appState.processedFiles = [];
  appState.studentsData = [];
  appState.matrixData = {
    turmaName: '',
    subjects: [],
    students: [],
    averageActivities: 0
  };

  const fileInput = document.getElementById('fileInput');
  if (fileInput) fileInput.value = '';

  recalculateAllGrades();
  showToast('Todos os arquivos foram removidos com sucesso.', 'info');
}

/**
 * Inicializa todos os botões de limpeza (no dropzone, no card de arquivos e na barra de filtros).
 */
function initClearButtons() {
  const btnClearAll = document.getElementById('btnClearAllUploadedFiles');
  const btnDropzoneClear = document.getElementById('btnDropzoneClear');
  const clearAllBtn = document.getElementById('clearAllBtn');

  if (btnClearAll) {
    btnClearAll.addEventListener('click', (e) => {
      e.stopPropagation();
      clearAllUploadedFiles();
    });
  }

  if (btnDropzoneClear) {
    btnDropzoneClear.addEventListener('click', (e) => {
      e.stopPropagation();
      clearAllUploadedFiles();
    });
  }

  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      clearAllUploadedFiles();
    });
  }
}

/**
 * Inicializa os controles do Painel de Gráficos (seleção de tipos e ordenação).
 */
function initChartControls() {
  const buttons = document.querySelectorAll('.chart-type-btn');
  const sortSelect = document.getElementById('chartSortSelect');
  const sortContainer = document.getElementById('chartSortContainer');
  const legend = document.getElementById('chartSemanticLegend');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-chart-type');
      if (appState.chartType === type) return;

      appState.chartType = type;
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Controla a visibilidade dos controles auxiliares
      if (sortContainer) {
        sortContainer.style.display = (type === 'horizontal' || type === 'columns') ? 'flex' : 'none';
      }
      if (legend) {
        legend.style.display = (type === 'distribution' || type === 'subjects') ? 'none' : 'flex';
      }

      renderPerformanceChart();
    });
  });

  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      appState.chartSort = e.target.value;
      renderPerformanceChart();
    });
  }
}

// ==============================================================================
// 8.1. CONTROLES DE RISCO NA MATRIZ E MÉDIA DE CORTE
// ==============================================================================
function initMatrixRiskControls() {
  const cutoffSelect = document.getElementById('passingGradeCutoffSelect');
  const riskToggleBtn = document.getElementById('btnFilterRiskStudents');

  if (cutoffSelect) {
    cutoffSelect.addEventListener('change', (e) => {
      appState.passingGradeCutoff = parseFloat(e.target.value) || 5.0;
      renderMatrixReport();
      renderConselhoDeClasseView();
      renderPerformanceChart();
      updateDashboardAndTable();
    });
  }

  if (riskToggleBtn) {
    riskToggleBtn.addEventListener('click', () => {
      appState.filterOnlyRisk = !appState.filterOnlyRisk;
      const label = document.getElementById('riskToggleLabel');
      if (appState.filterOnlyRisk) {
        riskToggleBtn.classList.add('active');
        if (label) label.textContent = 'Exibindo Alunos em Risco (Clique p/ Limpar)';
      } else {
        riskToggleBtn.classList.remove('active');
        if (label) label.textContent = 'Filtrar Apenas Alunos em Risco';
      }
      renderMatrixReport();
    });
  }
}

// ==============================================================================
// 8.2. DIAGNÓSTICO E APOIO AO CONSELHO DE CLASSE
// ==============================================================================
function renderConselhoDeClasseView() {
  const { turmaName, subjects, students } = appState.matrixData;
  const cutoff = appState.passingGradeCutoff !== undefined ? appState.passingGradeCutoff : 5.0;

  const turmaTitle = document.getElementById('conselhoTurmaTitle');
  if (turmaTitle) {
    turmaTitle.textContent = turmaName ? `Diagnóstico do Conselho de Classe − ${turmaName}` : 'Diagnóstico do Conselho de Classe';
  }

  const notice = document.getElementById('conselhoCriteriaNotice');
  if (notice) {
    notice.textContent = `Nota < ${cutoff.toFixed(1).replace('.', ',')}`;
  }

  const totalEl = document.getElementById('conselhoStatTotal');
  const approvedEl = document.getElementById('conselhoStatApproved');
  const approvedPctEl = document.getElementById('conselhoStatApprovedPct');
  const moderateEl = document.getElementById('conselhoStatModerate');
  const criticalEl = document.getElementById('conselhoStatCritical');
  const tbody = document.getElementById('conselhoTableBody');
  const simStudentSelect = document.getElementById('simStudentSelect');

  if (totalEl) totalEl.textContent = String(students.length);

  if (students.length === 0 || subjects.length === 0) {
    if (approvedEl) approvedEl.textContent = '0';
    if (approvedPctEl) approvedPctEl.textContent = 'Carregue relatórios CSV acima';
    if (moderateEl) moderateEl.textContent = '0';
    if (criticalEl) criticalEl.textContent = '0';
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 32px 16px; text-align: center; color: #64748b;">
            <div style="font-size: 1.8rem; margin-bottom: 6px;">📂</div>
            <strong>Nenhum dado carregado para o Conselho de Classe</strong><br>
            <span style="font-size: 0.85rem; color: #64748b;">Faça upload de arquivos CSV acima ou carregue dados de exemplo para visualizar o diagnóstico.</span>
          </td>
        </tr>
      `;
    }
    if (simStudentSelect) {
      simStudentSelect.innerHTML = '<option value="">Carregue uma turma primeiro</option>';
    }
    return;
  }

  // Análise diagnóstica por estudante
  const analyzedStudents = students.map(st => {
    const deficits = [];
    subjects.forEach(sub => {
      const sc = st.subjectScores ? st.subjectScores[sub.name] : null;
      const completed = sc ? sc.completed : 0;
      const total = (sc && sc.total > 0) ? sc.total : (sub.totalActivities || 1);
      let grade = sc && sc.grade !== undefined ? sc.grade : (completed / total) * 10;
      grade = Math.min(10, Math.max(0, grade));

      if (grade < cutoff) {
        // Cálculo de quantas atividades faltam para atingir a nota mínima de aprovação
        const targetCompleted = Math.ceil((cutoff / 10) * total);
        const missing = Math.max(1, targetCompleted - completed);
        deficits.push({
          subjectName: sub.name,
          completed,
          total,
          grade,
          missingActivities: missing
        });
      }
    });

    let statusType = 'approved';
    if (deficits.length >= 3) statusType = 'critical';
    else if (deficits.length >= 1) statusType = 'moderate';

    return {
      name: st.name,
      ra: st.ra || '-',
      totalCompleted: st.totalCompleted,
      deficits,
      deficitCount: deficits.length,
      statusType
    };
  });

  const approvedList = analyzedStudents.filter(s => s.statusType === 'approved');
  const moderateList = analyzedStudents.filter(s => s.statusType === 'moderate');
  const criticalList = analyzedStudents.filter(s => s.statusType === 'critical');

  if (approvedEl) approvedEl.textContent = String(approvedList.length);
  if (approvedPctEl) {
    const pct = Math.round((approvedList.length / students.length) * 100);
    approvedPctEl.textContent = `${pct}% da turma com aprovação direta`;
  }
  if (moderateEl) moderateEl.textContent = String(moderateList.length);
  if (criticalEl) criticalEl.textContent = String(criticalList.length);

  // Ordena para o dossiê: críticos primeiro (maior urgência), depois moderados
  const atRiskStudents = [
    ...criticalList.sort((a, b) => b.deficitCount - a.deficitCount),
    ...moderateList.sort((a, b) => b.deficitCount - a.deficitCount)
  ];

  // Renderiza tabela nominal de acompanhamento
  if (tbody) {
    if (atRiskStudents.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 32px 16px; text-align: center; color: #166534; background-color: #f0fdf4;">
            <div style="font-size: 1.8rem; margin-bottom: 6px;">🎉</div>
            <strong style="font-size: 1rem;">Parabéns! Nenhum aluno com pendência no Conselho!</strong><br>
            <span style="font-size: 0.85rem; color: #15803d;">Todos os ${students.length} estudantes atingiram ou superaram a média de aprovação estipulada (${cutoff.toFixed(1).replace('.', ',')}).</span>
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = atRiskStudents.map((st, i) => {
        const isCrit = st.statusType === 'critical';
        const badge = isCrit
          ? `<span class="risk-level-tag critical">🚨 Alerta Crítico (${st.deficitCount} defasagens)</span>`
          : `<span class="risk-level-tag warning">⚠️ Recuperação (${st.deficitCount} matéria${st.deficitCount > 1 ? 's' : ''})</span>`;

        const defSubjectsHtml = st.deficits.map(d => {
          const gStr = (Math.round(d.grade * 10) / 10).toFixed(1).replace('.', ',');
          return `<div style="margin-bottom: 3px;">• <strong>${escapeHtml(d.subjectName)}</strong>: Nota <span style="color: #dc2626; font-weight: 700;">${gStr}</span></div>`;
        }).join('');

        const missingChipsHtml = st.deficits.map(d => {
          return `<span class="missing-act-item">${escapeHtml(d.subjectName)}: <strong>faltam +${d.missingActivities} ativ.</strong> (${d.completed}/${d.total})</span>`;
        }).join('');

        const actionText = isCrit
          ? `<span style="color: #991b1b; font-weight: 700;">Convocação de Responsáveis</span> + Plano Intensivo de Recuperação`
          : `<span style="color: #92400e; font-weight: 700;">Plantão de Dúvidas</span> + Roteiro de Atividades Pendentes`;

        return `
          <tr>
            <td style="text-align: center; font-weight: bold; color: #64748b;">${i + 1}</td>
            <td>
              <strong style="color: #0f172a; font-size: 0.9rem;">${escapeHtml(st.name)}</strong>
              <div style="font-size: 0.76rem; color: #64748b;">RA: ${escapeHtml(st.ra)}</div>
            </td>
            <td>${badge}</td>
            <td>${defSubjectsHtml}</td>
            <td>${missingChipsHtml}</td>
            <td class="pedagogical-action">${actionText}</td>
            <td style="text-align: center;">
              <button type="button" class="btn-comm-action btn-conselho-comm" data-student-name="${escapeHtml(st.name)}" title="Gerar recado para os pais deste aluno">
                💬 Recado Pais
              </button>
            </td>
          </tr>
        `;
      }).join('');

      tbody.querySelectorAll('.btn-conselho-comm').forEach(btn => {
        btn.addEventListener('click', () => {
          const sName = btn.getAttribute('data-student-name');
          openCommunicationModal(sName, 'recovery');
        });
      });
    }
  }

  // Atualiza seletor de estudantes do Simulador
  if (simStudentSelect) {
    const prevSelected = simStudentSelect.value;
    simStudentSelect.innerHTML = '';
    
    // Lista alunos priorizando os em risco
    const selectOptions = [
      ...atRiskStudents.map(s => ({ ...s, isRisk: true })),
      ...approvedList.map(s => ({ ...s, isRisk: false }))
    ];

    selectOptions.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = s.isRisk 
        ? `⚠️ ${s.name} (${s.deficitCount} defasagem${s.deficitCount > 1 ? 's' : ''})`
        : `✅ ${s.name} (Sem pendências)`;
      simStudentSelect.appendChild(opt);
    });

    if (prevSelected && selectOptions.some(s => s.name === prevSelected)) {
      simStudentSelect.value = prevSelected;
    } else if (selectOptions.length > 0) {
      simStudentSelect.value = selectOptions[0].name;
    }

    updateSimulatorSubjectSelect();
  }
}

function updateSimulatorSubjectSelect() {
  const studentSelect = document.getElementById('simStudentSelect');
  const subjectSelect = document.getElementById('simSubjectSelect');
  if (!studentSelect || !subjectSelect) return;

  const studentName = studentSelect.value;
  const { students, subjects } = appState.matrixData;
  const student = students.find(s => s.name === studentName);

  subjectSelect.innerHTML = '';
  if (!student || subjects.length === 0) {
    subjectSelect.innerHTML = '<option value="">Nenhuma disciplina</option>';
    updateSimulatorResult();
    return;
  }

  const cutoff = appState.passingGradeCutoff !== undefined ? appState.passingGradeCutoff : 5.0;

  // Prioriza matérias onde o aluno está abaixo do corte
  const sortedSubs = [...subjects].sort((a, b) => {
    const scA = student.subjectScores ? student.subjectScores[a.name] : null;
    const scB = student.subjectScores ? student.subjectScores[b.name] : null;
    let gA = scA && scA.grade !== undefined ? scA.grade : (scA && scA.total > 0 ? (scA.completed / scA.total) * 10 : 0);
    let gB = scB && scB.grade !== undefined ? scB.grade : (scB && scB.total > 0 ? (scB.completed / scB.total) * 10 : 0);
    return gA - gB;
  });

  sortedSubs.forEach(sub => {
    const sc = student.subjectScores ? student.subjectScores[sub.name] : null;
    let grade = sc && sc.grade !== undefined ? sc.grade : (sc && sc.total > 0 ? (sc.completed / sc.total) * 10 : 0);
    grade = Math.min(10, Math.max(0, Math.round(grade * 10) / 10));
    const gradeStr = grade.toFixed(1).replace('.', ',');

    const opt = document.createElement('option');
    opt.value = sub.name;
    opt.textContent = `${sub.name} (Nota: ${gradeStr}${grade < cutoff ? ' - Em Recuperação' : ''})`;
    subjectSelect.appendChild(opt);
  });

  updateSimulatorResult();
}

function updateSimulatorResult() {
  const studentSelect = document.getElementById('simStudentSelect');
  const subjectSelect = document.getElementById('simSubjectSelect');
  const rangeInput = document.getElementById('simExtraActivitiesRange');
  const labelEl = document.getElementById('simExtraActivitiesLabel');
  const resultContainer = document.getElementById('simResultContainer');

  if (!studentSelect || !subjectSelect || !rangeInput || !resultContainer) return;

  const extraActivities = parseInt(rangeInput.value, 10) || 0;
  if (labelEl) labelEl.textContent = `+${extraActivities}`;

  const studentName = studentSelect.value;
  const subjectName = subjectSelect.value;
  const { students, subjects } = appState.matrixData;
  const student = students.find(s => s.name === studentName);
  const subject = subjects.find(s => s.name === subjectName);

  if (!student || !subject) {
    resultContainer.innerHTML = '<div class="sim-result-placeholder">Selecione um estudante e disciplina acima para simular a recuperação de nota.</div>';
    return;
  }

  const cutoff = appState.passingGradeCutoff !== undefined ? appState.passingGradeCutoff : 5.0;
  const sc = student.subjectScores ? student.subjectScores[subject.name] : { completed: 0, total: subject.totalActivities };
  const currentCompleted = sc ? sc.completed : 0;
  const totalActivities = (sc && sc.total > 0) ? sc.total : (subject.totalActivities || 1);

  // Ajusta limite máximo do slider para o total que o aluno ainda pode entregar
  const maxPossible = Math.max(0, totalActivities - currentCompleted);
  rangeInput.max = String(Math.max(5, maxPossible));

  let currentGrade = sc && sc.grade !== undefined ? sc.grade : (currentCompleted / totalActivities) * 10;
  currentGrade = Math.min(10, Math.max(0, Math.round(currentGrade * 10) / 10));

  // Simulação com as atividades extras
  const projectedCompleted = Math.min(totalActivities, currentCompleted + extraActivities);
  let projectedGrade = totalActivities > 0 ? (projectedCompleted / totalActivities) * 10 : 0;
  projectedGrade = Math.min(10, Math.max(0, Math.round(projectedGrade * 10) / 10));

  const isApproved = projectedGrade >= cutoff;
  const targetCompleted = Math.ceil((cutoff / 10) * totalActivities);
  const remainingNeeded = Math.max(0, targetCompleted - projectedCompleted);

  const curGradeStr = currentGrade.toFixed(1).replace('.', ',');
  const projGradeStr = projectedGrade.toFixed(1).replace('.', ',');

  let verdictHtml = '';
  if (isApproved) {
    verdictHtml = `<div class="sim-verdict pass">🎉 APROVADO! Com esta entrega (+${extraActivities}), o estudante atinge a nota ${projGradeStr}, superando o corte de aprovação (${cutoff.toFixed(1).replace('.', ',')}).</div>`;
  } else {
    verdictHtml = `<div class="sim-verdict need-more">⚠️ Nota projetada: ${projGradeStr}. Ainda faltam <strong>${remainingNeeded} atividade(s)</strong> adicionais para alcançar a média de corte ${cutoff.toFixed(1).replace('.', ',')}.</div>`;
  }

  resultContainer.innerHTML = `
    <div class="sim-result-card">
      <div class="sim-current-stat">
        <span class="sim-stat-label">Situação Atual (${currentCompleted}/${totalActivities} ativ.)</span>
        <span class="sim-stat-val ${currentGrade < cutoff ? 'low' : 'approved'}">${curGradeStr}</span>
      </div>

      <div class="sim-arrow">➔</div>

      <div class="sim-projected-stat">
        <span class="sim-stat-label">Com +${extraActivities} Atividades (${projectedCompleted}/${totalActivities})</span>
        <span class="sim-stat-val ${projectedGrade < cutoff ? 'low' : 'approved'}">${projGradeStr}</span>
      </div>

      <div style="flex: 1; min-width: 260px;">
        ${verdictHtml}
      </div>
    </div>
  `;
}

function initConselhoDeClasse() {
  const studentSelect = document.getElementById('simStudentSelect');
  const subjectSelect = document.getElementById('simSubjectSelect');
  const rangeInput = document.getElementById('simExtraActivitiesRange');
  const btnPdf = document.getElementById('btnExportConselhoPdf');
  const btnExcel = document.getElementById('btnExportConselhoExcel');
  const btnConselhoComm = document.getElementById('btnConselhoOpenCommModal');

  if (btnConselhoComm) {
    btnConselhoComm.addEventListener('click', () => {
      const select = document.getElementById('simStudentSelect');
      const studentName = select ? select.value : '';
      openCommunicationModal(studentName, 'recovery');
    });
  }

  if (studentSelect) {
    studentSelect.addEventListener('change', () => {
      updateSimulatorSubjectSelect();
    });
  }

  if (subjectSelect) {
    subjectSelect.addEventListener('change', () => {
      updateSimulatorResult();
    });
  }

  if (rangeInput) {
    rangeInput.addEventListener('input', () => {
      updateSimulatorResult();
    });
  }

  if (btnPdf) {
    btnPdf.addEventListener('click', () => {
      exportConselhoToPdf();
    });
  }

  if (btnExcel) {
    btnExcel.addEventListener('click', () => {
      exportConselhoToExcel();
    });
  }
}

/**
 * Exporta a Ata do Conselho de Classe em PDF oficial formatado.
 */
async function exportConselhoToPdf() {
  const { turmaName, subjects, students } = appState.matrixData;
  const cutoff = appState.passingGradeCutoff || 6.0;

  if (students.length === 0 || subjects.length === 0) {
    showToast('Nenhum dado para exportar a ata do conselho.', 'error');
    return;
  }

  if (typeof window.jspdf === 'undefined') {
    showToast('Biblioteca jsPDF indisponível.', 'error');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // Faixa azul no topo
  doc.setFillColor(30, 58, 138);
  doc.rect(0, 0, pageWidth, 5, 'F');

  // Cabeçalho da Ata
  let currentY = 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('ATA DO CONSELHO DE CLASSE − MAPEAMENTO E RECUPERAÇÃO', pageWidth / 2, currentY, { align: 'center' });

  currentY += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Turma: ${turmaName} • Emissão: ${dateStr} • Média Mínima de Corte: ${cutoff.toFixed(1).replace('.', ',')}`, pageWidth / 2, currentY, { align: 'center' });

  currentY += 10;

  // Analisa estudantes
  const rows = [];
  let totalDeficitStudents = 0;

  students.forEach(st => {
    const deficits = [];
    subjects.forEach(sub => {
      const sc = st.subjectScores ? st.subjectScores[sub.name] : null;
      const comp = sc ? sc.completed : 0;
      const tot = sc && sc.total > 0 ? sc.total : (sub.totalActivities || 1);
      let g = sc && sc.grade !== undefined ? sc.grade : (comp / tot) * 10;
      g = Math.min(10, Math.max(0, g));
      if (g < cutoff) {
        const target = Math.ceil((cutoff / 10) * tot);
        const miss = Math.max(1, target - comp);
        deficits.push(`${sub.name}: faltam ${miss} ativ. (nota ${(Math.round(g * 10) / 10).toFixed(1).replace('.', ',')})`);
      }
    });

    if (deficits.length > 0) {
      totalDeficitStudents++;
      const isCrit = deficits.length >= 3;
      const statusText = isCrit ? 'Alerta Crítico' : 'Recuperação';
      const actionText = isCrit ? 'Convocação de Pais + Plano Intensivo' : 'Roteiro de Atividades Pendentes';

      rows.push([
        String(totalDeficitStudents),
        st.name,
        st.ra || '-',
        statusText,
        deficits.join('\n'),
        actionText
      ]);
    }
  });

  if (rows.length === 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(22, 101, 52);
    doc.text('Parabéns! Todos os estudantes da turma alcançaram a média de aprovação.', pageWidth / 2, currentY + 20, { align: 'center' });
  } else {
    doc.autoTable({
      startY: currentY,
      head: [
        [
          { content: '#', styles: { halign: 'center', fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' } },
          { content: 'Nome do Aluno', styles: { fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' } },
          { content: 'RA', styles: { fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' } },
          { content: 'Situação', styles: { halign: 'center', fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' } },
          { content: 'Defasagens e Atividades Faltantes', styles: { fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' } },
          { content: 'Encaminhamento Recomendado', styles: { fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' } }
        ]
      ],
      body: rows,
      theme: 'grid',
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
        lineColor: [203, 213, 225],
        lineWidth: 0.12,
        textColor: [15, 23, 42]
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      margin: { left: 14, right: 14, bottom: 35 }
    });
  }

  // Linhas de Assinatura no rodapé
  const signY = pageHeight - 24;
  doc.setDrawColor(148, 163, 184);
  const wSign = 50;
  doc.line(16, signY, 16 + wSign, signY);
  doc.line(80, signY, 80 + wSign, signY);
  doc.line(144, signY, 144 + wSign, signY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Professor(a) Regente', 16 + wSign / 2, signY + 4, { align: 'center' });
  doc.text('Coordenação Pedagógica', 80 + wSign / 2, signY + 4, { align: 'center' });
  doc.text('Direção Escolar', 144 + wSign / 2, signY + 4, { align: 'center' });

  // Rodapé
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('EduGrade • Ata Oficial do Conselho de Classe', 14, pageHeight - 5);

  const sanitizedTurma = turmaName.replace(/[^\w\s-]/gi, '').replace(/\s+/g, '_');
  const fileName = `Ata_Conselho_Classe_${sanitizedTurma}.pdf`;
  doc.save(fileName);
  showToast(`Ata "${fileName}" exportada com sucesso!`, 'success');
}

/**
 * Exporta o Dossiê do Conselho em planilha Excel (.xlsx).
 */
function exportConselhoToExcel() {
  const { turmaName, subjects, students } = appState.matrixData;
  const cutoff = appState.passingGradeCutoff || 6.0;

  if (students.length === 0 || subjects.length === 0) {
    showToast('Nenhum dado para exportar.', 'error');
    return;
  }

  if (typeof XLSX === 'undefined') {
    showToast('Biblioteca SheetJS indisponível.', 'error');
    return;
  }

  try {
    const data = [];
    data.push([`ATA DO CONSELHO DE CLASSE - TURMA ${turmaName.toUpperCase()}`]);
    data.push([`Critério de Corte da Escola: Nota ${cutoff.toFixed(1).replace('.', ',')} | Modalidade: ${appState.activityMode}`]);
    data.push([]);
    data.push(['#', 'Nome do Aluno', 'RA (SED)', 'Situação no Conselho', 'Disciplinas em Defasagem', 'Total em Risco', 'Atividades Faltantes para Média', 'Ação Pedagógica Recomendada']);

    let idx = 1;
    students.forEach(st => {
      const deficits = [];
      subjects.forEach(sub => {
        const sc = st.subjectScores ? st.subjectScores[sub.name] : null;
        const comp = sc ? sc.completed : 0;
        const tot = sc && sc.total > 0 ? sc.total : (sub.totalActivities || 1);
        let g = sc && sc.grade !== undefined ? sc.grade : (comp / tot) * 10;
        g = Math.min(10, Math.max(0, g));
        if (g < cutoff) {
          const target = Math.ceil((cutoff / 10) * tot);
          const miss = Math.max(1, target - comp);
          deficits.push({ name: sub.name, grade: g, missing: miss, comp, tot });
        }
      });

      const isCritical = deficits.length >= 3;
      const isModerate = deficits.length > 0 && deficits.length < 3;
      const sit = isCritical ? 'Alerta Crítico' : (isModerate ? 'Recuperação Moderada' : 'Aprovado Direto');
      const defStr = deficits.map(d => `${d.name} (${(Math.round(d.grade * 10) / 10).toFixed(1).replace('.', ',')})`).join(', ') || 'Nenhuma';
      const missStr = deficits.map(d => `${d.name}: faltam +${d.missing}`).join('; ') || 'Sem pendências';
      const action = isCritical ? 'Convocação de Responsáveis + Plano Intensivo' : (isModerate ? 'Roteiro de Recuperação de Atividades' : 'Acompanhamento Regular');

      data.push([idx++, st.name, st.ra || '-', sit, defStr, deficits.length, missStr, action]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Conselho de Classe');

    const fileName = `Dossie_Conselho_Classe_${turmaName.replace(/\s+/g, '_')}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast(`Dossiê do Conselho "${fileName}" exportado com sucesso!`, 'success');
  } catch (err) {
    console.error(err);
    showToast('Erro ao exportar dossiê: ' + err.message, 'error');
  }
}

// ==============================================================================
// 8.3. CENTRAL DE COMUNICAÇÃO COM PAIS E ALUNOS (WHATSAPP, E-MAIL E BILHETE IMPRESSO)
// ==============================================================================
function getStudentCommInfo(studentName) {
  const { students, subjects, turmaName } = appState.matrixData;
  const cutoff = appState.passingGradeCutoff || 6.0;
  const student = students.find(s => s.name === studentName) || students[0];
  if (!student) return null;

  const deficits = [];
  const allSubjects = [];
  let sumGrade = 0;
  let countGrade = 0;

  subjects.forEach(sub => {
    const sc = student.subjectScores ? student.subjectScores[sub.name] : null;
    const comp = sc ? sc.completed : 0;
    const tot = (sc && sc.total > 0) ? sc.total : (sub.totalActivities || 1);
    let g = (sc && sc.grade !== undefined) ? sc.grade : (comp / tot) * 10;
    g = Math.min(10, Math.max(0, Math.round(g * 10) / 10));
    sumGrade += g;
    countGrade++;

    const isDeficit = g < cutoff;
    const targetComp = Math.ceil((cutoff / 10) * tot);
    const missing = Math.max(1, targetComp - comp);

    const subInfo = {
      name: sub.name,
      completed: comp,
      total: tot,
      grade: g,
      gradeStr: g.toFixed(1).replace('.', ','),
      isDeficit,
      missing
    };
    allSubjects.push(subInfo);
    if (isDeficit) deficits.push(subInfo);
  });

  const overallGrade = countGrade > 0 ? (sumGrade / countGrade).toFixed(1).replace('.', ',') : '0,0';

  return {
    student,
    turmaName: turmaName || 'Turma Escolar',
    deficits,
    allSubjects,
    overallGrade,
    cutoff: cutoff.toFixed(1).replace('.', ',')
  };
}

function buildCommMessageText(info, template, parentName, teacherName, deadline) {
  if (!info) return '';
  const { student, turmaName, deficits, allSubjects, overallGrade, cutoff } = info;
  const raStr = student.ra ? ` (RA: ${student.ra})` : '';

  if (template === 'recovery') {
    let subjectsList = '';
    if (deficits.length === 0) {
      subjectsList = '• Nenhuma disciplina em defasagem no momento. O estudante está com todas as notas acima da média!';
    } else {
      subjectsList = deficits.map(d => 
        `• *${d.name}*: faltam +${d.missing} atividade(s) para atingir a média (nota atual: ${d.gradeStr})`
      ).join('\n');
    }

    return `*COMUNICADO ESCOLAR - ATIVIDADES PENDENTES* ⚠️\n` +
      `*Turma:* ${turmaName}\n\n` +
      `Prezado(s) *${parentName}* do(a) estudante *${student.name}*${raStr}:\n\n` +
      `Informamos que, no levantamento pedagógico de fechamento de notas, constatamos que o(a) estudante possui atividades avaliativas pendentes nas seguintes disciplinas:\n\n` +
      `${subjectsList}\n\n` +
      `📌 *Orientações:*\n` +
      `Solicitamos o apoio e incentivo da família para que o(a) estudante conclua essas pendências até *${deadline || 'os próximos dias'}* para recuperação das notas.\n\n` +
      `Permanecemos à disposição para orientações.\n\n` +
      `Atenciosamente,\n` +
      `*${teacherName}*`;
  }

  if (template === 'praise') {
    return `*PARABÉNS PELO DESEMPENHO ESCOLAR!* 🌟👏\n` +
      `*Turma:* ${turmaName}\n\n` +
      `Prezado(s) *${parentName}* do(a) estudante *${student.name}*${raStr}:\n\n` +
      `Temos a imensa satisfação de parabenizá-los pela dedicação, compromisso e excelente rendimento escolar do(a) estudante!\n\n` +
      `📊 *Resumo de Engajamento:*\n` +
      `• Total de Atividades Concluídas: *${student.totalCompleted} atividades*\n` +
      `• Média de Aproveitamento Estimada: *${overallGrade}*\n` +
      `• Situação: *Entregas em dia e desempenho exemplar!*\n\n` +
      `Agradecemos imensamente a parceria da família no acompanhamento dos estudos. Continuem incentivando esse caminho brilhante!\n\n` +
      `Atenciosamente,\n` +
      `*${teacherName}*`;
  }

  if (template === 'meeting') {
    return `*CONVOCAÇÃO PARA ATENDIMENTO PEDAGÓGICO / REUNIÃO DE PAIS* 📅\n` +
      `*Turma:* ${turmaName}\n\n` +
      `Prezado(s) *${parentName}* do(a) estudante *${student.name}*${raStr}:\n\n` +
      `Solicitamos a presença dos responsáveis na escola para uma conversa de alinhamento pedagógico e acompanhamento do rendimento escolar do(a) aluno(a).\n\n` +
      `📌 *Pauta:* Apresentação do fechamento de notas e definição do plano individual de recuperação de atividades.\n` +
      `🗓️ *Prazo / Comparecimento sugerido:* ${deadline || 'conforme agendamento prévio com a coordenação'}.\n\n` +
      `A participação da família é essencial para o desenvolvimento educacional de ${student.name}.\n\n` +
      `Atenciosamente,\n` +
      `*${teacherName}*`;
  }

  if (template === 'complete') {
    const list = allSubjects.map(s => {
      const icon = s.grade >= parseFloat(cutoff.replace(',', '.')) ? '✅' : '⚠️';
      return `• *${s.name}*: ${s.completed}/${s.total} ativ. - Nota: *${s.gradeStr}* ${icon}`;
    }).join('\n');

    return `*BOLETIM RESUMIDO DE ATIVIDADES E RENDIMENTO ESCOLAR* 📊\n` +
      `*Turma:* ${turmaName}\n` +
      `*Estudante:* *${student.name}*${raStr}\n\n` +
      `Confira abaixo o resumo de atividades avaliativas entregues e notas proporcionais:\n\n` +
      `${list}\n\n` +
      `📈 *Total de Atividades Entregues:* ${student.totalCompleted}\n` +
      `*Média Geral de Rendimento:* ${overallGrade}\n\n` +
      `Atenciosamente,\n` +
      `*${teacherName}*`;
  }

  return '';
}

function generatePrintSlipHtml(info, template, parentName, teacherName, deadline) {
  if (!info) return '';
  const { student, turmaName, deficits, allSubjects, overallGrade, cutoff } = info;
  const now = new Date().toLocaleDateString('pt-BR');
  const raStr = student.ra || 'Não informado';

  let subjectDetailsHtml = '';
  if (template === 'recovery') {
    if (deficits.length === 0) {
      subjectDetailsHtml = '<p style="color: #166534; font-weight: bold; padding: 8px; background: #f0fdf4; border-radius: 4px;">Parabéns! O estudante concluiu todas as atividades e não possui pendências escolares no momento.</p>';
    } else {
      subjectDetailsHtml = `
        <table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 8.5pt;">
          <thead>
            <tr style="background: #e2e8f0;">
              <th style="padding: 6px; border: 1px solid #cbd5e1; text-align: left;">Disciplina / Matéria</th>
              <th style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">Atividades Feitas</th>
              <th style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">Nota Atual</th>
              <th style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; color: #dc2626;">Faltam p/ Média (${cutoff})</th>
            </tr>
          </thead>
          <tbody>
            ${deficits.map(d => `
              <tr>
                <td style="padding: 6px; border: 1px solid #cbd5e1; font-weight: bold;">${escapeHtml(d.name)}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${d.completed} de ${d.total}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; color: #dc2626; font-weight: bold;">${d.gradeStr}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; background: #fee2e2; color: #991b1b;">+${d.missing} atividade(s)</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
  } else {
    subjectDetailsHtml = `
      <table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 8pt;">
        <thead>
          <tr style="background: #e2e8f0;">
            <th style="padding: 5px; border: 1px solid #cbd5e1; text-align: left;">Disciplina</th>
            <th style="padding: 5px; border: 1px solid #cbd5e1; text-align: center;">Entregas</th>
            <th style="padding: 5px; border: 1px solid #cbd5e1; text-align: center;">Nota</th>
            <th style="padding: 5px; border: 1px solid #cbd5e1; text-align: center;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${allSubjects.map(s => `
            <tr>
              <td style="padding: 5px; border: 1px solid #cbd5e1;">${escapeHtml(s.name)}</td>
              <td style="padding: 5px; border: 1px solid #cbd5e1; text-align: center;">${s.completed}/${s.total}</td>
              <td style="padding: 5px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">${s.gradeStr}</td>
              <td style="padding: 5px; border: 1px solid #cbd5e1; text-align: center;">${s.grade >= parseFloat(cutoff.replace(',', '.')) ? 'Aprovado' : 'Recuperação'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  const titleLabels = {
    recovery: 'COMUNICADO DE ATIVIDADES PENDENTES E RECUPERAÇÃO',
    praise: 'COMUNICADO DE ELOGIO E RECONHECIMENTO ESCOLAR',
    meeting: 'CONVOCAÇÃO PARA REUNIÃO DE PAIS / ATENDIMENTO',
    complete: 'BOLETIM GERAL DE ATIVIDADES E NOTAS'
  };

  return `
    <div class="print-slip-box">
      <div class="print-slip-header">
        <div class="print-slip-school">COMUNICADO OFICIAL AOS RESPONSÁVEIS</div>
        <div class="print-slip-title">${titleLabels[template] || 'COMUNICADO ESCOLAR'}</div>
        <div style="font-size: 8pt; color: #64748b; margin-top: 3px;">Emissão em: ${now} • Turma: ${escapeHtml(turmaName)}</div>
      </div>

      <div class="print-slip-student-info">
        <div><strong>Estudante:</strong> ${escapeHtml(student.name)}</div>
        <div><strong>RA / SED:</strong> ${escapeHtml(raStr)}</div>
        <div><strong>Turma:</strong> ${escapeHtml(turmaName)}</div>
      </div>

      <div class="print-slip-body">
        <p>Prezado(s) <strong>${escapeHtml(parentName)}</strong>,</p>
        <p>
          ${template === 'recovery' 
            ? `Solicitamos a atenção da família quanto às atividades avaliativas escolares abaixo listadas que se encontram pendentes de realização. O cumprimento dessas atividades até <strong>${escapeHtml(deadline || 'os próximos dias')}</strong> é fundamental para a recuperação e consolidação das notas do(a) estudante:`
            : (template === 'praise'
              ? `Parabenizamos a família pelo engajamento e brilhante aproveitamento do(a) estudante neste período letivo. Segue o resumo de desempenho:`
              : (template === 'meeting'
                ? `Solicitamos o comparecimento dos responsáveis à escola para alinhamento pedagógico até <strong>${escapeHtml(deadline || 'conforme agendamento')}</strong>.`
                : `Apresentamos abaixo o fechamento de notas e atividades do estudante neste período:`
              )
            )
          }
        </p>

        ${subjectDetailsHtml}

        <p style="margin-top: 12px; font-size: 8.5pt;">
          Pedimos que o canhoto abaixo seja <strong>destacado, assinado pelo responsável e devolvido à escola</strong> pelo estudante.
        </p>
      </div>

      <div class="print-slip-signatures">
        <div class="print-slip-sign-line">
          ${escapeHtml(teacherName)}<br>
          <span style="font-size: 7.5pt; color: #64748b;">Assinatura do(a) Professor(a) / Coordenação</span>
        </div>
        <div style="font-size: 8pt; color: #64748b; align-self: center;">
          Data de Emissão: ${now}
        </div>
      </div>

      <!-- Canhoto Destacável -->
      <div class="print-slip-divider">
        <span class="print-slip-divider-label">✂️ DESTAQUE E DEVOLVA ESTE CANHOTO ASSINADO À ESCOLA</span>
      </div>

      <div class="print-slip-receipt">
        <div class="print-slip-receipt-title">PROTOCOLO DE CIÊNCIA DOS PAIS / RESPONSÁVEIS</div>
        <div style="font-size: 8pt; line-height: 1.4;">
          Eu, ____________________________________________________________________, responsável legal pelo(a) aluno(a) 
          <strong>${escapeHtml(student.name)}</strong> (Turma: ${escapeHtml(turmaName)}), declaro que recebi e tomei ciência do comunicado escolar sobre o desempenho e pendências de atividades.
        </div>
        <div class="print-slip-receipt-fields">
          <div style="border-top: 1px solid #000; width: 340px; text-align: center; font-size: 8pt; padding-top: 3px;">
            Assinatura do Responsável
          </div>
          <div style="font-size: 8pt;">
            Data: _____ / _____ / _________
          </div>
          <div style="font-size: 8pt;">
            Telefone: (____) _______________
          </div>
        </div>
      </div>
    </div>
  `;
}

function initCommunicationModule() {
  const modal = document.getElementById('commModalOverlay');
  const closeBtn = document.getElementById('btnCommModalClose');
  const closeBtnX = document.getElementById('btnCommModalCloseX');
  const studentSelect = document.getElementById('commStudentSelect');
  const templateSelect = document.getElementById('commTemplateSelect');
  const inputParent = document.getElementById('commInputParentName');
  const inputTeacher = document.getElementById('commInputTeacherName');
  const inputDeadline = document.getElementById('commInputDeadline');
  const inputPhone = document.getElementById('commInputPhone');
  const textarea = document.getElementById('commMessageTextarea');
  const copyBtn = document.getElementById('btnCommCopyMessage');
  const whatsappBtn = document.getElementById('btnCommSendWhatsApp');
  const printSlipBtn = document.getElementById('btnCommPrintSlip');

  if (closeBtn) closeBtn.addEventListener('click', closeCommunicationModal);
  if (closeBtnX) closeBtnX.addEventListener('click', closeCommunicationModal);

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeCommunicationModal();
    });
  }

  if (studentSelect) {
    studentSelect.addEventListener('change', () => {
      const studentName = studentSelect.value;
      const info = getStudentCommInfo(studentName);
      if (info && info.deficits.length === 0 && templateSelect && templateSelect.value === 'recovery') {
        templateSelect.value = 'praise';
      }
      updateCommunicationMessage();
    });
  }

  if (templateSelect) {
    templateSelect.addEventListener('change', updateCommunicationMessage);
  }

  [inputParent, inputTeacher, inputDeadline, inputPhone].forEach(input => {
    if (input) input.addEventListener('input', updateCommunicationMessage);
  });

  if (textarea) {
    textarea.addEventListener('input', () => {
      const charCount = document.getElementById('commCharCountBadge');
      if (charCount) charCount.textContent = `${textarea.value.length} caracteres`;
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      if (!textarea || !textarea.value) {
        showToast('Nenhuma mensagem para copiar.', 'info');
        return;
      }
      navigator.clipboard.writeText(textarea.value).then(() => {
        showToast('Mensagem copiada para a área de transferência!', 'success');
      }).catch(() => {
        textarea.select();
        document.execCommand('copy');
        showToast('Mensagem copiada com sucesso!', 'success');
      });
    });
  }

  if (whatsappBtn) {
    whatsappBtn.addEventListener('click', () => {
      if (!textarea || !textarea.value) {
        showToast('Nenhuma mensagem pronta.', 'info');
        return;
      }
      const rawPhone = inputPhone ? inputPhone.value.replace(/\D/g, '') : '';
      let url = '';
      if (rawPhone.length >= 10) {
        const fullPhone = rawPhone.startsWith('55') ? rawPhone : '55' + rawPhone;
        url = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(textarea.value)}`;
      } else {
        url = `https://api.whatsapp.com/send?text=${encodeURIComponent(textarea.value)}`;
      }
      window.open(url, '_blank');
      showToast('Abrindo WhatsApp...', 'info');
    });
  }

  if (printSlipBtn) {
    printSlipBtn.addEventListener('click', () => {
      printCommSlip();
    });
  }
}

function openCommunicationModal(selectedStudentName, defaultTemplate) {
  const modal = document.getElementById('commModalOverlay');
  if (!modal) return;

  const { students } = appState.matrixData;
  if (!students || students.length === 0) {
    showToast('Carregue os relatórios de notas primeiro.', 'error');
    return;
  }

  populateCommStudentSelect(selectedStudentName);

  const templateSelect = document.getElementById('commTemplateSelect');
  if (templateSelect) {
    if (defaultTemplate) {
      templateSelect.value = defaultTemplate;
    } else {
      const currentSelected = document.getElementById('commStudentSelect')?.value;
      const info = getStudentCommInfo(currentSelected);
      if (info && info.deficits.length === 0) {
        templateSelect.value = 'praise';
      } else {
        templateSelect.value = 'recovery';
      }
    }
  }

  updateCommunicationMessage();
  modal.style.display = 'flex';
}

function closeCommunicationModal() {
  const modal = document.getElementById('commModalOverlay');
  if (modal) modal.style.display = 'none';
}

function populateCommStudentSelect(targetStudentName) {
  const studentSelect = document.getElementById('commStudentSelect');
  if (!studentSelect) return;

  const { students, subjects } = appState.matrixData;
  const cutoff = appState.passingGradeCutoff || 6.0;

  studentSelect.innerHTML = '';

  students.forEach(st => {
    let deficitsCount = 0;
    subjects.forEach(sub => {
      const sc = st.subjectScores ? st.subjectScores[sub.name] : null;
      let g = sc && sc.grade !== undefined ? sc.grade : (sc && sc.total > 0 ? (sc.completed / sc.total) * 10 : 0);
      if (g < cutoff) deficitsCount++;
    });

    const opt = document.createElement('option');
    opt.value = st.name;
    opt.textContent = deficitsCount > 0 
      ? `⚠️ ${st.name} (${deficitsCount} pendência${deficitsCount > 1 ? 's' : ''})` 
      : `✅ ${st.name} (Sem pendências)`;
    studentSelect.appendChild(opt);
  });

  if (targetStudentName && students.some(s => s.name === targetStudentName)) {
    studentSelect.value = targetStudentName;
  } else if (students.length > 0) {
    studentSelect.value = students[0].name;
  }
}

function updateCommunicationMessage() {
  const studentSelect = document.getElementById('commStudentSelect');
  const templateSelect = document.getElementById('commTemplateSelect');
  const inputParent = document.getElementById('commInputParentName');
  const inputTeacher = document.getElementById('commInputTeacherName');
  const inputDeadline = document.getElementById('commInputDeadline');
  const textarea = document.getElementById('commMessageTextarea');
  const charBadge = document.getElementById('commCharCountBadge');

  if (!studentSelect || !textarea) return;

  const studentName = studentSelect.value;
  const info = getStudentCommInfo(studentName);
  if (!info) {
    textarea.value = 'Selecione um estudante acima.';
    return;
  }

  const template = templateSelect ? templateSelect.value : 'recovery';
  const parentName = inputParent && inputParent.value.trim() ? inputParent.value.trim() : 'Srs. Pais ou Responsáveis';
  const teacherName = inputTeacher && inputTeacher.value.trim() ? inputTeacher.value.trim() : 'Coordenação Pedagógica / Professor(a)';
  const deadline = inputDeadline && inputDeadline.value.trim() ? inputDeadline.value.trim() : 'próxima sexta-feira';

  const text = buildCommMessageText(info, template, parentName, teacherName, deadline);
  textarea.value = text;

  if (charBadge) {
    charBadge.textContent = `${text.length} caracteres • Pronto para envio`;
  }
}

function printCommSlip() {
  const studentSelect = document.getElementById('commStudentSelect');
  const templateSelect = document.getElementById('commTemplateSelect');
  const inputParent = document.getElementById('commInputParentName');
  const inputTeacher = document.getElementById('commInputTeacherName');
  const inputDeadline = document.getElementById('commInputDeadline');
  const container = document.getElementById('printSlipOnlyContainer');

  if (!studentSelect || !container) return;

  const studentName = studentSelect.value;
  const info = getStudentCommInfo(studentName);
  if (!info) {
    showToast('Selecione um estudante primeiro.', 'error');
    return;
  }

  const template = templateSelect ? templateSelect.value : 'recovery';
  const parentName = inputParent && inputParent.value.trim() ? inputParent.value.trim() : 'Srs. Pais ou Responsáveis';
  const teacherName = inputTeacher && inputTeacher.value.trim() ? inputTeacher.value.trim() : 'Coordenação Pedagógica / Professor(a)';
  const deadline = inputDeadline && inputDeadline.value.trim() ? inputDeadline.value.trim() : 'próxima sexta-feira';

  container.innerHTML = generatePrintSlipHtml(info, template, parentName, teacherName, deadline);

  document.body.classList.add('printing-comm-slip');
  
  const cleanUp = () => {
    document.body.classList.remove('printing-comm-slip');
    window.removeEventListener('afterprint', cleanUp);
  };
  window.addEventListener('afterprint', cleanUp);

  setTimeout(() => {
    window.print();
    setTimeout(cleanUp, 2000);
  }, 100);
}

// ==============================================================================
// 9. TABELA DINÂMICA DE CONSULTA E AUDITORIA (VISÃO 3)
// ==============================================================================
function initFiltersAndSearch() {
  const searchInput = document.getElementById('searchInput');
  const subjectFilter = document.getElementById('subjectFilter');
  const gradeFilter = document.getElementById('gradeFilter');

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

  const cutoff = appState.passingGradeCutoff !== undefined ? appState.passingGradeCutoff : 5.0;

  if (appState.filters.gradeStatus === 'approved') {
    list = list.filter(student => student.grade >= cutoff);
  } else if (appState.filters.gradeStatus === 'recovery') {
    list = list.filter(student => student.grade < cutoff);
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

  const cutoff = appState.passingGradeCutoff !== undefined ? appState.passingGradeCutoff : 5.0;
  const approvedCount = students.filter(s => s.overallGrade >= cutoff).length;
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

    const cutoff = appState.passingGradeCutoff !== undefined ? appState.passingGradeCutoff : 5.0;

    if (student.grade < cutoff) {
      gradeBadgeClass = 'grade-low';
      progressBarClass = 'low';
      statusLabel = 'Abaixo da Média';
      statusPillClass = 'status-critical';
    } else if (student.grade < cutoff + 1.0) {
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
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn btn-secondary btn-sm view-details-btn">🔍 Detalhes</button>
        <button type="button" class="btn-comm-action comm-student-btn" data-student-name="${escapeHtml(student.name)}" title="Gerar recado para os responsáveis deste aluno">💬 Recado</button>
      </td>
    `;

    tr.querySelector('.view-details-btn').addEventListener('click', () => {
      openStudentModal(student);
    });

    const commBtn = tr.querySelector('.comm-student-btn');
    if (commBtn) {
      commBtn.addEventListener('click', () => {
        openCommunicationModal(student.name);
      });
    }

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
  const btnOpenCommModal = document.getElementById('btnOpenCommModal');
  const btnExportXlsx = document.getElementById('btnExportXlsx');
  const btnDownloadPdf = document.getElementById('btnDownloadPdf') || document.getElementById('btnExportCsv');
  const btnExportCsv = document.getElementById('btnExportCsv');
  const btnPrint = document.getElementById('btnPrint');

  if (btnOpenPdfModal) btnOpenPdfModal.addEventListener('click', () => openPdfModal());
  if (btnOpenCommModal) btnOpenCommModal.addEventListener('click', () => openCommunicationModal());
  if (btnExportXlsx) btnExportXlsx.addEventListener('click', () => exportMatrixToExcel());
  if (btnDownloadPdf) btnDownloadPdf.addEventListener('click', () => downloadDirectPdf());
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
 * Faz o download direto do relatório oficial em PDF (1 clique).
 */
async function downloadDirectPdf() {
  const { students, turmaName } = appState.matrixData;
  if (!students || students.length === 0) {
    showToast('Nenhum dado carregado para gerar PDF.', 'error');
    return;
  }

  showToast('Gerando e baixando PDF oficial da turma... Aguarde.', 'info');

  try {
    if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
      throw new Error('Biblioteca jsPDF não encontrada no navegador.');
    }

    await generateOfficialClassPdf({
      turma: turmaName || 'Turma',
      periodo: 'Fechamento de Notas',
      school: 'Escola Estadual',
      highlightGrades: true,
      includeStats: true,
      signatureLine: true
    });

    showToast('PDF baixado com sucesso!', 'success');
  } catch (err) {
    console.error('Erro na geração direta do PDF:', err);
    showToast('Erro ao gerar PDF direto. Abrindo janela de impressão alternativa.', 'warning');
    setTimeout(() => window.print(), 300);
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
    { content: 'Nome', rowSpan: 2, styles: { halign: 'left', valign: 'middle', fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' } }
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

      const cutoff = appState.passingGradeCutoff !== undefined ? appState.passingGradeCutoff : 5.0;
      const isLow = highlightGrades && gradeVal < cutoff;
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
      const cutoff = appState.passingGradeCutoff !== undefined ? appState.passingGradeCutoff : 5.0;
      const isLow = highlightGrades && gradeVal < cutoff;

      let statusText = 'Aprovado';
      let statusTextColor = [5, 150, 105];
      if (gradeVal < cutoff) {
        statusText = 'Abaixo da Média';
        statusTextColor = [220, 38, 38];
      } else if (gradeVal < cutoff + 1.0) {
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
    const headers = ['#', 'Nome'];
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
        if (score.grade !== undefined) {
          gradeVal = score.grade;
        } else if (score.total > 0) {
          gradeVal = (score.completed / score.total) * 10;
        }
        gradeVal = Math.min(10, Math.max(0, gradeVal));
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
    const headers = ['#', 'Nome'];
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
        if (score.grade !== undefined) {
          gradeVal = score.grade;
        } else if (score.total > 0) {
          gradeVal = (score.completed / score.total) * 10;
        }
        gradeVal = Math.min(10, Math.max(0, gradeVal));
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
