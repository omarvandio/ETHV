const { routeConversation, getSession } = require('./session-manager');
const { AgentState } = require('./survival-rules');

async function handleMessage(message) {
  const { text, userId } = message;
  if (!text) return null;

  const session = getSession(userId);

  if (session.state !== 'IDLE') {
    return await routeConversation(message);
  }

  if (AgentState.status === 'HIBERNATE' && !text.startsWith('/estado') && !text.startsWith('/help')) {
    return { text: '⏸️ ETHV en hibernación temporaria. Escribe /estado para ver detalles.' };
  }

  const [command] = text.trim().split(/\s+/);

  switch (command.toLowerCase()) {
    case '/start':
      return { text: '👋 *Bienvenido a ETHV*\n\nSoy un agente de validación de talento técnico.\nCertifico tus habilidades on-chain en Syscoin/Rollux.\n\n🚀 /validar — Certifica una habilidad\n📋 /oportunidades — Ve vacantes en Moolbook\n❓ /help — Todos los comandos' };
    case '/validar':
      return await routeConversation(message);
    case '/oportunidades':
      return { text: '📋 *Oportunidades activas en Moolbook*\n\nVacantes encontradas hoy: 18\nPuedes ver: 10\nPostulaciones disponibles hoy: 3\n\n─────────────────\nVacante: Data Analyst\nCompatibilidad: 85%\nPodrías fortalecer: Python, Data Visualization\n\nVacante: Asistente Operaciones\nCompatibilidad: 72%\nPodrías fortalecer: Excel Avanzado\n\nVacante: Backend Developer\nCompatibilidad: 90%\nPodrías fortalecer: SQL, APIs REST\n─────────────────\n\n💳 ¿Quieres más acceso?\n$2 → ver 30 oportunidades\n$3 → 5 postulaciones extra\n$7 → 20 postulaciones extra' };
    case '/estado':
      const icons = { ACTIVE: '🟢', ALERT: '🟡', HIBERNATE: '🔴' };
      return { text: `${icons[AgentState.status] || '⚪'} *ETHV Estado: ${AgentState.status}*\n\nÚltimo chequeo: ${AgentState.lastCheck || 'Pendiente'}\nReglas activas: ${AgentState.triggeredRules.length}` };
    case '/help':
      return { text: '📖 *Comandos ETHV*\n\n/start — Bienvenida\n/validar [skill] — Iniciar certificación\n/oportunidades — Ver vacantes del día\n/estado — Estado del agente\n/cancelar — Cancelar proceso activo\n/help — Este menú\n\nSkills disponibles: logica, digitacion, python' };
    case '/cancelar':
      return { text: 'No hay ningún proceso activo.' };
    default:
      if (!text.startsWith('/')) return null;
      return { text: `Comando no reconocido: \`${command}\`\nEscribe /help para ver las opciones.` };
  }
}

module.exports = { handleMessage };
