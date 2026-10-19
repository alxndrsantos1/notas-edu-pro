import { renderPerformanceChart } from './charts.js';
import { updateColumnsAlertBanner } from './mapping.js';
import { buildOfficialMatrix, renderMatrixReport } from './matrix.js';
import { appState } from './state.js';
import { updateDashboardAndTable, updateSubjectFilterOptions } from './table.js';
import { updateAppViewState } from './tabs.js';
import { renderUploadedFilesChips } from './upload.js';
import { showToast } from './utils.js';

// ==============================================================================
// 12. DADOS DE DEMONSTRAÇÃO OFICIAIS (TURMA 3A - IDÊNTICO À IMAGEM)
// ==============================================================================
export function initDemoButton() {
  const btnLoadDemo = document.getElementById('btnLoadDemo');
  if (!btnLoadDemo) return;

  btnLoadDemo.addEventListener('click', (e) => {
    e.stopPropagation();
    loadOfficialStandardDemo();
  });
}

/**
 * Carrega a Turma 3A com as 7 disciplinas exatas da imagem do usuário:
 * Versionamento, IA, Mobile, Back-End, Front-End, Banco de Dados, Projetos
 * e os 23 alunos com as quantidades exatas de atividades.
 */
export function loadOfficialStandardDemo() {
  // Lista dos 23 alunos oficiais com valores exatos da imagem
  const officialRoster = [
    { name: 'Ana Carolina Lima Dias', ra: '0001-SP', scores: { 'Versionamento': 0, 'IA': 37, 'Mobile': 0, 'Back-End': 0, 'Front-End': 0, 'Banco de Dados': 0, 'Projetos': 0 } },
    { name: 'Ana Laura Monteiro Nunes', ra: '0002-SP', scores: { 'Versionamento': 54, 'IA': 49, 'Mobile': 56, 'Back-End': 49, 'Front-End': 49, 'Banco de Dados': 55, 'Projetos': 49 } },
    { name: 'Arthur Henrique Rosa Argenton', ra: '0003-SP', scores: { 'Versionamento': 54, 'IA': 49, 'Mobile': 56, 'Back-End': 49, 'Front-End': 49, 'Banco de Dados': 55, 'Projetos': 49 } },
    { name: 'Brian Eduardo Américo Vitorino', ra: '0004-SP', scores: { 'Versionamento': 0, 'IA': 8, 'Mobile': 4, 'Back-End': 1, 'Front-End': 0, 'Banco de Dados': 6, 'Projetos': 0 } },
    { name: 'Cauane Vitoria Torres Bignardi', ra: '0005-SP', scores: { 'Versionamento': 51, 'IA': 43, 'Mobile': 51, 'Back-End': 43, 'Front-End': 42, 'Banco de Dados': 49, 'Projetos': 47 } },
    { name: 'Christian Damasceno Passos', ra: '0006-SP', scores: { 'Versionamento': 33, 'IA': 18, 'Mobile': 18, 'Back-End': 42, 'Front-End': 42, 'Banco de Dados': 48, 'Projetos': 0 } },
    { name: 'Davi Silveira Costa', ra: '0007-SP', scores: { 'Versionamento': 0, 'IA': 0, 'Mobile': 15, 'Back-End': 0, 'Front-End': 1, 'Banco de Dados': 14, 'Projetos': 0 } },
    { name: 'Felipe Clemente Spilla Ferreira', ra: '0008-SP', scores: { 'Versionamento': 0, 'IA': 15, 'Mobile': 32, 'Back-End': 0, 'Front-End': 0, 'Banco de Dados': 3, 'Projetos': 0 } },
    { name: 'Felipe Costa Soares Toledo', ra: '0009-SP', scores: { 'Versionamento': 50, 'IA': 49, 'Mobile': 54, 'Back-End': 43, 'Front-End': 42, 'Banco de Dados': 55, 'Projetos': 44 } },
    { name: 'Felipe Gonçalves Gedra', ra: '0010-SP', scores: { 'Versionamento': 0, 'IA': 23, 'Mobile': 40, 'Back-End': 0, 'Front-End': 0, 'Banco de Dados': 0, 'Projetos': 2 } },
    { name: 'Felipe Romão da Silva', ra: '0011-SP', scores: { 'Versionamento': 54, 'IA': 16, 'Mobile': 56, 'Back-End': 49, 'Front-End': 49, 'Banco de Dados': 55, 'Projetos': 49 } },
    { name: 'Gabriel Eduardo dos Santos Tamura', ra: '0012-SP', scores: { 'Versionamento': 0, 'IA': 24, 'Mobile': 0, 'Back-End': 1, 'Front-End': 0, 'Banco de Dados': 14, 'Projetos': 0 } },
    { name: 'Guilherme Hayashi Nomiyama', ra: '0013-SP', scores: { 'Versionamento': 36, 'IA': 36, 'Mobile': 49, 'Back-End': 42, 'Front-End': 42, 'Banco de Dados': 48, 'Projetos': 42 } },
    { name: 'Isabella Pereira de Andrade', ra: '0014-SP', scores: { 'Versionamento': 9, 'IA': 16, 'Mobile': 4, 'Back-End': 0, 'Front-End': 2, 'Banco de Dados': 20, 'Projetos': 0 } },
    { name: 'Isaque Silva do Nascimento', ra: '0015-SP', scores: { 'Versionamento': 0, 'IA': 8, 'Mobile': 0, 'Back-End': 1, 'Front-End': 0, 'Banco de Dados': 1, 'Projetos': 0 } },
    { name: 'Joao Pedro Oliveira Silva', ra: '0016-SP', scores: { 'Versionamento': 37, 'IA': 36, 'Mobile': 49, 'Back-End': 0, 'Front-End': 42, 'Banco de Dados': 48, 'Projetos': 42 } },
    { name: 'Jorge Matheus da Silva Vitor', ra: '0017-SP', scores: { 'Versionamento': 0, 'IA': 22, 'Mobile': 36, 'Back-End': 12, 'Front-End': 24, 'Banco de Dados': 31, 'Projetos': 0 } },
    { name: 'Maria Clara Simonelli Mesquita de Almeida', ra: '0018-SP', scores: { 'Versionamento': 54, 'IA': 49, 'Mobile': 56, 'Back-End': 49, 'Front-End': 49, 'Banco de Dados': 55, 'Projetos': 49 } },
    { name: 'Miguel da Silva Nunes Molinos', ra: '0019-SP', scores: { 'Versionamento': 40, 'IA': 18, 'Mobile': 1, 'Back-End': 1, 'Front-End': 0, 'Banco de Dados': 0, 'Projetos': 0 } },
    { name: 'Nicolly Victoria Martins Leal', ra: '0020-SP', scores: { 'Versionamento': 12, 'IA': 31, 'Mobile': 26, 'Back-End': 41, 'Front-End': 0, 'Banco de Dados': 48, 'Projetos': 0 } },
    { name: 'Pablo Leandro', ra: '0021-SP', scores: { 'Versionamento': 48, 'IA': 22, 'Mobile': 33, 'Back-End': 24, 'Front-End': 24, 'Banco de Dados': 20, 'Projetos': 12 } },
    { name: 'Raul Fernandes Alencar', ra: '0022-SP', scores: { 'Versionamento': 19, 'IA': 24, 'Mobile': 21, 'Back-End': 18, 'Front-End': 18, 'Banco de Dados': 20, 'Projetos': 24 } },
    { name: 'Vinicius Reis Buim Neves', ra: '0023-SP', scores: { 'Versionamento': 39, 'IA': 39, 'Mobile': 0, 'Back-End': 0, 'Front-End': 42, 'Banco de Dados': 0, 'Projetos': 42 } }
  ];

  // Totais de atividades de cada disciplina na Turma 3A oficial
  const subjectTotals = {
    'Versionamento': 54,
    'IA': 49,
    'Mobile': 56,
    'Back-End': 49,
    'Front-End': 49,
    'Banco de Dados': 55,
    'Projetos': 49
  };

  appState.processedFiles = [];
  appState.studentsData = [];

  // Gera arquivos sintéticos para cada disciplina
  Object.keys(subjectTotals).forEach(subjName => {
    const totalActs = subjectTotals[subjName];
    const headers = ['Nome_Aluno', 'RA'];

    for (let a = 1; a <= totalActs; a++) {
      headers.push(a % 2 === 0 ? `Registro - Aula ${a}` : `Pause e Responda - Aula ${a}`);
    }

    const dataRows = [];
    const studentsList = [];

    officialRoster.forEach((rosterStudent, idx) => {
      const completedTarget = rosterStudent.scores[subjName] || 0;
      const row = {
        'Nome_Aluno': rosterStudent.name,
        'RA': rosterStudent.ra
      };

      const activitiesDetail = [];

      for (let a = 1; a <= totalActs; a++) {
        const colName = headers[1 + a];
        const isDone = a <= completedTarget;
        row[colName] = isDone ? 'Concluído' : 'Não concluído';

        activitiesDetail.push({
          activityName: colName,
          status: isDone ? 'Concluído' : 'Não concluído',
          isCompleted: isDone,
          isCountedInGrade: true
        });
      }

      dataRows.push(row);

      const pct = Math.round((completedTarget / totalActs) * 100);
      const grade = (completedTarget / totalActs) * 10;

      studentsList.push({
        id: `${subjName}_${rosterStudent.ra}_${idx}`,
        name: rosterStudent.name,
        ra: rosterStudent.ra,
        subject: subjName,
        fileName: `${subjName}_3A.csv`,
        completedActivities: completedTarget,
        totalActivities: totalActs,
        percentage: pct,
        grade: Math.round(grade * 10) / 10,
        activities: activitiesDetail
      });
    });

    const fileObj = {
      fileName: `${subjName}_3A.csv`,
      subjectName: subjName,
      headers,
      rawRows: dataRows,
      nameColumn: 'Nome_Aluno',
      raColumn: 'RA',
      totalActivities: totalActs,
      studentCount: studentsList.length,
      students: studentsList
    };

    appState.processedFiles.push(fileObj);
    appState.studentsData.push(...studentsList);
  });

  buildOfficialMatrix();
  renderMatrixReport();
  renderPerformanceChart();
  updateColumnsAlertBanner();
  updateSubjectFilterOptions();
  updateDashboardAndTable();
  renderUploadedFilesChips();
  updateAppViewState(true);

  showToast('Exemplo oficial da Turma 3A carregado com sucesso!', 'success');
}
