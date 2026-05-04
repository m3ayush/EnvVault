# EnvVault — Cost Analysis & Optimization Strategy

## 1. Estimated Monthly AWS Costs (ap-south-1)

### Baseline Configuration (Minimal — 1 task per service)

| Service | Resource | Spec | Monthly Cost (USD) |
|---------|----------|------|-------------------|
| **ECS Fargate — Backend** | 1 task × 24/7 | 0.25 vCPU, 0.5 GB RAM | ~$7.50 |
| **ECS Fargate — ML Service** | 1 task × 24/7 | 0.5 vCPU, 1 GB RAM | ~$15.00 |
| **ECS Fargate — Frontend** | 1 task × 24/7 | 0.25 vCPU, 0.5 GB RAM | ~$7.50 |
| **Application Load Balancer** | 1 ALB | Fixed hourly + LCU | ~$18.00 |
| **ECR** | 3 repos, ~500 MB storage | Image storage | ~$0.50 |
| **S3** | ML artifacts bucket | < 1 GB, versioned | ~$0.03 |
| **CloudWatch Logs** | 3 log groups, 14-day retention | ~5 GB/month ingestion | ~$2.50 |
| **Data Transfer** | Outbound to internet | ~10 GB/month | ~$0.90 |
| | | **Estimated Total** | **~$52/month** |

### Scaled Configuration (Auto-scaling active, moderate load)

| Service | Resource | Spec | Monthly Cost (USD) |
|---------|----------|------|-------------------|
| **ECS Fargate — Backend** | 1-4 tasks | 0.25 vCPU, 0.5 GB RAM | ~$7.50 – $30.00 |
| **ECS Fargate — ML Service** | 1 task | 0.5 vCPU, 1 GB RAM | ~$15.00 |
| **ECS Fargate — Frontend** | 1-3 tasks | 0.25 vCPU, 0.5 GB RAM | ~$7.50 – $22.50 |
| **ALB** | 1 ALB | Higher LCU usage | ~$22.00 |
| **Other** | ECR + S3 + CW + transfer | Same as above | ~$4.00 |
| | | **Estimated Total** | **~$56 – $94/month** |

---

## 2. Cost Optimization Strategies

| Strategy | Savings | Implementation |
|----------|---------|----------------|
| **Fargate Spot** | Up to 70% on compute | Add `capacityProviderStrategy` with `FARGATE_SPOT` for non-critical tasks |
| **Right-sizing** | 10-30% | Monitor actual CPU/memory usage via Container Insights; reduce over-provisioned tasks |
| **Scale to zero (off-hours)** | 50%+ | Schedule ECS desired count to 0 during nights/weekends (if non-production) |
| **S3 Intelligent-Tiering** | 5-10% | Automatically moves infrequently accessed model artifacts to cheaper storage |
| **CloudWatch log retention** | Minor | Reduce from 14 days to 7 days for non-critical logs |
| **NAT Gateway avoidance** | ~$35/month | Use public subnets with public IPs (already implemented) instead of NAT Gateway |
| **Reserved capacity** | 20-40% | Commit to 1-year or 3-year Fargate Savings Plans for steady-state workloads |

---

## 3. Scaling Strategy

### How EnvVault handles increasing load:

| Traffic Level | Configuration | Estimated Cost |
|--------------|---------------|----------------|
| **Development** (1-10 users) | `docker compose up` (local) | $0 |
| **Small team** (10-50 users) | 1 task per service, no auto-scaling | ~$52/month |
| **Medium** (50-500 users) | Auto-scaling (1-4 backend, 1-3 frontend) | ~$56-94/month |
| **Large** (500+ users) | Increase max capacity, add RDS/DynamoDB, CloudFront CDN | ~$150-300/month |

### Scaling bottlenecks and solutions:

| Bottleneck | Current Limit | Solution |
|-----------|--------------|----------|
| JSON file database | Single-writer, no concurrency | Migrate to DynamoDB or RDS |
| ML model in-memory | 1 model per container | Serve via SageMaker endpoint for independent scaling |
| Rate limiter (per-IP) | 100 req/15 min | Increase limit or use WAF rate rules on ALB |
| ECS task limits | 4 backend tasks max | Increase `MaxCapacity` in auto-scaling config |

---

## 4. Performance Benchmarks

| Metric | Value | Measured |
|--------|-------|----------|
| Backend cold start | ~2s | Docker container startup |
| ML service cold start | ~5s | Model loading from .pkl |
| Secret encryption (AES-256-GCM) | < 1ms | Per operation |
| ML inference latency | < 50ms | Single predict call |
| API response time (p95) | < 100ms | Excluding ML timeout |
| Docker image size (backend) | ~180 MB | node:20-alpine |
| Docker image size (ML) | ~850 MB | python:3.11-slim + scikit-learn |
| Docker image size (frontend) | ~25 MB | nginx:alpine + built assets |

---

*Last updated: 2026-05-04*
