import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import SystemHealthModal from './components/SystemHealthModal';
import Login from './pages/Login';
import Register from './pages/Register';
import ClientsList from './pages/ClientsList';
import ClientWorkspace from './pages/ClientWorkspace';
import TemplateEditor from './pages/TemplateEditor';
import { authApi } from './api/authApi';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(authApi.isAuthenticated());
  const [authView, setAuthView] = useState('login'); // 'login' | 'register'
  const [activePage, setActivePage] = useState('clients'); // 'clients' | 'workspace' | 'templates'
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [isHealthModalOpen, setIsHealthModalOpen] = useState(false);

  useEffect(() => {
    setIsAuthenticated(authApi.isAuthenticated());
  }, []);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    setActivePage('clients');
  };

  const handleOpenClientWorkspace = (clientId) => {
    setSelectedClientId(clientId);
    setActivePage('workspace');
  };

  if (!isAuthenticated) {
    if (authView === 'register') {
      return (
        <Register
          onRegisterSuccess={handleLoginSuccess}
          onSwitchToLogin={() => setAuthView('login')}
        />
      );
    }
    return (
      <Login
        onLoginSuccess={handleLoginSuccess}
        onSwitchToRegister={() => setAuthView('register')}
      />
    );
  }

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column' }}>
      <Navbar
        activePage={activePage}
        setActivePage={(page) => {
          setActivePage(page);
          if (page !== 'workspace') {
            setSelectedClientId(null);
          }
        }}
        onOpenHealthModal={() => setIsHealthModalOpen(true)}
      />

      <main className="main-content">
        {activePage === 'clients' && (
          <ClientsList onSelectClient={handleOpenClientWorkspace} />
        )}

        {activePage === 'workspace' && selectedClientId && (
          <ClientWorkspace
            clientId={selectedClientId}
            onBack={() => {
              setActivePage('clients');
              setSelectedClientId(null);
            }}
          />
        )}

        {activePage === 'templates' && (
          <TemplateEditor />
        )}
      </main>

      <SystemHealthModal
        isOpen={isHealthModalOpen}
        onClose={() => setIsHealthModalOpen(false)}
      />
    </div>
  );
}
