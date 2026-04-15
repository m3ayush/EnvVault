import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import AuditLogs from './pages/AuditLogs';

function App() {
  const [userRole, setUserRole] = useState('developer'); // mock auth state
  const [userId] = useState('ayushman'); // hardcoded user

  return (
    <Router>
      <div className="app-container">
        <Header userRole={userRole} setUserRole={setUserRole} />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard userRole={userRole} userId={userId} />} />
            <Route path="/audit-logs" element={<AuditLogs userRole={userRole} />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
