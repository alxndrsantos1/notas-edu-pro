import { appState } from './state.js';
import { cleanString, normalizeString } from './utils.js';

// ==============================================================================
// 2. REGRAS DE NEGÓCIO E CLASSIFICAÇÃO DE COLUNAS
// ==============================================================================

export function extractSubjectFromFileName(fileName) {
  if (!fileName) return 'Geral';
  let baseName = fileName.replace(/\.[^/.]+$/, '');
  baseName = baseName.replace(/[_-]+/g, ' ');
  baseName = baseName.replace(/([a-zA-Z])([0-9]+[a-zA-Z]?)/g, '$1 $2');
  return baseName.trim();
}

export function isIgnoredNonEvaluativeColumn(header) {
  if (!header) return true;
  const norm = normalizeString(header);
  if (!norm) return true;
  return (
    norm.includes('material de aula') ||
    norm.includes('material da aula') ||
    norm.includes('material de apoio') ||
    norm.includes('material didatico') ||
    norm.includes('material') ||
    norm.includes('roteiro de atividade pratica') ||
    norm.includes('roteiro de atividade') ||
    norm.includes('roteiro') ||
    norm.includes('endereco de e-mail') ||
    norm.includes('e-mail') ||
    norm.includes('email')
  );
}

export function isEvaluativeColumn(header, mode = appState.activityMode) {
  if (!header) return false;
  const norm = normalizeString(header);
  if (!norm) return false;

  // Desconsiderar explicitamente colunas ignoradas (Material, Roteiro, Dados Cadastrais)
  if (isIgnoredNonEvaluativeColumn(header)) {
    return false;
  }

  // Não confundir colunas cadastrais de aluno com atividade de registro
  if (
    norm.includes('registro do aluno') ||
    norm.includes('registro de aluno') ||
    norm.includes('registro escolar') ||
    norm.includes('registro academico') ||
    norm.includes('registro sed')
  ) {
    return false;
  }

  // REQUISITO ESTRITO: O sistema deve considerar APENAS colunas que contenham:
  // 1. "Pause e Responda"
  // 2. "Registro de Aula" ou "Registro da Aula"
  const isPause = norm.includes('pause e responda') || norm.includes('pause');
  const isRegistroAula = norm.includes('registro da aula') || norm.includes('registro de aula') || (norm.includes('registro') && norm.includes('aula'));

  if (!isPause && !isRegistroAula) {
    return false;
  }

  if (mode === 'pause') {
    return isPause;
  }
  
  if (mode === 'registro') {
    return isRegistroAula;
  }

  return isPause || isRegistroAula;
}

/**
 * Extrai o número da semana letiva a partir do nome da atividade/coluna.
 * Exemplos aceitos: "Pause e Responda (S16A1a)" -> 16, "(S18)" -> 18, "Semana 18" -> 18, "Sem 15" -> 15.
 */
export function extractWeekFromActivityName(header) {
  if (!header) return null;
  const h = header.toString();
  
  // Padrão 1: (S16A1a), (S16), S16A1
  const m1 = h.match(/\(S(\d{1,2})[A-Za-z0-9]*\)/i) || h.match(/\bS(\d{1,2})A\d+/i);
  if (m1) return parseInt(m1[1], 10);

  // Padrão 2: Semana 16, Sem 16
  const m2 = h.match(/Semana\s*(\d{1,2})/i) || h.match(/Sem\s*(\d{1,2})/i);
  if (m2) return parseInt(m2[1], 10);

  // Padrão 3: S16 isolado
  const m3 = h.match(/\bS(\d{1,2})\b/i);
  if (m3) return parseInt(m3[1], 10);

  return null;
}

/**
 * Verifica se a coluna está dentro do recorte temporal de semanas selecionado pelo usuário.
 */
export function isColumnIncludedInWeekFilter(header) {
  const wk = extractWeekFromActivityName(header);
  if (wk === null) return true; // Atividades sem numeração de semana são incluídas por padrão

  const { mode, upToWeek, selectedWeeks } = appState.weekFilter;
  if (mode === 'all') {
    return true;
  }
  if (mode === 'upTo' && upToWeek !== null) {
    return wk <= upToWeek;
  }
  if (mode === 'custom' && selectedWeeks && selectedWeeks.length > 0) {
    return selectedWeeks.includes(wk);
  }
  return true;
}

export function findStudentNameColumn(headers, sampleRows = []) {
  if (!headers || headers.length === 0) return 'Nome';

  // 1. Prioridade absoluta por inspeção do conteúdo das linhas de exemplo (se contém nomes completos de pessoas)
  if (sampleRows && sampleRows.length > 0) {
    for (const h of headers) {
      if (isEvaluativeColumn(h, 'both')) continue;
      if (isIgnoredNonEvaluativeColumn(h)) continue;
      
      const normH = normalizeString(h);
      // Evita colunas explicitamente de RA, email, data, código
      if (
        normH.includes('email') || 
        normH.includes('data') || 
        normH.includes('hora') || 
        normH.includes('codigo') || 
        normH.includes('id') || 
        normH.includes('ra')
      ) {
        continue;
      }

      const values = sampleRows.map(r => cleanString(r[h])).filter(Boolean);
      // Nomes de alunos têm espaço, mais de 5 caracteres e NÃO começam com números (ex: "Daniellen Alves da Cruz")
      const allTextNames = values.length > 0 && values.every(v => 
        v.includes(' ') && 
        v.length >= 5 && 
        !/^[0-9]/.test(v) && 
        !v.includes('@')
      );
      if (allTextNames) {
        return h;
      }
    }
  }

  // 2. Termos diretos do cabeçalho que indicam nome
  const directTerms = [
    'nome_aluno', 'nome do aluno', 'nome aluno', 'nome completo', 'aluno', 
    'estudante', 'nome do estudante', 'nome', 'student', 'discente', 'usuario'
  ];

  for (const term of directTerms) {
    const found = headers.find(h => {
      const norm = normalizeString(h);
      return (norm === term || norm.startsWith(term + ' ') || norm.replace(/\s+/g, '_') === term) && !isIgnoredNonEvaluativeColumn(h);
    });
    if (found) return found;
  }

  // 3. Fallback inteligente: procura coluna que tem nomes nas primeiras linhas
  if (sampleRows && sampleRows.length > 0) {
    for (const h of headers) {
      if (isEvaluativeColumn(h, 'both')) continue;
      const values = sampleRows.map(r => cleanString(r[h])).filter(Boolean);
      const hasFullNames = values.some(v => v.includes(' ') && !/^[0-9]/.test(v) && !v.includes('@'));
      if (hasFullNames) return h;
    }
  }

  // 4. Primeira coluna não avaliativa
  const firstNonEval = headers.find(h => !isEvaluativeColumn(h, 'both') && !isIgnoredNonEvaluativeColumn(h));
  return firstNonEval || headers[0];
}

export function findStudentRAColumn(headers, sampleRows = []) {
  if (!headers || headers.length === 0) return 'RA';

  // 1. Termos diretos de RA / SED / Matrícula
  const raTerms = [
    'codigo sed', 'código sed', 'codigo usuario sed', 'codigo do usuario', 
    'identificacao de usuario', 'identificacao do usuario', 'identificacao',
    'id sed', 'id do aluno', 'id externo', 'sed', 'ra', 'registro do aluno', 
    'ra do aluno', 'matricula', 'matrícula', 'rm', 'cpf'
  ];

  for (const term of raTerms) {
    const found = headers.find(h => {
      const norm = normalizeString(h);
      return norm === term || norm.includes(term);
    });
    if (found) return found;
  }

  // 2. Inspeção de conteúdo: coluna que contenha padrões de RA (ex: "00001230916957sp" ou números com 8+ dígitos)
  if (sampleRows && sampleRows.length > 0) {
    for (const h of headers) {
      if (isEvaluativeColumn(h, 'both')) continue;
      const values = sampleRows.map(r => cleanString(r[h])).filter(Boolean);
      const isRaFormat = values.some(v => /^[0-9]{8,}/.test(v) || /sp$/i.test(v));
      if (isRaFormat) return h;
    }
  }

  const nonEval = headers.filter(h => !isEvaluativeColumn(h, 'both') && !isIgnoredNonEvaluativeColumn(h));
  return nonEval.length > 1 ? nonEval[1] : (nonEval[0] || headers[1] || headers[0]);
}

export function isActivityCompleted(cellValue) {
  if (cellValue === undefined || cellValue === null) return false;
  const rawStr = cleanString(cellValue);
  if (!rawStr) return false;

  // Se for data/hora de conclusão do Moodle (ex: "2026-08-12 12:11:44"), NÃO é o valor da atividade
  if (/^\d{4}-\d{2}-\d{2}/.test(rawStr)) {
    return false;
  }

  const val = normalizeString(rawStr);
  if (!val) return false;

  // Se for explicitamente "Não concluído"
  if (val.includes('nao concluido') || val.includes('nao concluida') || val === 'pendente') {
    return false;
  }

  // Palavras de conclusão comuns
  if (
    val === 'concluido' ||
    val === 'concluida' ||
    val === 'feito' ||
    val === 'feita' ||
    val === 'realizado' ||
    val === 'realizada' ||
    val === 'entregue' ||
    val === 'finalizado' ||
    val === 'finalizada' ||
    val === 'sim' ||
    val === 's' ||
    val === 'completed' ||
    val === 'ok' ||
    val === 'x' ||
    val === '1' ||
    val === '100%' ||
    val === '100' ||
    val === 'c'
  ) {
    return true;
  }

  return false;
}
