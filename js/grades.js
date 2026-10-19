import { renderPerformanceChart } from './charts.js';
import { renderConselhoDeClasseView } from './conselho.js';
import { updateColumnsAlertBanner } from './mapping.js';
import { buildOfficialMatrix, renderMatrixReport } from './matrix.js';
import { extractSubjectFromFileName, extractWeekFromActivityName, isActivityCompleted, isColumnIncludedInWeekFilter, isEvaluativeColumn } from './rules.js';
import { appState } from './state.js';
import { updateDashboardAndTable, updateSubjectFilterOptions } from './table.js';
import { updateAppViewState } from './tabs.js';
import { renderUploadedFilesChips } from './upload.js';
import { cleanString } from './utils.js';
import { renderWeeksView, updateWeeksFilterUI } from './weeks.js';

// ==============================================================================
// 5. CÁLCULO GERAL E ATUALIZAÇÕES
// ==============================================================================

export function computeGradesForFile(fileObj) {
  const { fileName, rawRows, headers, nameColumn, raColumn } = fileObj;
  // A disciplina vinda da URL vale só para o primeiro arquivo; os demais usam o nome do arquivo,
  // senão todas as matérias se fundiriam numa só na matriz
  const isFirstFile = appState.processedFiles.length === 0 || appState.processedFiles[0].fileName === fileName;
  const subjectName = (isFirstFile && appState.customDisciplinaName) || extractSubjectFromFileName(fileName);
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

export function recalculateAllGrades() {
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
  updateAppViewState(false);
}
