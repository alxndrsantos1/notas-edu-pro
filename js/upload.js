import { computeGradesForFile, recalculateAllGrades } from './grades.js';
import { findStudentNameColumn, findStudentRAColumn } from './rules.js';
import { appState } from './state.js';
import { updateAppViewState } from './tabs.js';
import { cleanString, normalizeString, showToast } from './utils.js';

// ==============================================================================
// 6. PARSING DE ARQUIVOS COM PAPAPARSE
// ==============================================================================

export function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    if (typeof Papa === 'undefined') {
      reject(new Error('A biblioteca PapaParse não está disponível.'));
      return;
    }

    Papa.parse(file, {
      header: false,
      skipEmptyLines: 'greedy',
      encoding: 'UTF-8',
      complete: (results) => {
        if (!results.data || results.data.length === 0) {
          reject(new Error(`O arquivo "${file.name}" está vazio.`));
          return;
        }

        const rawMatrix = results.data;
        let headerRowIndex = 0;

        for (let i = 0; i < Math.min(rawMatrix.length, 10); i++) {
          const rowText = rawMatrix[i].map(c => normalizeString(c)).join(' | ');
          if (
            rowText.includes('pause e responda') || 
            rowText.includes('registro') || 
            rowText.includes('nome') || 
            rowText.includes('aluno') || 
            rowText.includes('sed') || 
            rowText.includes('ra')
          ) {
            headerRowIndex = i;
            break;
          }
        }

        const rawHeaders = rawMatrix[headerRowIndex];
        const columnMappings = [];
        const headerCounts = {};
        rawHeaders.forEach((h, colIdx) => {
          let cleanH = cleanString(h);
          // Caso especial do Moodle: se a coluna 0 está em branco ou sem nome, é a coluna do Nome do Aluno!
          if (!cleanH && colIdx === 0) {
            cleanH = 'Nome do Aluno';
          }
          // Ignora cabeçalhos em branco secundários (colunas de data/hora do Moodle com header vazio)
          if (cleanH) {
            // Cabeçalhos repetidos recebem sufixo para não sobrescreverem uns aos outros no objeto da linha
            headerCounts[cleanH] = (headerCounts[cleanH] || 0) + 1;
            if (headerCounts[cleanH] > 1) {
              cleanH = `${cleanH} (${headerCounts[cleanH]})`;
            }
            columnMappings.push({
              headerName: cleanH,
              colIndex: colIdx
            });
          }
        });

        const headers = columnMappings.map(c => c.headerName);
        const dataRows = [];

        for (let i = headerRowIndex + 1; i < rawMatrix.length; i++) {
          const rowVals = rawMatrix[i];
          if (!rowVals || rowVals.length === 0) continue;
          
          const rowObj = {};
          let hasVal = false;
          columnMappings.forEach(col => {
            const v = cleanString(rowVals[col.colIndex]);
            if (v) hasVal = true;
            rowObj[col.headerName] = v;
          });

          if (hasVal) dataRows.push(rowObj);
        }

        if (dataRows.length === 0) {
          reject(new Error(`Nenhuma linha de alunos encontrada em "${file.name}".`));
          return;
        }

        const sampleRows = dataRows.slice(0, 5);
        const nameColumn = findStudentNameColumn(headers, sampleRows);
        const raColumn = findStudentRAColumn(headers, sampleRows);

        const rawFileObj = {
          fileName: file.name,
          headers,
          rawRows: dataRows,
          nameColumn,
          raColumn
        };

        const computed = computeGradesForFile(rawFileObj);
        resolve(computed);
      },
      error: (err) => {
        reject(new Error(`Erro ao ler "${file.name}": ${err.message}`));
      }
    });
  });
}

export async function handleFilesSelected(files) {
  if (!files || files.length === 0) return;

  const validFiles = Array.from(files).filter(f => 
    f.name.toLowerCase().endsWith('.csv') || f.type === 'text/csv' || f.type === 'application/vnd.ms-excel'
  );

  if (validFiles.length === 0) {
    showToast('Por favor, selecione arquivos .csv válidos.', 'error');
    return;
  }

  showToast(`Processando ${validFiles.length} arquivo(s)...`, 'info');

  let addedCount = 0;

  for (const file of validFiles) {
    try {
      appState.processedFiles = appState.processedFiles.filter(f => f.fileName !== file.name);
      appState.studentsData = appState.studentsData.filter(s => s.fileName !== file.name);

      const processedData = await parseCsvFile(file);
      appState.processedFiles.push(processedData);
      appState.studentsData.push(...processedData.students);
      addedCount++;
    } catch (err) {
      console.error(err);
      showToast(err.message, 'error');
    }
  }

  if (addedCount > 0) {
    showToast(`${addedCount} arquivo(s) carregado(s)!`, 'success');
  }

  // Recalcula tudo (inclui detecção de semanas letivas e a aba de semanas)
  recalculateAllGrades();
  updateAppViewState(true);
}

// ==============================================================================
// 8. DRAG & DROP E UPLOAD
// ==============================================================================
export function initDragAndDrop() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');

  if (!dropzone || !fileInput) return;

  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      handleFilesSelected(dt.files);
    }
  });

  dropzone.addEventListener('click', (e) => {
    if (e.target.closest('#btnLoadDemo')) return;
    fileInput.click();
  });
}

export function initFileInputs() {
  const fileInput = document.getElementById('fileInput');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFilesSelected(e.target.files);
        e.target.value = '';
      }
    });
  }
}

export function renderUploadedFilesChips() {
  const container = document.getElementById('uploadedFilesList');
  const card = document.getElementById('uploadedFilesCard');
  const countSpan = document.getElementById('uploadedFilesCount');
  const dropzoneClearBtn = document.getElementById('btnDropzoneClear');

  const fileCount = appState.processedFiles.length;
  if (countSpan) countSpan.textContent = String(fileCount);
  if (dropzoneClearBtn) dropzoneClearBtn.style.display = fileCount > 0 ? 'inline-flex' : 'none';

  if (!container || !card) return;

  if (fileCount === 0) {
    card.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  card.style.display = 'block';
  container.innerHTML = '';

  appState.processedFiles.forEach((f) => {
    const chip = document.createElement('div');
    chip.className = 'file-chip';
    chip.innerHTML = `
      <div class="file-chip-info">
        <span class="file-chip-icon">📄</span>
        <div class="file-chip-meta">
          <div class="file-chip-name" title="${f.fileName}">${f.fileName}</div>
          <div class="file-chip-details">
            ${f.studentCount} alunos • ${f.totalActivities} atividades
          </div>
        </div>
      </div>
      <button class="file-remove-btn" title="Remover" data-filename="${f.fileName}">✕</button>
    `;

    chip.querySelector('.file-remove-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      removeFile(f.fileName);
    });

    container.appendChild(chip);
  });
}

export function removeFile(fileName) {
  appState.processedFiles = appState.processedFiles.filter(f => f.fileName !== fileName);
  appState.studentsData = appState.studentsData.filter(s => s.fileName !== fileName);
  
  showToast(`Arquivo "${fileName}" removido.`, 'info');
  recalculateAllGrades();
}

/**
 * Remove todos os arquivos carregados e redefine o sistema para o estado limpo.
 */
export function clearAllUploadedFiles() {
  if (appState.studentsData.length === 0 && appState.processedFiles.length === 0) {
    showToast('Nenhum arquivo ou dado para limpar.', 'info');
    return;
  }

  appState.processedFiles = [];
  appState.studentsData = [];
  appState.matrixData = {
    turmaName: '',
    subjects: [],
    students: [],
    averageActivities: 0
  };

  const fileInput = document.getElementById('fileInput');
  if (fileInput) fileInput.value = '';

  recalculateAllGrades();
  showToast('Todos os arquivos foram removidos com sucesso.', 'info');
}

/**
 * Inicializa todos os botões de limpeza (no dropzone, no card de arquivos e na barra de filtros).
 */
export function initClearButtons() {
  const btnClearAll = document.getElementById('btnClearAllUploadedFiles');
  const btnDropzoneClear = document.getElementById('btnDropzoneClear');
  const clearAllBtn = document.getElementById('clearAllBtn');

  if (btnClearAll) {
    btnClearAll.addEventListener('click', (e) => {
      e.stopPropagation();
      clearAllUploadedFiles();
    });
  }

  if (btnDropzoneClear) {
    btnDropzoneClear.addEventListener('click', (e) => {
      e.stopPropagation();
      clearAllUploadedFiles();
    });
  }

  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      clearAllUploadedFiles();
    });
  }

  const btnUploadAnother = document.getElementById('btnUploadAnother');
  if (btnUploadAnother) {
    btnUploadAnother.addEventListener('click', (e) => {
      e.stopPropagation();
      const fileInput = document.getElementById('fileInput');
      if (fileInput) fileInput.click();
    });
  }
}
