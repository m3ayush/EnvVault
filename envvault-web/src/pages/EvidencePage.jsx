import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Cloud,
  DollarSign,
  FileCheck2,
  Gauge,
  GitBranch,
  LineChart,
  Lock,
  Server,
  ShieldAlert,
  ShieldCheck,
  TestTube2,
} from 'lucide-react';

const pages = {
  testing: {
    title: 'Testing & Validation',
    subtitle: 'Functional, validation, model, and build checks for the full stack.',
    icon: TestTube2,
    score: '5 marks',
    summary: [
      { label: 'Backend tests', value: '35 Jest tests' },
      { label: 'ML tests', value: '41 Pytest tests' },
      { label: 'Frontend', value: 'Production build' },
      { label: 'CI/CD', value: 'GitHub Actions' },
    ],
    sections: [
      {
        heading: 'What Is Covered',
        icon: CheckCircle2,
        items: [
          'Backend API health, CRUD operations, encrypted raw storage, role-based redaction, audit log creation, and sorting.',
          'AES-256-GCM encryption roundtrip, tamper detection, IV uniqueness, and invalid ciphertext handling.',
          'ML model loading, prediction endpoints, batch prediction, missing-field validation, normal/anomaly behavior, and model artifact structure.',
          'Frontend Vite production build verifies the React app compiles successfully.',
        ],
      },
      {
        heading: 'Commands To Show',
        icon: FileCheck2,
        code: [
          'cd envvault-backend && npm test',
          'cd envvault-ml && source .venv/bin/activate && python -m pytest tests/ -v',
          'cd envvault-web && npm run build',
        ],
      },
    ],
  },
  monitoring: {
    title: 'Monitoring & Visualization',
    subtitle: 'Prometheus metrics, Grafana dashboard, audit logs, and MLflow experiment tracking.',
    icon: BarChart3,
    score: '4 marks',
    summary: [
      { label: 'Grafana', value: '8 panels' },
      { label: 'Prometheus', value: 'Backend target UP' },
      { label: 'Anomalies', value: 'Live counter' },
      { label: 'MLflow', value: 'Model lifecycle UI' },
    ],
    sections: [
      {
        heading: 'Live URLs',
        icon: Activity,
        links: [
          { label: 'Grafana dashboard', url: 'http://localhost:3002' },
          { label: 'Prometheus targets', url: 'http://localhost:9090/targets' },
          { label: 'Backend metrics', url: 'http://localhost:3001/metrics' },
          { label: 'MLflow UI', url: 'http://localhost:5050' },
        ],
      },
      {
        heading: 'What To Demonstrate',
        icon: LineChart,
        items: [
          'Grafana shows request rate, latency, active requests, memory usage, error rate, HTTP methods, and anomaly totals.',
          'Prometheus scrapes the backend `/metrics` endpoint every 10 seconds.',
          'The anomaly panel proves the backend, ML service, Prometheus, and Grafana are connected.',
          'Audit Logs page shows security events in the product UI.',
        ],
      },
    ],
  },
  scalability: {
    title: 'Optimization & Scalability',
    subtitle: 'Cost, performance, scaling strategy, healthchecks, and cloud scaling policies.',
    icon: Gauge,
    score: '4 marks',
    summary: [
      { label: 'Cost plan', value: '~$52/month baseline' },
      { label: 'Autoscaling', value: 'ECS target tracking' },
      { label: 'Healthchecks', value: 'Frontend/API/ML' },
      { label: 'Bottlenecks', value: 'Documented fixes' },
    ],
    sections: [
      {
        heading: 'Optimization Strategy',
        icon: DollarSign,
        items: [
          'Cost estimate and scaling tiers are documented in `COST_ANALYSIS.md`.',
          'Docker healthchecks keep frontend, backend, and ML service reproducible and observable.',
          'CloudFormation defines ECS autoscaling for backend and frontend services.',
          'CloudWatch high-CPU alarm supports operational visibility for scaling events.',
        ],
      },
      {
        heading: 'Important Tradeoffs',
        icon: AlertTriangle,
        items: [
          'The current JSON file database is good for demo but should move to DynamoDB/RDS for real concurrency.',
          'The ML service runs model inference in-container; for heavy traffic it can move to SageMaker or separate autoscaling.',
          'Static frontend can be cached behind CloudFront for lower latency and cost.',
        ],
      },
    ],
  },
  deployment: {
    title: 'Deployment Quality',
    subtitle: 'Docker Compose, service health, reproducible startup, CI pipeline, and AWS infrastructure as code.',
    icon: Cloud,
    score: '4 marks',
    summary: [
      { label: 'Frontend', value: 'localhost:3000' },
      { label: 'Backend', value: 'healthy on 3001' },
      { label: 'ML service', value: 'healthy on 8000' },
      { label: 'Monitoring', value: 'Grafana + Prometheus' },
    ],
    sections: [
      {
        heading: 'Docker Stack',
        icon: Server,
        items: [
          'Frontend, backend, ML service, MLflow, Prometheus, and Grafana run together from `docker-compose.yml`.',
          '`start-demo.sh docker` provides a single reproducible command for starting the demo.',
          'Container healthchecks prove services are alive before dependent services start.',
          'Nginx serves the React build and proxies API calls to the backend.',
        ],
      },
      {
        heading: 'Commands & URLs',
        icon: GitBranch,
        code: [
          'bash start-demo.sh docker',
          'docker ps',
          'http://localhost:3000',
          'http://localhost:3001/api/health',
          'http://localhost:8000/health',
        ],
      },
    ],
  },
  risk: {
    title: 'Risk Analysis & Mitigation',
    subtitle: 'STRIDE threat model, risk matrix, implemented controls, and residual risk.',
    icon: ShieldAlert,
    score: '3 marks',
    summary: [
      { label: 'Threat model', value: 'STRIDE' },
      { label: 'Threats', value: '10 identified' },
      { label: 'Encryption', value: 'AES-256-GCM' },
      { label: 'Controls', value: 'RBAC + audit + ML' },
    ],
    sections: [
      {
        heading: 'Implemented Mitigations',
        icon: ShieldCheck,
        items: [
          'Secrets are encrypted at rest with AES-256-GCM and authenticated tags detect tampering.',
          'Viewer role receives redacted values; admin/developer roles can read secrets.',
          'Helmet security headers, CORS allowlist, request-size limit, and rate limiting reduce web/API risk.',
          'Every secret operation creates an audit log and ML anomaly detection flags suspicious behavior.',
        ],
      },
      {
        heading: 'Show These Files',
        icon: Lock,
        code: [
          'RISK_ANALYSIS.md',
          'envvault-backend/encryption.js',
          'envvault-backend/server.js',
          'envvault-web/src/pages/AuditLogs.jsx',
        ],
      },
    ],
  },
};

export default function EvidencePage({ type }) {
  const page = pages[type] || pages.testing;
  const Icon = page.icon;

  return (
    <div className="evidence-page">
      <div className="evidence-hero">
        <div className="evidence-title">
          <span className="evidence-icon"><Icon size={26} /></span>
          <div>
            <h1>{page.title}</h1>
            <p>{page.subtitle}</p>
          </div>
        </div>
        <span className="score-pill">{page.score}</span>
      </div>

      <div className="metric-grid">
        {page.summary.map(item => (
          <div className="metric-tile" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      <div className="evidence-sections">
        {page.sections.map(section => {
          const SectionIcon = section.icon;
          return (
            <section className="evidence-section" key={section.heading}>
              <h2><SectionIcon size={20} /> {section.heading}</h2>
              {section.items && (
                <ul>
                  {section.items.map(item => <li key={item}>{item}</li>)}
                </ul>
              )}
              {section.links && (
                <div className="link-list">
                  {section.links.map(link => (
                    <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
                      {link.label}
                    </a>
                  ))}
                </div>
              )}
              {section.code && (
                <div className="command-list">
                  {section.code.map(line => <code key={line}>{line}</code>)}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
