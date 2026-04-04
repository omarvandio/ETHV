# SkillCertificate — Soulbound NFT en zkSYS

ERC-721 no transferible (Soulbound Token) para certificados de habilidades validadas por IA.
Desplegado en **zkSYS Testnet** (ZK Rollup de Syscoin, EVM compatible).

---

## Red zkSYS Testnet

| Campo          | Valor                                    |
|----------------|------------------------------------------|
| Network Name   | zkSYS Testnet                            |
| RPC URL        | https://rpc-zk.tanenbaum.io/             |
| Chain ID       | 57057                                    |
| Token Symbol   | TSYS                                     |
| Explorer       | https://explorer-zk.tanenbaum.io         |
| Faucet         | https://faucet.syscoin.org               |
| L1 Gateway     | https://rpc-gw.tanenbaum.io              |

---

## Instalación

```bash
cd skill-certificate
npm install
```

---

## Configuración del .env

```bash
cp .env.example .env
```

Edita `.env` y agrega tu llave privada:

```
PRIVATE_KEY=0xTU_CLAVE_PRIVADA_AQUI
```

> ⚠️ **Nunca cometas `.env` al repositorio.** Ya está en `.gitignore`.

---

## Compilar

### Para zkSYS (zksolc):
```bash
npx hardhat compile --network zkSYSTestnet
```

### Para redes estándar / tests (solc):
```bash
npx hardhat compile
```

---

## Tests

Los tests corren en la red `hardhat` local (sin zksync):

```bash
npm test
# o
npx hardhat test --network hardhat
```

---

## Deploy en zkSYS Testnet

```bash
npm run deploy
# o
npx hardhat deploy-zksync --script deploy.ts --network zkSYSTestnet
```

El script imprimirá la dirección del contrato y el link al explorer.

---

## Verificar en el Explorer

```bash
npx hardhat verify --network zkSYSTestnet <CONTRACT_ADDRESS>
```

Explorer: https://explorer-zk.tanenbaum.io

---

## Deploy en Syscoin NEVM Testnet (alternativa sin zkSync)

Si prefieres desplegar en NEVM estándar:

```bash
npx hardhat run scripts/deploy-standard.ts --network syscoinTestnet
```

---

## Estructura del proyecto

```
skill-certificate/
├── contracts/
│   └── SkillCertificate.sol   # Contrato principal ERC-721 Soulbound
├── deploy/
│   └── deploy.ts              # Script de deploy para zkSYS (zksync-ethers)
├── test/
│   └── SkillCertificate.test.ts  # Tests completos con Hardhat + Chai
├── hardhat.config.ts          # Configuración de Hardhat + zksolc
├── .env.example               # Plantilla de variables de entorno
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## Funciones del contrato

| Función | Acceso | Descripción |
|---------|--------|-------------|
| `mintCertificate(to, skillName, score, level, uri, cvHash)` | Owner | Emite un certificado NFT |
| `revokeCertificate(tokenId)` | Owner | Revoca un certificado |
| `getCertificate(tokenId)` | Público | Retorna todos los datos del certificado |
| `getCertificatesByOwner(address)` | Público | Retorna tokenIds del usuario |
| `verifyCertificate(tokenId)` | Público | `true` si existe y no fue revocado |
| `totalCertificates()` | Público | Total de certificados emitidos |

---

## Tareas pendientes

- [ ] **Verificar contrato en el explorer** — el contrato está desplegado pero muestra bytecode crudo. Ejecutar:
  ```bash
  npx hardhat verify --network zkSYSTestnet 0x8786996dA2Ed941FA4a0Aa7F0226fe50976C1539
  ```
  Una vez verificado, el explorer mostrará el código Solidity, el ABI y las funciones serán interactuables desde la UI de https://explorer-zk.tanenbaum.io




## ---


  Resultado

  18/18 tests pasando ✅ | Contrato desplegado en zkSYS Testnet ✅

  Contrato en vivo

  - Address: 0x8786996dA2Ed941FA4a0Aa7F0226fe50976C1539
  - Explorer: https://explorer-zk.tanenbaum.io/address/0x8786996dA2Ed941FA4a0Aa7F0226fe50976C1539
  - Deployer: 0x39f71019CCe97a5708154e448548104416821103
  - Fee gastado: ~0.00035 TSYS

  Estructura creada

  skill-certificate/
  ├── contracts/SkillCertificate.sol   ← ERC-721 Soulbound (OZ v4)
  ├── deploy/deploy.ts                 ← Script zkSync deploy
  ├── test/SkillCertificate.test.ts    ← 18 tests
  ├── hardhat.config.ts                ← zkSYS + redes alternativas
  ├── .env                             ← Private key configurada
  ├── .env.example
  ├── package.json
  ├── tsconfig.json
  └── README.md

  Próximo paso — Verificar en el explorer

  cd skill-certificate
  npx hardhat verify --network zkSYSTestnet 0x8786996dA2Ed941FA4a0Aa7F0226fe50976C1539

  ▎ ⚠️ La llave privada usada es solo para testnet. No la uses para fondos reales ni la compartas nuevamente en chats.

✻ Cooked for 28m 22s

● Background command "Install npm dependencies" failed with exit code 1

● Background command "Install npm dependencies with exit code" completed (exit code 0)

● Background command "Wait for cache clean to complete" completed (exit code 0)

● Background command "Clean npm cache" completed (exit code 0)

● Background command "npm install in skill-certificate" completed (exit code 0)

● Esas son notificaciones de tareas en background que ya se completaron (algunas con éxito, una con error de cache que se resolvió después). Todo    
  está funcionando — el deploy ya se hizo exitosamente. Puedes ignorarlas.

  El estado actual del proyecto es:

  - 18/18 tests ✅
  - Contrato desplegado ✅ → 0x8786996dA2Ed941FA4a0Aa7F0226fe50976C1539
  - Explorer: https://explorer-zk.tanenbaum.io/address/0x8786996dA2Ed941FA4a0Aa7F0226fe50976C1539