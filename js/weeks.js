import { openCommunicationModal } from './comunicacao.js';
import { recalculateAllGrades } from './grades.js';
import { appState } from './state.js';
import { escapeHtml, normalizeString, showToast } from './utils.js';

// ==============================================================================
// 5.5. RECORTE TEMPORAL E ACOMPANHAMENTO POR SEMANAS LETIVAS
// ==============================================================================

export function initWeeksModule() {
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

export function updateWeeksFilterUI() {
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

export function renderWeeksView() {
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

export function copyPendingStudentsForWeek() {
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

export function exportWeeksToExcel() {
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
