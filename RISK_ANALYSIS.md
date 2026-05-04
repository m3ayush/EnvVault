# EnvVault — Risk Analysis & Mitigation

> Formal threat identification, risk assessment, and mitigation strategies for the EnvVault secrets management platform.

---

## 1. Executive Summary

EnvVault manages sensitive credentials (API keys, database passwords, JWT secrets) with AES-256-GCM encryption, role-based access control, and ML-powered anomaly detection. This document identifies security threats, assesses their risk, and documents the mitigation measures implemented or planned.

---

## 2. Threat Model (STRIDE Analysis)

| # | Threat | STRIDE Category | Description |
|---|--------|----------------|-------------|
| T1 | Credential Exposure | **Information Disclosure** | Secrets stored in plaintext or leaked via logs/error messages |
| T2 | Insider Threat | **Elevation of Privilege** | Authorized user abuses access to bulk-read or exfiltrate secrets |
| T3 | Unauthorized Access | **Spoofing** | Attacker impersonates a legitimate user to read/modify secrets |
| T4 | Data Tampering | **Tampering** | Attacker modifies encrypted secrets or audit logs in storage |
| T5 | Denial of Service (DoS) | **Denial of Service** | Attacker overwhelms the API to make it unavailable |
| T6 | Man-in-the-Middle (MitM) | **Information Disclosure** | Attacker intercepts data in transit between services |
| T7 | Model Poisoning | **Tampering** | Attacker corrupts ML training data to disable anomaly detection |
| T8 | Dependency Vulnerability | **Tampering** | Compromised npm/pip package introduces malicious code |
| T9 | Container Escape | **Elevation of Privilege** | Attacker exploits container runtime to access host system |
| T10 | Encryption Key Compromise | **Information Disclosure** | AES-256 key leaked, all secrets become readable |

---

## 3. Risk Assessment Matrix

**Likelihood Scale:** 1 (Rare) → 5 (Almost Certain)
**Impact Scale:** 1 (Negligible) → 5 (Critical)
**Risk Score = Likelihood × Impact**

| # | Threat | Likelihood | Impact | Risk Score | Risk Level |
|---|--------|-----------|--------|-----------|------------|
| T1 | Credential Exposure | 2 | 5 | **10** | 🔴 High |
| T2 | Insider Threat | 3 | 4 | **12** | 🔴 High |
| T3 | Unauthorized Access | 3 | 5 | **15** | 🔴 High |
| T4 | Data Tampering | 2 | 4 | **8** | 🟡 Medium |
| T5 | Denial of Service | 3 | 3 | **9** | 🟡 Medium |
| T6 | Man-in-the-Middle | 2 | 4 | **8** | 🟡 Medium |
| T7 | Model Poisoning | 1 | 3 | **3** | 🟢 Low |
| T8 | Dependency Vulnerability | 3 | 4 | **12** | 🔴 High |
| T9 | Container Escape | 1 | 5 | **5** | 🟡 Medium |
| T10 | Encryption Key Compromise | 1 | 5 | **5** | 🟡 Medium |

---

## 4. Mitigation Measures

### T1: Credential Exposure — 🔴 High Risk

| Mitigation | Status | Implementation |
|-----------|--------|----------------|
| AES-256-GCM encryption at rest | ✅ Implemented | `encryption.js` — all secret values encrypted before storage |
| GCM authentication tag | ✅ Implemented | 16-byte auth tag prevents silent modification |
| Secrets never logged in plaintext | ✅ Implemented | Console logs show key names, not values |
| `.env` file excluded from version control | ✅ Implemented | `.gitignore` excludes `.env` |
| Viewer role sees `[REDACTED]` | ✅ Implemented | `server.js` — viewer role receives `********` |
| ECR image scanning on push | ✅ Implemented | CloudFormation — `ScanOnPush: true` |

### T2: Insider Threat — 🔴 High Risk

| Mitigation | Status | Implementation |
|-----------|--------|----------------|
| ML anomaly detection (IsolationForest) | ✅ Implemented | Flags bulk access, off-hours activity, unusual IPs |
| Tamper-evident audit trail | ✅ Implemented | Every CRUD operation logged with userId, role, IP, timestamp |
| Role-based access control (RBAC) | ✅ Implemented | admin / developer / viewer with different permissions |
| Session-based access counting | ✅ Implemented | `sessionStats` tracks per-user read counts per session |
| Anomaly confidence scoring (0-100%) | ✅ Implemented | `normalize_confidence()` maps model scores to human-readable % |

### T3: Unauthorized Access — 🔴 High Risk

| Mitigation | Status | Implementation |
|-----------|--------|----------------|
| Helmet.js security headers | ✅ Implemented | XSS, clickjacking, MIME-sniffing, CSP headers |
| CORS origin allowlist | ✅ Implemented | Only configured origins can call the API |
| Rate limiting (100 req/15 min/IP) | ✅ Implemented | `express-rate-limit` prevents brute-force |
| Role validation on every request | ✅ Implemented | `userId` and `userRole` required on all secret endpoints |
| JWT/OAuth2 authentication | ⏳ Planned | Current: mock role switcher. Future: AWS Cognito integration |

### T4: Data Tampering — 🟡 Medium Risk

| Mitigation | Status | Implementation |
|-----------|--------|----------------|
| GCM authenticated encryption | ✅ Implemented | Auth tag detects any modification to encrypted data |
| Audit log immutability (append-only) | ✅ Implemented | Logs are only appended, never modified/deleted via API |
| S3 versioning for ML artifacts | ✅ Implemented | CloudFormation — S3 bucket with versioning enabled |
| S3 server-side encryption (AES256) | ✅ Implemented | ML model artifacts encrypted at rest in S3 |

### T5: Denial of Service (DoS) — 🟡 Medium Risk

| Mitigation | Status | Implementation |
|-----------|--------|----------------|
| Rate limiting per IP | ✅ Implemented | 100 requests / 15 minutes per IP address |
| Request body size limit | ✅ Implemented | Express JSON body limited to 1 MB |
| ML service timeout (3s) | ✅ Implemented | Backend continues if ML service is unresponsive |
| Graceful ML degradation | ✅ Implemented | `ECONNREFUSED` handled — service continues without ML |
| ALB + ECS auto-scaling | ✅ Implemented | CloudFormation defines ALB with scalable ECS tasks |

### T6: Man-in-the-Middle (MitM) — 🟡 Medium Risk

| Mitigation | Status | Implementation |
|-----------|--------|----------------|
| Docker bridge network isolation | ✅ Implemented | Inter-service traffic on `envvault-net` only |
| X-Forwarded headers | ✅ Implemented | nginx proxies `X-Real-IP`, `X-Forwarded-For` |
| HTTPS/TLS on ALB | ⏳ Planned | Future: ACM certificate + ALB HTTPS listener |
| Internal service mesh encryption | ⏳ Planned | Future: mTLS between microservices |

### T7: Model Poisoning — 🟢 Low Risk

| Mitigation | Status | Implementation |
|-----------|--------|----------------|
| Model versioning in MLflow registry | ✅ Implemented | All model versions tracked with params/metrics |
| Champion alias promotion workflow | ✅ Implemented | `promote_model.py` — only best model gets `champion` alias |
| Pre-trained model.pkl bundled in Docker | ✅ Implemented | Known-good model shipped with image |
| Retrain validation | ✅ Implemented | `retrain.py` validates metrics before promotion |

### T8: Dependency Vulnerability — 🔴 High Risk

| Mitigation | Status | Implementation |
|-----------|--------|----------------|
| `npm audit` in CI pipeline | ✅ Implemented | GitHub Actions runs `npm audit --audit-level=moderate` |
| `pip audit` in CI pipeline | ✅ Implemented | GitHub Actions runs `pip audit` (if installed) |
| Minimal Docker base images | ✅ Implemented | `node:20-alpine` and `python:3.11-slim` |
| `npm ci` with lockfile | ✅ Implemented | Deterministic installs from `package-lock.json` |
| ECR image scanning | ✅ Implemented | `ScanOnPush: true` scans for CVEs |

### T9: Container Escape — 🟡 Medium Risk

| Mitigation | Status | Implementation |
|-----------|--------|----------------|
| ECS Fargate (serverless) | ✅ Implemented | No access to underlying EC2 host |
| Non-root container user | ⏳ Planned | Future: add `USER node` / `USER nobody` to Dockerfiles |
| Read-only filesystem | ⏳ Planned | Future: `readOnlyRootFilesystem` in ECS task def |

### T10: Encryption Key Compromise — 🟡 Medium Risk

| Mitigation | Status | Implementation |
|-----------|--------|----------------|
| Key derived from passphrase (SHA-256) | ✅ Implemented | Default fallback; no key in source code |
| Environment variable injection | ✅ Implemented | `ENCRYPTION_KEY` from `.env` or GitHub Secrets |
| CloudFormation `NoEcho` parameter | ✅ Implemented | Key never visible in stack outputs |
| AWS Secrets Manager / KMS | ⏳ Planned | Future: store key in AWS KMS/SSM Parameter Store |

---

## 5. Security Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        SECURITY LAYERS                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [Layer 1: Network]                                               │
│    ├── ALB Security Group (port 80 only)                         │
│    ├── ECS Security Group (ALB → ECS only)                       │
│    ├── Docker bridge network isolation                            │
│    └── CORS origin allowlist                                      │
│                                                                    │
│  [Layer 2: Application]                                           │
│    ├── Helmet.js security headers (XSS, CSP, clickjacking)      │
│    ├── Rate limiting (100 req/15min/IP)                           │
│    ├── Request body size limit (1 MB)                             │
│    └── Role-based access control (admin/developer/viewer)        │
│                                                                    │
│  [Layer 3: Data]                                                  │
│    ├── AES-256-GCM encryption at rest                            │
│    ├── GCM authentication tags (tamper detection)                │
│    ├── S3 server-side encryption (AES256)                        │
│    └── S3 versioning for ML artifacts                            │
│                                                                    │
│  [Layer 4: Detection & Response]                                  │
│    ├── IsolationForest anomaly detection                         │
│    ├── Real-time anomaly scoring (0-100%)                        │
│    ├── Tamper-evident audit trail                                 │
│    ├── Prometheus metrics collection                              │
│    └── Grafana monitoring dashboard                               │
│                                                                    │
│  [Layer 5: Supply Chain]                                          │
│    ├── npm audit (CI pipeline)                                    │
│    ├── pip audit (CI pipeline)                                    │
│    ├── ECR image scanning on push                                │
│    └── Minimal base images (Alpine/slim)                         │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 6. Incident Response Outline

| Phase | Actions |
|-------|---------|
| **Detection** | ML anomaly alerts via audit log (`is_anomaly: true`); Grafana anomaly rate dashboard; Prometheus alerts |
| **Containment** | Rotate compromised secrets via API; disable affected user account; rate-limit suspicious IPs |
| **Eradication** | Revoke leaked API keys at source; update encryption key; redeploy with patched images |
| **Recovery** | Verify all secrets re-encrypted; confirm clean audit log; validate ML model integrity |
| **Lessons Learned** | Document root cause; update threat model; add new detection rules |

---

## 7. Compliance Considerations

| Standard | Relevance | Coverage |
|----------|-----------|----------|
| OWASP Top 10 | Web application security | A02 (Cryptographic Failures) — AES-256-GCM; A05 (Security Misconfiguration) — Helmet; A09 (Logging) — Audit trail |
| NIST 800-38D | GCM encryption standard | Compliant — 12-byte IV, 128-bit auth tag |
| SOC 2 Type II | Access controls & audit | Partial — RBAC, audit logs, anomaly detection |
| GDPR | Data protection | Encryption at rest; access logging |

---

## 8. Risk Heat Map

```
         Impact →
         1     2     3     4     5
    ┌─────┬─────┬─────┬─────┬─────┐
  5 │     │     │     │     │     │  Likelihood
    ├─────┼─────┼─────┼─────┼─────┤  ↓
  4 │     │     │     │     │     │
    ├─────┼─────┼─────┼─────┼─────┤
  3 │     │     │ T5  │T2,T8│ T3  │
    ├─────┼─────┼─────┼─────┼─────┤
  2 │     │     │     │T4,T6│ T1  │
    ├─────┼─────┼─────┼─────┼─────┤
  1 │     │     │ T7  │     │T9,T10│
    └─────┴─────┴─────┴─────┴─────┘

  🟢 Low (1-4)   🟡 Medium (5-9)   🔴 High (10+)
```

---

*Document version: 1.0 | Last updated: 2026-05-04 | Author: EnvVault Security Team*
