import { Link, useLocation } from 'react-router-dom';
import { ShieldAlert, ShieldCheck } from 'lucide-react';

export default function Header({ userRole, setUserRole }) {
  const location = useLocation();

  return (
    <header className="header">
      <div className="logo">
        <ShieldCheck size={28} />
        EnvVault
      </div>
      
      <nav className="nav-links">
        <Link to="/" className={location.pathname === '/' ? 'active' : ''}>Secrets</Link>
        {userRole === 'admin' && (
          <Link to="/audit-logs" className={location.pathname === '/audit-logs' ? 'active' : ''}>Audit Logs</Link>
        )}
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>MOCK ROLE:</span>
        <select 
          className="role-selector"
          value={userRole}
          onChange={(e) => setUserRole(e.target.value)}
        >
          <option value="viewer">Viewer</option>
          <option value="developer">Developer</option>
          <option value="admin">Admin</option>
        </select>
      </div>
    </header>
  );
}
