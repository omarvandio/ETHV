const AgentState = {
  status: 'ACTIVE',
  triggeredRules: [],
  lastCheck: null,
  sealingEnabled: true,
  batchMode: false,
  writingEnabled: true,
};

const CONFIG = {
  PEG_MIN: parseFloat(process.env.PEG_MIN || '0.985'),
  SLIPPAGE_MAX: parseFloat(process.env.SLIPPAGE_MAX || '0.02'),
  ORACLE_STALE_MS: parseInt(process.env.ORACLE_STALE_MS || '300000'),
  GAS_RATIO_MIN: parseFloat(process.env.GAS_RATIO_MIN || '0.15'),
  APY_FLOOR: parseFloat(process.env.APY_FLOOR || '0.03'),
};

async function evaluateSurvival({ pegData, poolData, oracleData, economicsData, financeData }) {
  AgentState.lastCheck = new Date().toISOString();
  AgentState.triggeredRules = [];

  if (pegData.usdcPrice < CONFIG.PEG_MIN || pegData.usdtPrice < CONFIG.PEG_MIN)
    AgentState.triggeredRules.push({ name: 'PEG_CONFIDENCE', severity: 'HIGH', message: 'Estables fuera de paridad' });

  if (poolData.estimatedSlippage > CONFIG.SLIPPAGE_MAX)
    AgentState.triggeredRules.push({ name: 'LIQUIDITY', severity: 'MEDIUM', message: 'Slippage elevado' });

  if ((Date.now() - oracleData.lastUpdateTimestamp) > CONFIG.ORACLE_STALE_MS || oracleData.isPaused) {
    AgentState.sealingEnabled = false;
    AgentState.triggeredRules.push({ name: 'ORACLE', severity: 'HIGH', message: 'Oráculo pausado o stale' });
  } else {
    AgentState.sealingEnabled = true;
  }

  if (economicsData.incomeLast24h > 0 && (economicsData.gasCostLast24h / economicsData.incomeLast24h) > CONFIG.GAS_RATIO_MIN)
    AgentState.triggeredRules.push({ name: 'GAS_RATIO', severity: 'MEDIUM', message: 'Gas/ingreso alto' });

  if (financeData.currentAPY < CONFIG.APY_FLOOR)
    AgentState.triggeredRules.push({ name: 'APY', severity: 'CRITICAL', message: 'APY bajo el piso mínimo' });

  const critical = AgentState.triggeredRules.filter(r => r.severity === 'CRITICAL' || r.severity === 'HIGH').length;
  const medium = AgentState.triggeredRules.filter(r => r.severity === 'MEDIUM').length;

  if (critical >= 2) AgentState.status = 'HIBERNATE';
  else if (critical === 1 || medium >= 2) AgentState.status = 'ALERT';
  else AgentState.status = 'ACTIVE';

  console.log(`[ETHV] Survival check: ${AgentState.status} | Reglas: ${AgentState.triggeredRules.length}`);
  return AgentState;
}

module.exports = { evaluateSurvival, AgentState };
