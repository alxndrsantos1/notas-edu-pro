import { recalculateAllGrades } from './grades.js';
import { appState } from './state.js';
import { updateAppViewState } from './tabs.js';
import { showToast } from './utils.js';

// ==============================================================================
// 12. DADOS DE DEMONSTRAÇÃO (TURMA 3A FICTÍCIA)
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
 * Carrega uma Turma 3A fictícia com 7 disciplinas
 * (Versionamento, IA, Mobile, Back-End, Front-End, Banco de Dados, Projetos)
 * e 23 alunos com nomes inventados.
 */
export function loadOfficialStandardDemo() {
  // Alunos fictícios: nenhum nome corresponde a uma pessoa real
  const officialRoster = [
    { name: 'Alice Moreira Bastos', ra: '0001-SP', scores: { 'Versionamento': 0, 'IA': 37, 'Mobile': 0, 'Back-End': 0, 'Front-End': 0, 'Banco de Dados': 0, 'Projetos': 0 } },
    { name: 'Bernardo Teles Figueira', ra: '0002-SP', scores: { 'Versionamento': 54, 'IA': 49, 'Mobile': 56, 'Back-End': 49, 'Front-End': 49, 'Banco de Dados': 55, 'Projetos': 49 } },
    { name: 'Camila Prado Nogueira', ra: '0003-SP', scores: { 'Versionamento': 54, 'IA': 49, 'Mobile': 56, 'Back-End': 49, 'Front-End': 49, 'Banco de Dados': 55, 'Projetos': 49 } },
    { name: 'Daniel Farias Cordeiro', ra: '0004-SP', scores: { 'Versionamento': 0, 'IA': 8, 'Mobile': 4, 'Back-End': 1, 'Front-End': 0, 'Banco de Dados': 6, 'Projetos': 0 } },
    { name: 'Eduarda Lins Pacheco', ra: '0005-SP', scores: { 'Versionamento': 51, 'IA': 43, 'Mobile': 51, 'Back-End': 43, 'Front-End': 42, 'Banco de Dados': 49, 'Projetos': 47 } },
    { name: 'Fabio Queiroz Antunes', ra: '0006-SP', scores: { 'Versionamento': 33, 'IA': 18, 'Mobile': 18, 'Back-End': 42, 'Front-End': 42, 'Banco de Dados': 48, 'Projetos': 0 } },
    { name: 'Giovana Sales Barreto', ra: '0007-SP', scores: { 'Versionamento': 0, 'IA': 0, 'Mobile': 15, 'Back-End': 0, 'Front-End': 1, 'Banco de Dados': 14, 'Projetos': 0 } },
    { name: 'Heitor Viana Rangel', ra: '0008-SP', scores: { 'Versionamento': 0, 'IA': 15, 'Mobile': 32, 'Back-End': 0, 'Front-End': 0, 'Banco de Dados': 3, 'Projetos': 0 } },
    { name: 'Ingrid Mota Carvalhal', ra: '0009-SP', scores: { 'Versionamento': 50, 'IA': 49, 'Mobile': 54, 'Back-End': 43, 'Front-End': 42, 'Banco de Dados': 55, 'Projetos': 44 } },
    { name: 'Julio Seixas Brandao', ra: '0010-SP', scores: { 'Versionamento': 0, 'IA': 23, 'Mobile': 40, 'Back-End': 0, 'Front-End': 0, 'Banco de Dados': 0, 'Projetos': 2 } },
    { name: 'Karina Duarte Valadares', ra: '0011-SP', scores: { 'Versionamento': 54, 'IA': 16, 'Mobile': 56, 'Back-End': 49, 'Front-End': 49, 'Banco de Dados': 55, 'Projetos': 49 } },
    { name: 'Leonardo Paiva Guedes', ra: '0012-SP', scores: { 'Versionamento': 0, 'IA': 24, 'Mobile': 0, 'Back-End': 1, 'Front-End': 0, 'Banco de Dados': 14, 'Projetos': 0 } },
    { name: 'Marina Coelho Sardinha', ra: '0013-SP', scores: { 'Versionamento': 36, 'IA': 36, 'Mobile': 49, 'Back-End': 42, 'Front-End': 42, 'Banco de Dados': 48, 'Projetos': 42 } },
    { name: 'Nathan Rezende Falcao', ra: '0014-SP', scores: { 'Versionamento': 9, 'IA': 16, 'Mobile': 4, 'Back-End': 0, 'Front-End': 2, 'Banco de Dados': 20, 'Projetos': 0 } },
    { name: 'Olivia Brito Camargo', ra: '0015-SP', scores: { 'Versionamento': 0, 'IA': 8, 'Mobile': 0, 'Back-End': 1, 'Front-End': 0, 'Banco de Dados': 1, 'Projetos': 0 } },
    { name: 'Paulo Esteves Macedo', ra: '0016-SP', scores: { 'Versionamento': 37, 'IA': 36, 'Mobile': 49, 'Back-End': 0, 'Front-End': 42, 'Banco de Dados': 48, 'Projetos': 42 } },
    { name: 'Rafaela Cunha Teodoro', ra: '0017-SP', scores: { 'Versionamento': 0, 'IA': 22, 'Mobile': 36, 'Back-End': 12, 'Front-End': 24, 'Banco de Dados': 31, 'Projetos': 0 } },
    { name: 'Samuel Abreu Pimentel', ra: '0018-SP', scores: { 'Versionamento': 54, 'IA': 49, 'Mobile': 56, 'Back-End': 49, 'Front-End': 49, 'Banco de Dados': 55, 'Projetos': 49 } },
    { name: 'Tatiane Lobo Vasques', ra: '0019-SP', scores: { 'Versionamento': 40, 'IA': 18, 'Mobile': 1, 'Back-End': 1, 'Front-End': 0, 'Banco de Dados': 0, 'Projetos': 0 } },
    { name: 'Ulisses Matos Fontoura', ra: '0020-SP', scores: { 'Versionamento': 12, 'IA': 31, 'Mobile': 26, 'Back-End': 41, 'Front-End': 0, 'Banco de Dados': 48, 'Projetos': 0 } },
    { name: 'Valentina Rocha Siqueira', ra: '0021-SP', scores: { 'Versionamento': 48, 'IA': 22, 'Mobile': 33, 'Back-End': 24, 'Front-End': 24, 'Banco de Dados': 20, 'Projetos': 12 } },
    { name: 'Wagner Peixoto Amaral', ra: '0022-SP', scores: { 'Versionamento': 19, 'IA': 24, 'Mobile': 21, 'Back-End': 18, 'Front-End': 18, 'Banco de Dados': 20, 'Projetos': 24 } },
    { name: 'Yasmin Borges Trindade', ra: '0023-SP', scores: { 'Versionamento': 39, 'IA': 39, 'Mobile': 0, 'Back-End': 0, 'Front-End': 42, 'Banco de Dados': 0, 'Projetos': 42 } }
  ];

  // Totais de atividades de cada disciplina
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

  // Gera arquivos sintéticos para cada disciplina, no mesmo formato de um CSV carregado
  Object.keys(subjectTotals).forEach(subjName => {
    const totalActs = subjectTotals[subjName];
    const headers = ['Nome_Aluno', 'RA'];

    for (let a = 1; a <= totalActs; a++) {
      headers.push(a % 2 === 0 ? `Registro - Aula ${a}` : `Pause e Responda - Aula ${a}`);
    }

    const rawRows = officialRoster.map(rosterStudent => {
      const completedTarget = rosterStudent.scores[subjName] || 0;
      const row = { 'Nome_Aluno': rosterStudent.name, 'RA': rosterStudent.ra };
      for (let a = 1; a <= totalActs; a++) {
        row[headers[1 + a]] = a <= completedTarget ? 'Concluído' : 'Não concluído';
      }
      return row;
    });

    appState.processedFiles.push({
      fileName: `${subjName}_3A.csv`,
      fixedSubjectName: subjName,
      headers,
      rawRows,
      nameColumn: 'Nome_Aluno',
      raColumn: 'RA'
    });
  });

  // Mesmo caminho de cálculo dos arquivos reais (notas, matriz, semanas e demais abas)
  recalculateAllGrades();
  updateAppViewState(true);

  showToast('Exemplo da Turma 3A carregado com sucesso!', 'success');
}
