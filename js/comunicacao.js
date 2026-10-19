import { appState } from './state.js';
import { escapeHtml, showToast } from './utils.js';

// ==============================================================================
// 8.3. CENTRAL DE COMUNICAÇÃO COM PAIS E ALUNOS (WHATSAPP, E-MAIL E BILHETE IMPRESSO)
// ==============================================================================
export function getStudentCommInfo(studentName) {
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

export function buildCommMessageText(info, template, parentName, teacherName, deadline) {
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

export function generatePrintSlipHtml(info, template, parentName, teacherName, deadline) {
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

export function initCommunicationModule() {
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

export function openCommunicationModal(selectedStudentName, defaultTemplate) {
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

export function closeCommunicationModal() {
  const modal = document.getElementById('commModalOverlay');
  if (modal) modal.style.display = 'none';
}

export function populateCommStudentSelect(targetStudentName) {
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

export function updateCommunicationMessage() {
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

export function printCommSlip() {
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
