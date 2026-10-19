import { openCommunicationModal } from './comunicacao.js';
import { appState } from './state.js';
import { escapeHtml, showToast } from './utils.js';

// ==============================================================================
// 8.2. DIAGNÓSTICO E APOIO AO CONSELHO DE CLASSE
// ==============================================================================
export function renderConselhoDeClasseView() {
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

export function updateSimulatorSubjectSelect() {
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

export function updateSimulatorResult() {
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

export function initConselhoDeClasse() {
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
export async function exportConselhoToPdf() {
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
export function exportConselhoToExcel() {
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
