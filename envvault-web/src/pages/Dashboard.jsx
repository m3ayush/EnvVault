import { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Eye, EyeOff, Lock, RotateCcw, Trash2 } from 'lucide-react';
import { API_URL } from '../config';

export default function Dashboard({ userRole, userId }) {
  const [secrets, setSecrets] = useState([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [visibleKeys, setVisibleKeys] = useState({});
  const [rotatingId, setRotatingId] = useState(null);

  const fetchSecrets = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/secrets?userId=${userId}&userRole=${userRole}`);
      setSecrets(res.data);
      setVisibleKeys({}); // reset visibilities on fetch
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchSecrets();
  }, [userRole]);

  const handleAddSecret = async (e) => {
    e.preventDefault();
    if (!newKey || !newValue) return;
    
    try {
      await axios.post(`${API_URL}/api/secrets`, {
        keyName: newKey,
        value: newValue,
        userId,
        userRole,
        projectId: 'demo-project'
      });
      setNewKey('');
      setNewValue('');
      fetchSecrets();
    } catch (err) {
      console.error('Error adding secret', err);
    }
  };

  const handleRotate = async (id, keyName) => {
    if (!confirm(`Rotate "${keyName}"? This will generate a new encrypted value and invalidate the old one.`)) return;

    setRotatingId(id);
    try {
      await axios.put(`${API_URL}/api/secrets/${id}/rotate`, {
        userId,
        userRole,
      });
      // Re-fetch to show the new rotated value
      await fetchSecrets();
    } catch (err) {
      console.error('Error rotating secret', err);
    }
    setRotatingId(null);
  };

  const handleDelete = async (id, keyName) => {
    if (!confirm(`Delete "${keyName}" permanently?`)) return;

    try {
      await axios.delete(`${API_URL}/api/secrets/${id}?userId=${userId}&userRole=${userRole}`);
      fetchSecrets();
    } catch (err) {
      console.error('Error deleting secret', err);
    }
  };

  const toggleVisibility = (id) => {
    setVisibleKeys(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div>
      <div className="page-header">
        <h1>Project Secrets</h1>
      </div>

      <div className="card" style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
        
        {/* ADD SECRET FORM */}
        {(userRole === 'admin' || userRole === 'developer') ? (
          <div style={{ flex: 1 }}>
            <h3>Create Secret</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Values are AES-256 encrypted before landing in the database.
            </p>
            <form onSubmit={handleAddSecret}>
              <div className="form-group">
                <label>Key Name</label>
                <input 
                  value={newKey} 
                  onChange={e => setNewKey(e.target.value)} 
                  placeholder="e.g. STRIPE_API_KEY" 
                />
              </div>
              <div className="form-group">
                <label>Secret Value</label>
                <input 
                  type="text" 
                  value={newValue} 
                  onChange={e => setNewValue(e.target.value)} 
                  placeholder="e.g. sk_live_12345" 
                />
              </div>
              <button className="btn btn-primary" type="submit">
                <Plus size={18} /> Add Secret
              </button>
            </form>
          </div>
        ) : (
           <div style={{ flex: 1, padding: '2rem', textAlign: 'center', background: 'var(--bg-dark)', borderRadius: '8px' }}>
              <Lock size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem' }} />
              <h3>View Only Access</h3>
              <p style={{ color: 'var(--text-muted)' }}>You do not have permission to create keys.</p>
           </div>
        )}

        {/* SECRETS LIST */}
        <div style={{ flex: 2 }}>
          <h3>Environment Variables</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Key Name</th>
                <th>Value</th>
                <th style={{ width: '160px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {secrets.length === 0 && (
                 <tr>
                   <td colSpan="3" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                     No secrets found. Add one!
                   </td>
                 </tr>
              )}
              {secrets.map(s => (
                <tr key={s._id}>
                  <td style={{ fontWeight: 500 }}>{s.keyName}</td>
                  <td>
                    {userRole === 'viewer' ? (
                       <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>[REDACTED]</span>
                    ) : (
                      <span className={visibleKeys[s._id] ? '' : 'blur-text'} style={{ fontFamily: 'monospace', letterSpacing: '1px' }}>
                         {s.value}
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                       <button className="btn-icon" onClick={() => toggleVisibility(s._id)} disabled={userRole === 'viewer'} title="Show/Hide">
                         {visibleKeys[s._id] ? <EyeOff size={18} /> : <Eye size={18} />}
                       </button>
                       {userRole === 'admin' && (
                         <>
                           <button 
                             className="btn-icon" 
                             onClick={() => handleRotate(s._id, s.keyName)} 
                             title="Rotate Secret"
                             style={{ color: rotatingId === s._id ? '#f59e0b' : undefined }}
                           >
                             <RotateCcw size={18} style={rotatingId === s._id ? { animation: 'spin 0.5s linear infinite' } : {}} />
                           </button>
                           <button 
                             className="btn-icon" 
                             onClick={() => handleDelete(s._id, s.keyName)} 
                             title="Delete Secret"
                             style={{ color: 'var(--danger)' }}
                           >
                             <Trash2 size={18} />
                           </button>
                         </>
                       )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

