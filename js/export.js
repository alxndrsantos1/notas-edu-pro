import { renderPerformanceChart } from './charts.js';
import { openCommunicationModal } from './comunicacao.js';
import { appState } from './state.js';
import { showToast } from './utils.js';

// ==============================================================================
// 11. EXPORTAÇÃO EXCEL, CSV, IMPRESSÃO E GERAÇÃO DE PDF PARA ALUNOS
// ==============================================================================
export function initExportButtons() {
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
export async function downloadDirectPdf() {
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
export function initPdfModalEvents() {
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

export function openPdfModal() {
  const modal = document.getElementById('pdfModal');
  if (!modal) return;

  const turmaInput = document.getElementById('pdfInputTurma');
  if (turmaInput) {
    turmaInput.value = appState.matrixData.turmaName || '';
  }

  modal.classList.add('active');
}

export function closePdfModal() {
  const modal = document.getElementById('pdfModal');
  if (modal) modal.classList.remove('active');
}

/**
 * Converte um elemento SVG em Data URL PNG de alta resolução para inserção em PDF.
 */
export function svgToPngDataUrl(svgElement) {
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
export async function handleDownloadPdf() {
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
export async function generateOfficialClassPdf(options) {
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
export async function generateIndividualReportCardsPdf(options) {
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
export async function generateChartOnlyPdf(options) {
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
export function exportMatrixToExcel() {
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

export function exportMatrixToCsv() {
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
