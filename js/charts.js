import { appState } from './state.js';
import { escapeHtml } from './utils.js';

// Helper para calcular a nota média do aluno entre as disciplinas
export function getStudentAvgGrade(st, subjects) {
  if (!st || !subjects || subjects.length === 0) return 0;
  let sum = 0;
  let count = 0;
  subjects.forEach(sub => {
    const sc = st.subjectScores ? st.subjectScores[sub.name] : null;
    if (sc) {
      let g = sc.grade !== undefined ? sc.grade : (sc.total > 0 ? (sc.completed / sc.total) * 10 : 0);
      sum += g;
      count++;
    }
  });
  const avg = count > 0 ? sum / count : (st.totalActivities > 0 ? (st.completedActivities / st.totalActivities) * 10 : 0);
  return Math.min(10, Math.max(0, Math.round(avg * 10) / 10));
}

// Helper para definir cor e rótulo de desempenho pedagógico
export function getPerformanceTier(grade) {
  if (grade >= 8.0) {
    return { 
      name: 'Alto Desempenho', 
      color: '#10b981', 
      dark: '#059669', 
      lightBg: '#dcfce7',
      range: '≥ 8,0',
      icon: '🌟'
    };
  }
  if (grade >= 6.0) {
    return { 
      name: 'Adequado (Aprovado)', 
      color: '#6366f1', 
      dark: '#4338ca', 
      lightBg: '#e0e7ff',
      range: '6,0 a 7,9',
      icon: '🟢'
    };
  }
  if (grade >= 4.0) {
    return { 
      name: 'Atenção / Recuperação', 
      color: '#f59e0b', 
      dark: '#b45309', 
      lightBg: '#fef3c7',
      range: '4,0 a 5,9',
      icon: '🟡'
    };
  }
  return { 
    name: 'Crítico / Baixo', 
    color: '#ef4444', 
    dark: '#b91c1c', 
    lightBg: '#fee2e2',
    range: '< 4,0',
    icon: '🔴'
  };
}

// Ordena alunos conforme o modo selecionado
export function getSortedStudentsForChart(students, subjects, sortMode) {
  const list = [...students];
  if (sortMode === 'desc') {
    return list.sort((a, b) => b.totalCompleted - a.totalCompleted || a.name.localeCompare(b.name));
  }
  if (sortMode === 'asc') {
    return list.sort((a, b) => a.totalCompleted - b.totalCompleted || a.name.localeCompare(b.name));
  }
  if (sortMode === 'alpha') {
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return list;
}

/**
 * Ponto de entrada do Gráfico de Desempenho (Renderiza o modelo ativo escolhido pelo usuário).
 */
export function renderPerformanceChart() {
  const container = document.getElementById('chartSvgWrapper');
  const avgBadge = document.getElementById('chartAverageBadge');
  const titleEl = document.getElementById('chartMainTitle');
  if (!container) return;

  const { students, subjects, averageActivities } = appState.matrixData;

  if (avgBadge) {
    avgBadge.textContent = students.length > 0 ? `Média da Turma: ${averageActivities.toFixed(1)} ativ.` : 'Média da Turma: -';
  }

  if (students.length === 0) {
    container.innerHTML = `
      <div style="padding: 60px 20px; text-align: center; color: #64748b;">
        <div style="font-size: 2.2rem; margin-bottom: 8px;">📊</div>
        <strong style="color: #334155; font-size: 1.1rem;">Nenhum dado para exibir no painel gráfico</strong><br>
        <span style="font-size: 0.88rem; color: #64748b;">Faça upload de arquivos CSV acima ou clique em "Carregar Dados de Exemplo" para visualizar os gráficos.</span>
      </div>
    `;
    return;
  }

  // Atualiza título dinâmico de acordo com o estilo
  const titles = {
    horizontal: 'Ranking Geral de Desempenho por Aluno',
    distribution: 'Distribuição por Faixas de Aproveitamento da Turma',
    subjects: 'Comparativo de Engajamento por Disciplina',
    columns: 'Colunas de Desempenho com Linha de Média'
  };
  if (titleEl) {
    titleEl.textContent = titles[appState.chartType] || 'Painel Gráfico de Desempenho Escolar';
  }

  // Roteia para o estilo de gráfico escolhido
  if (appState.chartType === 'horizontal') {
    renderHorizontalBarChart(students, subjects, averageActivities, container);
  } else if (appState.chartType === 'distribution') {
    renderDistributionChart(students, subjects, averageActivities, container);
  } else if (appState.chartType === 'subjects') {
    renderSubjectsComparisonChart(students, subjects, averageActivities, container);
  } else if (appState.chartType === 'columns') {
    renderModernColumnsChart(students, subjects, averageActivities, container);
  }
}

/**
 * ESTILO 1: RANKING HORIZONTAL (Recomendado - Fácil Leitura e Cores por Desempenho)
 */
export function renderHorizontalBarChart(students, subjects, averageActivities, container) {
  const sortedStudents = getSortedStudentsForChart(students, subjects, appState.chartSort);
  const rowHeight = 34;
  const marginTop = 50;
  const marginBottom = 40;
  const marginLeft = 230;
  const marginRight = 160;
  const svgWidth = 1000;
  const svgHeight = Math.max(480, marginTop + sortedStudents.length * rowHeight + marginBottom);
  const barAreaWidth = svgWidth - marginLeft - marginRight;

  const maxVal = Math.max(1, ...sortedStudents.map(s => s.totalCompleted));
  const maxScale = Math.ceil(maxVal / 10) * 10;

  let svg = `<svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="chart-svg" xmlns="http://www.w3.org/2000/svg">`;

  // Linhas de Grade Verticais (0%, 25%, 50%, 75%, 100%)
  const steps = [0, 0.25, 0.5, 0.75, 1];
  steps.forEach(frac => {
    const x = marginLeft + frac * barAreaWidth;
    const val = Math.round(frac * maxScale);
    svg += `
      <line x1="${x}" y1="${marginTop - 15}" x2="${x}" y2="${marginTop + sortedStudents.length * rowHeight}" stroke="#e2e8f0" stroke-width="0.8" stroke-dasharray="2,2" />
      <text x="${x}" y="${marginTop - 22}" font-size="10.5" fill="#94a3b8" text-anchor="middle" font-family="system-ui, sans-serif">${val}</text>
    `;
  });

  // Linha Vertical da Média da Turma
  const avgX = marginLeft + (averageActivities / maxScale) * barAreaWidth;
  svg += `
    <line x1="${avgX}" y1="${marginTop - 12}" x2="${avgX}" y2="${marginTop + sortedStudents.length * rowHeight + 10}" stroke="#dc2626" stroke-width="2" stroke-dasharray="5,4" />
    <rect x="${avgX - 48}" y="${marginTop - 40}" width="96" height="22" rx="4" fill="#dc2626" />
    <text x="${avgX}" y="${marginTop - 25}" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle" font-family="system-ui, sans-serif">Média: ${averageActivities.toFixed(1)}</text>
  `;

  // Renderiza as Barras dos Alunos
  sortedStudents.forEach((st, i) => {
    const y = marginTop + i * rowHeight;
    const avgGrade = getStudentAvgGrade(st, subjects);
    const tier = getPerformanceTier(avgGrade);
    const gradeStr = avgGrade.toFixed(1).replace('.', ',');
    const barW = Math.max(6, (st.totalCompleted / maxScale) * barAreaWidth);

    // Nome do aluno à esquerda
    svg += `
      <text 
        x="${marginLeft - 14}" 
        y="${y + 17}" 
        font-size="12" 
        font-weight="600" 
        fill="#1e293b" 
        text-anchor="end" 
        font-family="system-ui, sans-serif"
      >
        <tspan fill="#94a3b8" font-size="10.5" font-weight="normal">#${i + 1} </tspan>${escapeHtml(st.name)}
      </text>
    `;

    // Trilho de fundo
    svg += `
      <rect 
        x="${marginLeft}" 
        y="${y + 4}" 
        width="${barAreaWidth}" 
        height="18" 
        rx="4" 
        fill="#f1f5f9" 
      />
    `;

    // Barra colorida do progresso
    svg += `
      <rect 
        x="${marginLeft}" 
        y="${y + 4}" 
        width="${barW}" 
        height="18" 
        rx="4" 
        fill="${tier.color}" 
      >
        <title>${escapeHtml(st.name)}: ${st.totalCompleted} atividades • Nota Média: ${gradeStr} (${tier.name})</title>
      </rect>
    `;

    // Rótulo de quantidade e nota à direita
    svg += `
      <text 
        x="${marginLeft + barAreaWidth + 12}" 
        y="${y + 17}" 
        font-size="11.5" 
        font-weight="700" 
        fill="#0f172a" 
        font-family="system-ui, sans-serif"
      >
        ${st.totalCompleted} <tspan font-weight="normal" fill="#64748b" font-size="10.5">ativ. (${gradeStr})</tspan>
      </text>
    `;
  });

  svg += `</svg>`;
  container.innerHTML = svg;
}

/**
 * ESTILO 2: DISTRIBUIÇÃO PEDAGÓGICA (Conselho de Classe: Donut + Cards das Faixas)
 */
export function renderDistributionChart(students, subjects, averageActivities, container) {
  const cutoff = appState.passingGradeCutoff !== undefined ? appState.passingGradeCutoff : 5.0;
  const cutoffStr = cutoff.toFixed(1).replace('.', ',');

  const groups = {
    excelencia: { title: 'Destaque / Excelência', range: '≥ 8,0', color: '#10b981', dark: '#059669', lightBg: '#dcfce7', icon: '🌟', students: [] },
    adequado: { title: 'Adequado / Aprovados', range: `${cutoffStr} a 7,9`, color: '#6366f1', dark: '#4338ca', lightBg: '#e0e7ff', icon: '🟢', students: [] },
    atencao: { title: 'Atenção / Recuperação', range: `${(cutoff - 1.0 > 0 ? (cutoff - 1.0).toFixed(1).replace('.', ',') : '0,0')} a ${(cutoff - 0.1).toFixed(1).replace('.', ',')}`, color: '#f59e0b', dark: '#b45309', lightBg: '#fef3c7', icon: '🟡', students: [] },
    critico: { title: 'Crítico / Defasagem', range: `< ${(cutoff - 1.0 > 0 ? (cutoff - 1.0).toFixed(1).replace('.', ',') : cutoffStr)}`, color: '#ef4444', dark: '#b91c1c', lightBg: '#fee2e2', icon: '🔴', students: [] }
  };

  const attentionThreshold = Math.max(0, cutoff - 1.0);

  students.forEach(st => {
    const grade = getStudentAvgGrade(st, subjects);
    if (grade >= 8.0) groups.excelencia.students.push({ ...st, grade });
    else if (grade >= cutoff) groups.adequado.students.push({ ...st, grade });
    else if (grade >= attentionThreshold) groups.atencao.students.push({ ...st, grade });
    else groups.critico.students.push({ ...st, grade });
  });

  const total = students.length;
  const approvedTotal = groups.excelencia.students.length + groups.adequado.students.length;
  const approvedPct = total > 0 ? Math.round((approvedTotal / total) * 100) : 0;

  const svgWidth = 1000;
  const svgHeight = 520;

  let svg = `<svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="chart-svg" xmlns="http://www.w3.org/2000/svg">`;

  // ==========================================
  // GRÁFICO DE ROSCA (DONUT) NO LADO ESQUERDO
  // ==========================================
  const cx = 195;
  const cy = 260;
  const rOuter = 135;
  const rInner = 82;

  let currentAngle = -Math.PI / 2;
  const groupKeys = ['excelencia', 'adequado', 'atencao', 'critico'];

  groupKeys.forEach(key => {
    const grp = groups[key];
    const count = grp.students.length;
    if (count === 0) return;

    const sliceAngle = (count / total) * (Math.PI * 2);
    const endAngle = currentAngle + sliceAngle;

    const x1 = cx + rOuter * Math.cos(currentAngle);
    const y1 = cy + rOuter * Math.sin(currentAngle);
    const x2 = cx + rOuter * Math.cos(endAngle);
    const y2 = cy + rOuter * Math.sin(endAngle);
    const x3 = cx + rInner * Math.cos(endAngle);
    const y3 = cy + rInner * Math.sin(endAngle);
    const x4 = cx + rInner * Math.cos(currentAngle);
    const y4 = cy + rInner * Math.sin(currentAngle);

    const largeArc = sliceAngle > Math.PI ? 1 : 0;
    const pathData = `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4} Z`;

    svg += `<path d="${pathData}" fill="${grp.color}" stroke="#ffffff" stroke-width="2.5"><title>${grp.title}: ${count} alunos (${Math.round((count / total) * 100)}%)</title></path>`;
    currentAngle = endAngle;
  });

  // Centro da Rosca com Totais
  svg += `
    <circle cx="${cx}" cy="${cy}" r="${rInner - 2}" fill="#ffffff" />
    <text x="${cx}" y="${cy - 10}" font-size="22" font-weight="800" fill="#0f172a" text-anchor="middle" font-family="system-ui, sans-serif">${total} Alunos</text>
    <text x="${cx}" y="${cy + 12}" font-size="11.5" font-weight="600" fill="#64748b" text-anchor="middle" font-family="system-ui, sans-serif">100% Avaliados</text>
    <text x="${cx}" y="${cy + 30}" font-size="11.5" font-weight="700" fill="#059669" text-anchor="middle" font-family="system-ui, sans-serif">${approvedPct}% Aprovados</text>
  `;

  // ==========================================
  // CARDS DETALHADOS DAS FAIXAS NO LADO DIREITO
  // ==========================================
  const startX = 405;
  const cardW = 560;
  const cardH = 104;

  groupKeys.forEach((key, idx) => {
    const grp = groups[key];
    const count = grp.students.length;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const cardY = 32 + idx * (cardH + 12);

    // Fundo do card
    svg += `
      <rect x="${startX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.2" />
      <rect x="${startX}" y="${cardY}" width="7" height="${cardH}" rx="3" fill="${grp.color}" />
    `;

    // Título e Faixa
    svg += `
      <text x="${startX + 22}" y="${cardY + 26}" font-size="14" font-weight="700" fill="#0f172a" font-family="system-ui, sans-serif">
        ${grp.icon} ${grp.title} <tspan font-weight="normal" fill="#64748b" font-size="12">(Nota ${grp.range})</tspan>
      </text>
    `;

    // Badge com contagem
    svg += `
      <rect x="${startX + cardW - 145}" y="${cardY + 12}" width="130" height="24" rx="12" fill="${grp.lightBg}" />
      <text x="${startX + cardW - 80}" y="${cardY + 28}" font-size="11.5" font-weight="bold" fill="${grp.dark}" text-anchor="middle" font-family="system-ui, sans-serif">${count} aluno${count !== 1 ? 's' : ''} (${pct}%)</text>
    `;

    // Barra de proporção dentro do card
    svg += `
      <rect x="${startX + 22}" y="${cardY + 44}" width="${cardW - 44}" height="7" rx="3.5" fill="#e2e8f0" />
      <rect x="${startX + 22}" y="${cardY + 44}" width="${Math.max(4, (count / total) * (cardW - 44))}" height="7" rx="3.5" fill="${grp.color}" />
    `;

    // Nomes dos alunos da faixa (com corte elegante se exceder)
    let studentNamesText = grp.students.map(s => s.name.split(' ')[0] + ' ' + (s.name.split(' ')[1] || '')).join(', ');
    if (studentNamesText.length > 70) {
      studentNamesText = studentNamesText.substring(0, 68) + '...';
    }
    if (!studentNamesText) studentNamesText = 'Nenhum aluno nesta faixa de nota.';

    svg += `
      <text x="${startX + 22}" y="${cardY + 76}" font-size="11.5" fill="#475569" font-family="system-ui, sans-serif">
        <tspan font-weight="600" fill="#334155">Estudantes: </tspan>${escapeHtml(studentNamesText)}
      </text>
    `;
  });

  svg += `</svg>`;
  container.innerHTML = svg;
}

/**
 * ESTILO 3: COMPARATIVO POR DISCIPLINA (Engajamento e Entregas por Matéria)
 */
export function renderSubjectsComparisonChart(students, subjects, averageActivities, container) {
  if (subjects.length === 0) {
    container.innerHTML = '<div style="padding: 40px; text-align: center; color: #64748b;">Nenhuma disciplina identificada para comparação.</div>';
    return;
  }

  const svgWidth = 1000;
  const cardH = 68;
  const marginTop = 50;
  const marginBottom = 40;
  const svgHeight = Math.max(460, marginTop + subjects.length * cardH + marginBottom);

  const colors = ['#6366f1', '#10b981', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899', '#6366f1'];

  let svg = `<svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="chart-svg" xmlns="http://www.w3.org/2000/svg">`;

  // Cabeçalho da seção
  svg += `
    <text x="50" y="${marginTop - 20}" font-size="12" font-weight="700" fill="#64748b" font-family="system-ui, sans-serif">DISCIPLINA</text>
    <text x="360" y="${marginTop - 20}" font-size="12" font-weight="700" fill="#64748b" font-family="system-ui, sans-serif">TAXA DE CONCLUSÃO DA TURMA</text>
    <text x="760" y="${marginTop - 20}" font-size="12" font-weight="700" fill="#64748b" font-family="system-ui, sans-serif">MÉDIA DE ATIVIDADES</text>
    <text x="910" y="${marginTop - 20}" font-size="12" font-weight="700" fill="#64748b" font-family="system-ui, sans-serif">NOTA</text>
  `;

  subjects.forEach((sub, i) => {
    const y = marginTop + i * cardH;
    const color = colors[i % colors.length];

    // Calcula métricas da disciplina
    let sumCompleted = 0;
    let sumGrade = 0;
    students.forEach(st => {
      const sc = st.subjectScores ? st.subjectScores[sub.name] : null;
      if (sc) {
        sumCompleted += sc.completed || 0;
        let g = sc.grade !== undefined ? sc.grade : (sc.total > 0 ? (sc.completed / sc.total) * 10 : 0);
        sumGrade += g;
      }
    });

    const avgCompleted = students.length > 0 ? sumCompleted / students.length : 0;
    const avgGrade = students.length > 0 ? sumGrade / students.length : 0;
    const deliveryRate = sub.totalActivities > 0 ? Math.round((avgCompleted / sub.totalActivities) * 100) : 0;

    // Fundo do card
    svg += `
      <rect x="40" y="${y}" width="920" height="54" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.2" />
      <rect x="40" y="${y}" width="6" height="54" rx="3" fill="${color}" />
    `;

    // Nome da matéria e total avaliado
    svg += `
      <text x="60" y="${y + 24}" font-size="13.5" font-weight="700" fill="#0f172a" font-family="system-ui, sans-serif">${escapeHtml(sub.name)}</text>
      <text x="60" y="${y + 42}" font-size="11" fill="#64748b" font-family="system-ui, sans-serif">${sub.totalActivities} atividades avaliadas</text>
    `;

    // Barra de progresso da disciplina
    const barAreaW = 340;
    const barW = Math.max(8, (deliveryRate / 100) * barAreaW);
    svg += `
      <rect x="360" y="${y + 18}" width="${barAreaW}" height="14" rx="4" fill="#e2e8f0" />
      <rect x="360" y="${y + 18}" width="${barW}" height="14" rx="4" fill="${color}" />
      <text x="360 + ${barAreaW} + 12" x="${360 + barAreaW + 12}" y="${y + 30}" font-size="12" font-weight="bold" fill="#0f172a" font-family="system-ui, sans-serif">${deliveryRate}%</text>
    `;

    // Média de Atividades
    svg += `
      <text x="760" y="${y + 32}" font-size="13.5" font-weight="700" fill="#1e293b" font-family="system-ui, sans-serif">${avgCompleted.toFixed(1)} <tspan font-size="11" font-weight="normal" fill="#64748b">/ ${sub.totalActivities}</tspan></text>
    `;

    // Nota Média
    const gradeColor = avgGrade >= 6.0 ? '#059669' : '#dc2626';
    svg += `
      <text x="910" y="${y + 32}" font-size="14" font-weight="800" fill="${gradeColor}" font-family="system-ui, sans-serif">${avgGrade.toFixed(1).replace('.', ',')}</text>
    `;
  });

  svg += `</svg>`;
  container.innerHTML = svg;
}

/**
 * ESTILO 4: COLUNAS MODERNIZADAS COM LINHA DE MÉDIA
 */
export function renderModernColumnsChart(students, subjects, averageActivities, container) {
  const sortedStudents = getSortedStudentsForChart(students, subjects, appState.chartSort);
  const svgWidth = Math.max(920, sortedStudents.length * 44);
  const svgHeight = 520;
  const marginLeft = 65;
  const marginRight = 75;
  const marginTop = 45;
  const marginBottom = 130;

  const chartWidth = svgWidth - marginLeft - marginRight;
  const chartHeight = svgHeight - marginTop - marginBottom;

  const maxVal = Math.max(1, ...sortedStudents.map(s => s.totalCompleted));
  const yCeil = Math.ceil(maxVal / 50) * 50 || 100;
  const getY = (val) => marginTop + chartHeight - (val / yCeil) * chartHeight;

  let svg = `<svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="chart-svg" xmlns="http://www.w3.org/2000/svg">`;

  // Linhas Horizontais do Eixo Y
  const step = yCeil <= 100 ? 25 : (yCeil <= 300 ? 50 : 100);
  for (let tick = 0; tick <= yCeil; tick += step) {
    const yPos = getY(tick);
    svg += `
      <line x1="${marginLeft}" y1="${yPos}" x2="${marginLeft + chartWidth}" y2="${yPos}" stroke="#e2e8f0" stroke-width="0.8" />
      <text x="${marginLeft - 10}" y="${yPos + 4}" font-size="11" fill="#64748b" text-anchor="end" font-family="system-ui, sans-serif">${tick}</text>
    `;
  }

  // Linha da Média da Turma
  const avgY = getY(averageActivities);
  svg += `
    <line x1="${marginLeft}" y1="${avgY}" x2="${marginLeft + chartWidth + 10}" y2="${avgY}" stroke="#ef4444" stroke-width="2.2" stroke-dasharray="6,4" />
    <rect x="${marginLeft + chartWidth + 6}" y="${avgY - 11}" width="82" height="22" rx="4" fill="#ef4444" />
    <text x="${marginLeft + chartWidth + 47}" y="${avgY + 4}" font-size="10.5" font-weight="bold" fill="#ffffff" text-anchor="middle" font-family="system-ui, sans-serif">Média: ${averageActivities.toFixed(1)}</text>
  `;

  // Renderização das Colunas Verticais
  const barStep = chartWidth / sortedStudents.length;
  const barWidth = Math.max(16, barStep - 8);

  sortedStudents.forEach((st, i) => {
    const barX = marginLeft + i * barStep + (barStep - barWidth) / 2;
    const barY = getY(st.totalCompleted);
    const bHeight = (marginTop + chartHeight) - barY;
    const isAboveAvg = st.totalCompleted >= averageActivities;
    const color = isAboveAvg ? '#6366f1' : '#f97316';
    const strokeColor = isAboveAvg ? '#4338ca' : '#c2410c';

    svg += `
      <rect 
        x="${barX}" 
        y="${barY}" 
        width="${barWidth}" 
        height="${bHeight}" 
        fill="${color}" 
        stroke="${strokeColor}" 
        stroke-width="1.2"
        rx="3"
      >
        <title>${escapeHtml(st.name)}: ${st.totalCompleted} atividades</title>
      </rect>
    `;

    // Valor acima da barra
    svg += `
      <text 
        x="${barX + barWidth / 2}" 
        y="${barY - 6}" 
        font-size="10.5" 
        font-weight="bold" 
        fill="#0f172a" 
        text-anchor="middle" 
        font-family="system-ui, sans-serif"
      >
        ${st.totalCompleted}
      </text>
    `;

    // Nome inclinado a 45 graus para facilitar leitura
    const labelX = barX + barWidth / 2;
    const labelY = marginTop + chartHeight + 14;

    svg += `
      <text 
        x="${labelX}" 
        y="${labelY}" 
        font-size="10" 
        font-weight="600" 
        fill="#334155" 
        text-anchor="end" 
        font-family="system-ui, sans-serif" 
        transform="rotate(-45 ${labelX} ${labelY})"
      >
        ${escapeHtml(st.name)}
      </text>
    `;
  });

  svg += `</svg>`;
  container.innerHTML = svg;
}

/**
 * Inicializa os controles do Painel de Gráficos (seleção de tipos e ordenação).
 */
export function initChartControls() {
  const buttons = document.querySelectorAll('.chart-type-btn');
  const sortSelect = document.getElementById('chartSortSelect');
  const sortContainer = document.getElementById('chartSortContainer');
  const legend = document.getElementById('chartSemanticLegend');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-chart-type');
      if (appState.chartType === type) return;

      appState.chartType = type;
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Controla a visibilidade dos controles auxiliares
      if (sortContainer) {
        sortContainer.style.display = (type === 'horizontal' || type === 'columns') ? 'flex' : 'none';
      }
      if (legend) {
        legend.style.display = (type === 'distribution' || type === 'subjects') ? 'none' : 'flex';
      }

      renderPerformanceChart();
    });
  });

  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      appState.chartSort = e.target.value;
      renderPerformanceChart();
    });
  }
}
