import { openCommunicationModal } from './comunicacao.js';
import { appState } from './state.js';
import { escapeHtml, normalizeString } from './utils.js';

// ==============================================================================
// 9. TABELA DINÂMICA DE CONSULTA E AUDITORIA (VISÃO 3)
// ==============================================================================
export function initFiltersAndSearch() {
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

export function updateSubjectFilterOptions() {
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

export function initTableSorting() {
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

export function getFilteredAndSortedStudents() {
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

export function updateDashboardMetrics() {
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

export function renderTableRows() {
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

export function updateDashboardAndTable() {
  updateDashboardMetrics();
  renderTableRows();
}

// ==============================================================================
// 10. MODAL DE AUDITORIA DE ATIVIDADES
// ==============================================================================
export function initStudentModalEvents() {
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

export function openStudentModal(student) {
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
