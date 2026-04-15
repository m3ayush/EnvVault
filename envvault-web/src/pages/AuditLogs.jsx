import { useState, useEffect } from 'react';
import axios from 'axios';
import { AlertTriangle, Clock, User, ShieldAlert } from 'lucide-react';
import { API_URL } from '../config';

export default function AuditLogs({ userRole }) {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (userRole === 'admin') {
      fetchLogs();
    }
  }, [userRole]);

  const fetchLogs = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/audit-logs`);
      setLogs(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  if (userRole !== 'admin') {
    return (
      <div style={{ textAlign: 'center', marginTop: '4rem' }}>
         <ShieldAlert size={64} color="var(--danger)" style={{ margin: '0 auto 1rem' }} />
         <h2>Access Denied</h2>
         <p style={{ color: 'var(--text-muted)' }}>Only Administrators can view the audit trail.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Security Audit Trail</h1>
        <button className="btn btn-primary" onClick={fetchLogs}>Refresh Logs</button>
      </div>
      
      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>User</th>
              <th>Action</th>
              <th>Secret Key</th>
              <th>Status / AI ML Output</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log._id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <Clock size={14} /> 
                    {new Date(log.timestamp).toLocaleString()}
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <User size={14} /> 
                    {log.userId} <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>({log.userRole})</span>
                  </div>
                </td>
                <td>
                  <span style={{ 
                    textTransform: 'uppercase', 
                    fontSize: '0.8rem', 
                    fontWeight: 600, 
                    color: log.action === 'read' ? 'var(--accent)' 
                         : log.action === 'rotate' ? '#f59e0b' 
                         : log.action === 'delete' ? 'var(--danger)' 
                         : 'var(--success)' 
                  }}>
                    {log.action}
                  </span>
                </td>
                <td style={{ fontFamily: 'monospace' }}>{log.secretKeyName}</td>
                <td>
                   {log.is_anomaly ? (
                     <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                       <span className="badge anomaly"><AlertTriangle size={12} style={{ marginRight: '4px' }}/> ML ANOMALY</span>
                       <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Score: {log.anomaly_score?.toFixed(2)}</span>
                     </div>
                   ) : (
                     <span className="badge normal">NORMAL (Model Verified)</span>
                   )}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
               <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No audit logs found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
