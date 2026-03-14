# instinct.md — ETHV
## Reflejos Autónomos del Agente

---

## Principio Core

ETHV no falla por ser poco inteligente.
Falla si sigue ejecutando una política válida después de que el entorno cambió lo suficiente para hacerla letal.

Los reflejos activan ANTES de que la inteligencia se vuelva irrelevante.

---

## Los 5 Reflejos Adaptados al Modelo ETHV

### 1. Confidence Reflex — "¿La IA que valida es confiable?"
**Problema:** La IA que analiza CVs y genera perfiles deja de ser confiable.
**Trigger:** Gemini/IA devuelve errores > 3 veces seguidas O tiempo de respuesta > 10 segundos
**Respuesta automática:** Pausar validaciones de CV. Notificar al usuario: "El análisis de CV está temporalmente no disponible. Puedes hacer el test manual con /validar." No mostrar perfiles generados con datos degradados.
**Pregunta clave:** ¿Qué asumo como confiable en cada validación y cómo detecto que ya no lo es?

### 2. Exitability Reflex — "¿El usuario puede salir limpiamente?"
**Problema:** El usuario queda atrapado en un flujo roto a mitad del test.
**Trigger:** Usuario sin respuesta > 2 horas en sesión activa O error en medio del test
**Respuesta automática:** Cancelar sesión automáticamente. Devolver créditos de postulación si se usaron. Mensaje: "Tu sesión expiró. Puedes reiniciar con /validar cuando quieras, sin penalización."
**Pregunta clave:** Si el flujo se rompe ahora, ¿el usuario queda bloqueado o puede retomar?

### 3. Dependency Health Reflex — "¿Moolbook está respondiendo?"
**Problema:** La API de vacantes de Moolbook falla o devuelve datos vacíos.
**Trigger:** API de Moolbook sin respuesta > 2 minutos O lista de vacantes vacía
**Respuesta automática:** No mostrar lista vacía como si no hubiera oportunidades. Usar caché de última lista válida. Mensaje: "Estamos actualizando las vacantes. Te mostramos las últimas disponibles." Si caché > 24h, avisar explícitamente.
**Pregunta clave:** ¿Qué sistemas externos pueden mostrar datos falsos o vacíos sin que el usuario lo sepa?

### 4. Execution Reflex — "¿Los pagos están funcionando?"
**Problema:** El sistema de micropagos falla a mitad de una transacción.
**Trigger:** Error en procesamiento de pago O timeout en confirmación > 30 segundos
**Respuesta automática:** NO bloquear al usuario. Dar acceso temporal al beneficio comprado. Registrar deuda pendiente. Mensaje: "Tu pago está siendo procesado. Ya tienes acceso — lo confirmaremos en breve." Resolver en background.
**Pregunta clave:** ¿Qué pasa si el usuario pagó pero el sistema no lo registró? ¿Se queda sin acceso?

### 5. Unit Economics Reflex — "¿Estamos generando más de lo que gastamos?"
**Problema:** El costo de operar supera los ingresos por micropagos.
**Trigger:** Costo de Gemini API + hosting > ingresos de micropagos en 7 días consecutivos
**Respuesta automática:** Hibernar features costosos primero (análisis de CV con IA). Mantener activos los comandos básicos (/validar manual, /oportunidades con caché). Mensaje interno al operador. NO apagar el bot completo — degradar graciosamente.
**Pregunta clave:** Si el agente sigue corriendo sin cambios la próxima semana, ¿crea valor o consume valor?

---

## Tabla de Estados

| Reflejos activos | Estado | Comportamiento |
|-----------------|--------|----------------|
| 0 | 🟢 ACTIVO | Operación normal. CV + test + vacantes + pagos. |
| 1 medio | 🟡 ALERTA | Feature afectado degradado. Resto funciona. |
| 1 crítico o 2 medios | 🟡 ALERTA | Modo conservador. Solo comandos básicos. |
| 2+ críticos | 🔴 HIBERNACIÓN | Solo /help y /estado. Nada más. |

---

## Principio de Degradación Graceful

ETHV nunca se apaga completamente de golpe.
Cuando un reflejo activa, desactiva el feature más costoso primero:

```
1. Análisis de CV con IA (más costoso)
2. Emisión de Sellos on-chain
3. Conexión con Moolbook en tiempo real
4. Tests automáticos (queda solo modo manual)
5. Último recurso: solo /help y /estado
```

---

## Condiciones de Reinicio

El agente no reinicia features automáticamente.
Requiere que la condición que activó el reflejo haya vuelto a parámetros normales durante al menos 15 minutos consecutivos.

---

## Lo que los reflejos NO hacen

- No optimizan rendimiento
- No toman decisiones discrecionales
- No ignoran triggers por contexto
- No penalizan al usuario por fallas del sistema

Los reflejos son más rígidos que la lógica de optimización. Esa es su función.

---

*ETHV v1.0 — instinct.md*
*Basado en Autonomous Agent Survival Rules — Proof of Builders / Syscoin*
*Adaptado al modelo de negocio: validación de talento con micropagos*