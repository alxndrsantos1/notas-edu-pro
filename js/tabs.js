import { renderPerformanceChart } from './charts.js';
import { renderConselhoDeClasseView } from './conselho.js';
import { renderMatrixReport } from './matrix.js';
import { appState } from './state.js';
import { renderWeeksView } from './weeks.js';

// ==============================================================================
// 4. CONTROLE DE ABAS (TABS) E VISIBILIDADE DO DASHBOARD
// ==============================================================================

export function activateTab(target) {
  appState.activeTab = target;
  const tabButtons = document.querySelectorAll('.view-tab-btn');
  tabButtons.forEach(b => {
    if (b.getAttribute('data-tab') === target) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  const officialReportSec = document.getElementById('officialReportSection');
  const officialConselhoSec = document.getElementById('officialConselhoSection');
  const officialWeeksSec = document.getElementById('officialWeeksSection');
  const officialChartSec = document.getElementById('officialChartSection');
  const officialListSec = document.getElementById('officialListSection');

  if (target === 'chartView') {
    if (officialReportSec) officialReportSec.style.display = 'none';
    if (officialConselhoSec) officialConselhoSec.style.display = 'none';
    if (officialWeeksSec) officialWeeksSec.style.display = 'none';
    if (officialChartSec) officialChartSec.style.display = 'block';
    if (officialListSec) officialListSec.style.display = 'none';
    renderPerformanceChart();
  } else if (target === 'matrixView') {
    if (officialReportSec) officialReportSec.style.display = 'block';
    if (officialConselhoSec) officialConselhoSec.style.display = 'none';
    if (officialWeeksSec) officialWeeksSec.style.display = 'none';
    if (officialChartSec) officialChartSec.style.display = 'none';
    if (officialListSec) officialListSec.style.display = 'none';
    renderMatrixReport();
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
  } else if (target === 'listView') {
    if (officialReportSec) officialReportSec.style.display = 'none';
    if (officialConselhoSec) officialConselhoSec.style.display = 'none';
    if (officialWeeksSec) officialWeeksSec.style.display = 'none';
    if (officialChartSec) officialChartSec.style.display = 'none';
    if (officialListSec) officialListSec.style.display = 'block';
  }
}

export function scrollToReportSection() {
  setTimeout(() => {
    const target = document.getElementById('officialReportSection') || document.querySelector('.view-tabs-nav');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 120);
}

export function updateAppViewState(forceMatrixView = false) {
  const initialUploadView = document.getElementById('initialUploadView');
  const dashboardView = document.getElementById('dashboardView');
  const hasData = appState.processedFiles && appState.processedFiles.length > 0;

  if (initialUploadView && dashboardView) {
    if (hasData) {
      initialUploadView.style.display = 'none';
      dashboardView.style.display = 'block';

      // Atualiza o texto informativo do topo do dashboard
      const titleEl = document.getElementById('dashboardActiveFilesTitle');
      const subEl = document.getElementById('dashboardActiveFilesSub');
      if (titleEl) {
        if (appState.processedFiles.length === 1) {
          titleEl.textContent = `Arquivo: ${appState.processedFiles[0].fileName}`;
        } else {
          titleEl.textContent = `${appState.processedFiles.length} arquivos carregados`;
        }
      }
      if (subEl) {
        const studentCount = appState.matrixData?.students?.length || appState.studentsData.length;
        subEl.textContent = `${studentCount} alunos mapeados • Relatório Oficial ativo`;
      }

      if (forceMatrixView || appState.activeTab === 'matrixView') {
        activateTab('matrixView');
      } else {
        activateTab(appState.activeTab);
      }

      if (forceMatrixView) {
        scrollToReportSection();
      }
    } else {
      initialUploadView.style.display = 'flex';
      dashboardView.style.display = 'none';
    }
  }
}

export function initViewTabs() {
  const tabButtons = document.querySelectorAll('.view-tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      activateTab(target);
    });
  });
}
