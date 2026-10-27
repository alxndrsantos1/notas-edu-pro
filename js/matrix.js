import { renderPerformanceChart } from './charts.js';
import { renderConselhoDeClasseView } from './conselho.js';
import { appState } from './state.js';
import { updateDashboardAndTable } from './table.js';
import { escapeHtml, normalizeString } from './utils.js';

// ==============================================================================
// 3. CONSOLIDAÇÃO DA MATRIZ OFICIAL (PÁGINA 1) E GRÁFICO (PÁGINA 2)
// ==============================================================================

/**
 * Constrói a Matriz Oficial de Resultados consolidando todos os arquivos/matérias.
 */
export function buildOfficialMatrix() {
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

  // Usa o RA como chave apenas se ele for único no arquivo (evita fundir homônimos,
  // sem fundir a turma inteira quando a coluna de RA foi detectada errado)
  const isRaReliable = (file) => {
    const ras = file.students
      .filter(st => normalizeString(st.ra) !== normalizeString(st.name))
      .map(st => normalizeString(st.ra))
      .filter(ra => ra && ra !== '-');
    return ras.length === file.students.length && new Set(ras).size === ras.length;
  };

  // Nome -> chave de RA, para que arquivos sem RA confiável caiam no mesmo aluno (null = homônimo)
  const nameToRaKey = new Map();
  appState.processedFiles.forEach(file => {
    if (!isRaReliable(file)) return;
    file.students.forEach(st => {
      const nameKey = normalizeString(st.name);
      const raKey = `ra:${normalizeString(st.ra)}`;
      if (nameToRaKey.has(nameKey) && nameToRaKey.get(nameKey) !== raKey) {
        nameToRaKey.set(nameKey, null);
      } else {
        nameToRaKey.set(nameKey, raKey);
      }
    });
  });

  appState.processedFiles.forEach(file => {
    const raIsReliable = isRaReliable(file);

    file.students.forEach(st => {
      const nameKey = normalizeString(st.name);
      const key = raIsReliable
        ? `ra:${normalizeString(st.ra)}`
        : (nameToRaKey.get(nameKey) || `nome:${nameKey}`);
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
export function renderMatrixReport() {
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

  row1 += `<th rowspan="2" class="subject-header">Total de Atividades Concluídas<br><span style="font-weight: 600; font-size: 0.72rem; color: #3730a3;">(${subColLabel})</span></th></tr>`;
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

// ==============================================================================
// 8.1. CONTROLES DE RISCO NA MATRIZ E MÉDIA DE CORTE
// ==============================================================================
export function initMatrixRiskControls() {
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
