# instinct.md — ETHV
## Reflejos Autónomos del Agente

---

## Principio Core

ETHV no falla por ser poco inteligente.
Falla si sigue ejecutando una política válida después de que el entorno cambió lo suficiente para hacerla letal.

Los reflejos activan ANTES de que la inteligencia se vuelva irrelevante.

---

## Los 5 Reflejos (Triggers Explícitos)

### 1. Confidence Reflex
**Problema:** Un ancla de confianza deja de ser confiable.
**Trigger:** Stablecoin pierde paridad (precio < $0.985)
**Respuesta:** Pausar operaciones de tesorería L1. No ejecutar nuevas posiciones. Modo seguro.
**Pregunta clave:** ¿Qué asumo como "básicamente fijo" y cómo detecto que ya no es seguro?

### 2. Exitability Reflex
**Problema:** La ruta de salida desaparece.
**Trigger:** Slippage estimado > 2% O TVL del pool cae > 30% en 24h
**Respuesta:** Congelar rebalanceo L2. No aumentar exposición. Evaluar costo de salida continuamente.
**Pregunta clave:** Si necesito detenerme ahora, ¿cuánto valor pierdo en el acto de detenerme?

### 3. Dependency Health Reflex
**Problema:** Una dependencia crítica se degrada o pausa.
**Trigger:** Oráculo sin update > 5 minutos O protocolo pausado
**Respuesta:** Suspender emisión de Sellos on-chain inmediatamente. Tratar funcionalidad parcial como advertencia, no como prueba de seguridad.
**Pregunta clave:** ¿Qué sistemas externos pueden atraparme o cegarme si se vuelven poco confiables?

### 4. Execution Reflex
**Problema:** La acción en sí se vuelve demasiado lenta, cara o poco confiable.
**Trigger:** Costo de gas > 15% del ingreso de 24h O ingresos en cero
**Respuesta:** Activar modo batch. Suspender actividad no esencial. Preservar opcionalidad en lugar de forzar acción en régimen degradado.
**Pregunta clave:** ¿Qué pasa si puedo observar correctamente pero no puedo actuar a la velocidad o costo requerido?

### 5. Unit Economics Reflex
**Problema:** La operación continua se vuelve económicamente irracional.
**Trigger:** APY operativo < 3% O APY < costo de mantenimiento
**Respuesta:** Hibernar. Escalar hacia abajo. Terminar procesos no esenciales. Evaluar valor neto, no output bruto.
**Pregunta clave:** Si el agente sigue corriendo sin cambios la próxima semana, ¿crea valor o consume valor?

---

## Tabla de Estados

| Reflejos activos | Estado resultante |
|-----------------|-------------------|
| 0 | 🟢 ACTIVO — operación normal |
| 1 medio | 🟡 ALERTA — operación reducida |
| 1 crítico o 2 medios | 🟡 ALERTA — modo conservador |
| 2+ críticos | 🔴 HIBERNACIÓN — solo monitoreo |

---

## Condiciones de Reinicio

El agente no reinicia automáticamente tras hibernación.
Requiere que todas las condiciones que activaron los reflejos hayan vuelto a parámetros normales durante al menos 15 minutos consecutivos.

---

## Lo que los reflejos NO hacen

- No optimizan rendimiento
- No toman decisiones discrecionales
- No ignoran triggers por contexto o "intuición"
- No escalan en régimen degradado

Los reflejos son más rígidos que la lógica de optimización. Esa es su función.

---

*ETHV v1.0 — instinct.md*
*Basado en Autonomous Agent Survival Rules — Proof of Builders / Syscoin*
