import { renderPerformanceChart } from './charts.js';
import { renderConselhoDeClasseView } from './conselho.js';
import { renderMatrixReport } from './matrix.js';
import { appState } from './state.js';
import { renderStudentReportView } from './studentReport.js';
import { renderWeeksView } from './weeks.js';

// ==============================================================================
// 4. CONTROLE DE ABAS (TABS) E VISIBILIDADE DO DASHBOARD
// ==============================================================================

// Aba -> seção exibida e função que a redesenha
const TAB_SECTIONS = {
  matrixView: { section: 'officialReportSection', render: () => renderMatrixReport() },
  chartView: { section: 'officialChartSection', render: () => renderPerformanceChart() },
  conselhoView: { section: 'officialConselhoSection', render: () => renderConselhoDeClasseView() },
  weeksView: { section: 'officialWeeksSection', render: () => renderWeeksView() },
  listView: { section: 'officialListSection', render: null },
  studentReportView: { section: 'officialStudentReportSection', render: () => renderStudentReportView() }
};

export function activateTab(target) {
  if (!TAB_SECTIONS[target]) target = 'matrixView';
  appState.activeTab = target;
  const tabButtons = document.querySelectorAll('.view-tab-btn');
  tabButtons.forEach(b => {
    if (b.getAttribute('data-tab') === target) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  Object.entries(TAB_SECTIONS).forEach(([tab, cfg]) => {
    const sec = document.getElementById(cfg.section);
    if (sec) sec.style.display = tab === target ? 'block' : 'none';
  });
  const cfg = TAB_SECTIONS[target];
  if (cfg.render) cfg.render();
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
