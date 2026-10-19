import { recalculateAllGrades } from './grades.js';
import { isEvaluativeColumn, isIgnoredNonEvaluativeColumn } from './rules.js';
import { appState } from './state.js';
import { cleanString, escapeHtml, showToast } from './utils.js';

// ==============================================================================
// 7. SELETOR DE MODALIDADE E MAPEAMENTO DE COLUNAS
// ==============================================================================
export function initActivityModeSelector() {
  const buttons = document.querySelectorAll('.segmented-btn[data-mode]');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      if (appState.activityMode === mode) return;

      appState.activityMode = mode;
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const labels = {
        both: 'Ambos (Pause e Responda + Registro)',
        pause: 'Somente "Pause e Responda"',
        registro: 'Somente "Registro"'
      };
      showToast(`Modalidade: ${labels[mode]}`, 'info');
      recalculateAllGrades();
    });
  });
}

export function updateColumnsAlertBanner() {
  const banner = document.getElementById('columnsAlertBanner');
  const alertText = document.getElementById('columnsAlertText');
  if (!banner || !alertText) return;

  if (appState.processedFiles.length === 0) {
    banner.style.display = 'none';
    return;
  }

  banner.style.display = 'flex';
  const firstFile = appState.processedFiles[0];

  alertText.innerHTML = `
    Arquivo <strong>${escapeHtml(firstFile.fileName)}</strong>: 
    Nome identificado em <strong>"${escapeHtml(firstFile.nameColumn)}"</strong> 
    e RA em <strong>"${escapeHtml(firstFile.raColumn)}"</strong>.
  `;
}

export function initColumnMappingModal() {
  const modal = document.getElementById('columnMappingModal');
  const openBtn = document.getElementById('btnOpenColumnMapping');
  const bannerChangeBtn = document.getElementById('btnChangeColumnsFromBanner');
  const closeBtn = document.getElementById('mappingModalCloseBtn');
  const cancelBtn = document.getElementById('mappingModalCancelBtn');
  const saveBtn = document.getElementById('mappingModalSaveBtn');

  const fileSelect = document.getElementById('mappingFileSelect');
  const nameSelect = document.getElementById('mappingNameColSelect');
  const raSelect = document.getElementById('mappingRaColSelect');
  const fileSelectorGroup = document.getElementById('mappingFileSelectorGroup');

  if (!modal) return;

  const openModal = () => {
    if (appState.processedFiles.length === 0) {
      showToast('Carregue ao menos um arquivo CSV.', 'info');
      return;
    }

    appState.selectedFileForMapping = appState.processedFiles[0];

    if (fileSelectorGroup) {
      if (appState.processedFiles.length > 1) {
        fileSelectorGroup.style.display = 'block';
        fileSelect.innerHTML = '';
        appState.processedFiles.forEach((f, idx) => {
          const opt = document.createElement('option');
          opt.value = f.fileName;
          opt.textContent = `${f.fileName} (${f.subjectName})`;
          if (idx === 0) opt.selected = true;
          fileSelect.appendChild(opt);
        });
      } else {
        fileSelectorGroup.style.display = 'none';
      }
    }

    populateColumnSelects();
    updateMappingPreview();
    modal.classList.add('active');
  };

  const closeModal = () => modal.classList.remove('active');

  if (openBtn) openBtn.addEventListener('click', openModal);
  if (bannerChangeBtn) bannerChangeBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  if (fileSelect) {
    fileSelect.addEventListener('change', () => {
      const selected = appState.processedFiles.find(f => f.fileName === fileSelect.value);
      if (selected) {
        appState.selectedFileForMapping = selected;
        populateColumnSelects();
        updateMappingPreview();
      }
    });
  }

  if (nameSelect) nameSelect.addEventListener('change', updateMappingPreview);
  if (raSelect) raSelect.addEventListener('change', updateMappingPreview);

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const curFile = appState.selectedFileForMapping;
      if (!curFile) return;

      curFile.nameColumn = nameSelect.value;
      curFile.raColumn = raSelect.value;

      recalculateAllGrades();
      closeModal();
      showToast(`Mapeamento atualizado para "${curFile.fileName}".`, 'success');
    });
  }
}

export function populateColumnSelects() {
  const curFile = appState.selectedFileForMapping;
  const nameSelect = document.getElementById('mappingNameColSelect');
  const raSelect = document.getElementById('mappingRaColSelect');

  if (!curFile || !nameSelect || !raSelect) return;

  nameSelect.innerHTML = '';
  raSelect.innerHTML = '';

  curFile.headers.forEach(header => {
    const isEval = isEvaluativeColumn(header, 'both');
    const isIgnored = isIgnoredNonEvaluativeColumn(header);
    let label = header;
    if (isEval) {
      label = `${header} (Atividade Avaliativa)`;
    } else if (isIgnored) {
      label = `${header} (Desconsiderada - Material de Aula)`;
    }

    const optName = document.createElement('option');
    optName.value = header;
    optName.textContent = label;
    if (header === curFile.nameColumn) optName.selected = true;
    nameSelect.appendChild(optName);

    const optRa = document.createElement('option');
    optRa.value = header;
    optRa.textContent = label;
    if (header === curFile.raColumn) optRa.selected = true;
    raSelect.appendChild(optRa);
  });
}

export function updateMappingPreview() {
  const curFile = appState.selectedFileForMapping;
  const nameSelect = document.getElementById('mappingNameColSelect');
  const raSelect = document.getElementById('mappingRaColSelect');
  const tbody = document.getElementById('mappingPreviewTbody');

  if (!curFile || !nameSelect || !raSelect || !tbody) return;

  tbody.innerHTML = '';
  const sample = curFile.rawRows.slice(0, 3);

  sample.forEach((row, i) => {
    const tr = document.createElement('tr');
    const nameVal = cleanString(row[nameSelect.value]) || `Aluno ${i + 1}`;
    const raVal = cleanString(row[raSelect.value]) || '-';

    tr.innerHTML = `
      <td><strong>${escapeHtml(nameVal)}</strong></td>
      <td><code>${escapeHtml(raVal)}</code></td>
    `;
    tbody.appendChild(tr);
  });
}
