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
        <Link to="/testing" className={location.pathname === '/testing' ? 'active' : ''}>Testing</Link>
        <Link to="/monitoring" className={location.pathname === '/monitoring' ? 'active' : ''}>Monitoring</Link>
        <Link to="/scalability" className={location.pathname === '/scalability' ? 'active' : ''}>Scaling</Link>
        <Link to="/deployment" className={location.pathname === '/deployment' ? 'active' : ''}>Deploy</Link>
        <Link to="/risk" className={location.pathname === '/risk' ? 'active' : ''}>Risk</Link>
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
