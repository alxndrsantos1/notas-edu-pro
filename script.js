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

import { initChartControls } from './js/charts.js';
import { initCommunicationModule } from './js/comunicacao.js';
import { initConselhoDeClasse } from './js/conselho.js';
import { initDemoButton } from './js/demo.js';
import { initExportButtons, initPdfModalEvents } from './js/export.js';
import { recalculateAllGrades } from './js/grades.js';
import { initActivityModeSelector, initColumnMappingModal } from './js/mapping.js';
import { initMatrixRiskControls } from './js/matrix.js';
import { appState } from './js/state.js';
import { initFiltersAndSearch, initStudentModalEvents, initTableSorting } from './js/table.js';
import { initViewTabs } from './js/tabs.js';
import { initClearButtons, initDragAndDrop, initFileInputs } from './js/upload.js';
import { initWeeksModule } from './js/weeks.js';


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
