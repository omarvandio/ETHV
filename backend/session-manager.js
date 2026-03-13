const sessions = new Map();

const TESTS = {
  logica: {
    name: 'Lógica y Resolución de Problemas',
    passingScore: 70,
    questions: [
      { id: 'L1', text: '🧩 *Pregunta 1 de 2*\n\nSi hay 5 manzanas y tomas 3, ¿cuántas manzanas TIENES?\n\n(A) 2   (B) 3   (C) 5   (D) 8', correct: 'B', points: 50 },
      { id: 'L2', text: '🧩 *Pregunta 2 de 2*\n\nEl número que continúa: 2, 6, 12, 20, 30, ___\n\n(A) 40   (B) 42   (C) 44   (D) 36', correct: 'B', points: 50 },
    ],
  },
  digitacion: {
    name: 'Velocidad de Digitación',
    passingScore: 60,
    questions: [
      { id: 'D1', text: '⌨️ *Test de Digitación*\n\nCopia este texto exactamente:\n\n"La innovación distingue entre un líder y un seguidor."\n\nEnvía tu respuesta:', isTypingTest: true, referenceText: 'La innovación distingue entre un líder y un seguidor.', points: 100 },
    ],
  },
  python: {
    name: 'Python Fundamentals',
    passingScore: 75,
    questions: [
      { id: 'P1', text: '🐍 *Python — Pregunta 1 de 2*\n\n¿Cuál es el output?\n```\nx = [1, 2, 3]\nprint(x[-1])\n```\n(A) 1   (B) -1   (C) 3   (D) Error', correct: 'C', points: 50 },
      { id: 'P2', text: '🐍 *Python — Pregunta 2 de 2*\n\n¿Qué método agrega un elemento al final de una lista?\n\n(A) add()   (B) append()   (C) insert()   (D) push()', correct: 'B', points: 50 },
    ],
  },
};

function getSession(userId) { return sessions.get(userId) || { state: 'IDLE', userId }; }
function setSession(userId, data) { sessions.set(userId, { ...getSession(userId), ...data, updatedAt: Date.now() }); }
function clearSession(userId) { sessions.delete(userId); }

async function routeConversation(message) {
  const { text, userId } = message;
  const session = getSession(userId);
  const input = text.trim();

  if (session.state === 'IDLE') {
    const parts = input.split(/\s+/);
    const skillArg = parts[1]?.toLowerCase();
    if (skillArg && TESTS[skillArg]) {
      setSession(userId, { state: 'AWAITING_WALLET', skill: skillArg });
      return { text: `Vas a certificar: *${TESTS[skillArg].name}*\n\nEnvía tu wallet de Rollux (0x...):` };
    }
    setSession(userId, { state: 'AWAITING_SKILL_SELECTION' });
    return { text: `🎯 *Elige tu skill:*\n\n${Object.entries(TESTS).map(([k,t]) => `• \`${k}\` — ${t.name}`).join('\n')}\n\nResponde con el nombre del skill:` };
  }

  if (session.state === 'AWAITING_SKILL_SELECTION') {
    const skill = input.toLowerCase();
    if (TESTS[skill]) {
      setSession(userId, { state: 'AWAITING_WALLET', skill });
      return { text: `Vas a certificar: *${TESTS[skill].name}*\n\nEnvía tu wallet de Rollux (0x...):` };
    }
    return { text: `No reconozco ese skill. Opciones: ${Object.keys(TESTS).join(', ')}` };
  }

  if (session.state === 'AWAITING_WALLET') {
    if (input.toLowerCase() === '/cancelar') { clearSession(userId); return { text: 'Cancelado.' }; }
    if (!/^0x[a-fA-F0-9]{40}$/.test(input)) return { text: 'Wallet inválida. Necesito una dirección EVM (0x...). Intenta de nuevo o escribe /cancelar.' };
    const { skill } = session;
    setSession(userId, { state: 'TEST_IN_PROGRESS', walletAddress: input, currentQuestion: 0, score: 0, startedAt: Date.now() });
    return { text: `✅ Wallet registrada.\n\n📋 *${TESTS[skill].name}* — ${TESTS[skill].questions.length} preguntas\nPuntaje mínimo: ${TESTS[skill].passingScore}/100\n\nResponde *SÍ* para comenzar.` };
  }

  if (session.state === 'TEST_IN_PROGRESS') {
    const { skill, currentQuestion, walletAddress } = session;
    const test = TESTS[skill];
    if ((input.toUpperCase() === 'SÍ' || input.toUpperCase() === 'SI') && !session.waitingForAnswer) {
      setSession(userId, { waitingForAnswer: true });
      return { text: test.questions[0].text };
    }
    if (!session.waitingForAnswer) return { text: 'Responde *SÍ* para comenzar.' };
    const question = test.questions[currentQuestion];
    let scoreEarned = 0;
    if (question.isTypingTest) {
      const matches = [...input.trim()].filter((c, i) => c === question.referenceText[i]).length;
      scoreEarned = Math.round((matches / question.referenceText.length) * question.points);
    } else {
      if (input.toUpperCase().replace(/[^A-D]/g,'') === question.correct) scoreEarned = question.points;
    }
    const newScore = (session.score || 0) + scoreEarned;
    const nextQ = currentQuestion + 1;
    const isLast = nextQ >= test.questions.length;
    if (!isLast) {
      setSession(userId, { currentQuestion: nextQ, score: newScore });
      return { text: (scoreEarned > 0 ? '✅ Correcto.\n\n' : '❌ No exactamente.\n\n') + test.questions[nextQ].text };
    }
    const finalScore = Math.round(newScore);
    const passed = finalScore >= test.passingScore;
    setSession(userId, { state: 'AWAITING_CONFIRMATION', score: finalScore, passed, durationMs: Date.now() - session.startedAt });
    if (!passed) return { text: `📊 Puntaje: *${finalScore}/100*\n\nNo alcanzaste el mínimo (${test.passingScore}). Puedes reintentar en 30 días.\n\nUsa /oportunidades para ver vacantes disponibles.` };
    return { text: `🏆 *¡Test superado!*\n\nSkill: *${TESTS[skill].name}*\nPuntaje: *${finalScore}/100*\nWallet: \`${walletAddress.slice(0,6)}...${walletAddress.slice(-4)}\`\n\nEscribe *CONFIRMAR* para registrar tu Sello en Rollux.` };
  }

  if (session.state === 'AWAITING_CONFIRMATION') {
    if (!session.passed) { clearSession(userId); return { text: 'Puedes reintentar en 30 días.' }; }
    if (input.toUpperCase() === 'CONFIRMAR' || input.toUpperCase() === 'SI' || input.toUpperCase() === 'SÍ') {
      clearSession(userId);
      return { text: `🏅 *¡Tu habilidad ha sido certificada!*\n\nSello registrado en Rollux ✅\nYa tienes acceso a los Quests prioritarios de Moolbook.\n\nUsa /oportunidades para ver las vacantes disponibles para ti.` };
    }
    if (input.toLowerCase() === '/cancelar') { clearSession(userId); return { text: 'Entendido. Usa /sello para emitirlo después.' }; }
    return { text: 'Escribe *CONFIRMAR* para emitir tu sello o /cancelar para después.' };
  }

  return null;
}

module.exports = { routeConversation, getSession, clearSession, TESTS };
