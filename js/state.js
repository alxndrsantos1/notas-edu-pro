// Estado Global da Aplicação
export const appState = {
  // Lista de arquivos processados com dados brutos
  processedFiles: [], 
  // Alunos consolidados individualmente
  studentsData: [], 
  // Matriz consolidada de alunos x disciplinas (Padrão Oficial)
  matrixData: {
    turmaName: '',
    subjects: [], // Lista de nomes de matérias
    students: [], // Lista de objetos de alunos com notas por matéria
    averageActivities: 0
  },
  // Modalidade de cálculo ativa: 'both' | 'pause' | 'registro'
  activityMode: 'both',
  // Aba de visualização ativa: 'matrixView' | 'chartView' | 'conselhoView' | 'weeksView' | 'listView'
  activeTab: 'matrixView',
  // Média de corte mínima para aprovação (padrão 5.0)
  passingGradeCutoff: 5.0,
  // Filtro na matriz para exibir somente alunos em risco
  filterOnlyRisk: false,
  // Estado do simulador do Conselho de Classe
  simulatorState: {
    studentId: '',
    subjectName: '',
    extraActivities: 0
  },
  // Estilo de gráfico selecionado: 'horizontal' | 'distribution' | 'subjects' | 'columns'
  chartType: 'horizontal',
  // Ordenação do gráfico: 'desc' | 'asc' | 'alpha'
  chartSort: 'desc',
  // Filtros ativos
  filters: {
    searchQuery: '',
    selectedSubject: 'all',
    gradeStatus: 'all'
  },
  // Ordenação
  sort: {
    column: 'name',
    direction: 'asc'
  },
  selectedFileForMapping: null,
  selectedStudentForModal: null,
  // Recorte temporal de semanas letivas (Conteúdo cobrado até o momento)
  weekFilter: {
    mode: 'all', // 'all' | 'upTo' | 'custom'
    upToWeek: null, // número da semana máxima cobrada (ex: 18)
    selectedWeeks: [] // lista de semanas ativas (ex: [15, 16, 17, 18])
  },
  detectedWeeks: [], // Lista ordenada de semanas identificadas (ex: [15, 16, 17, 18, 19, 20])
  weeksFocus: null, // Semana em foco na aba de acompanhamento (ex: 18)
  weeksStatusFilter: 'all', // Filtro de status na visão semanal
  customTurmaName: '',
  customDisciplinaName: ''
};
