import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import SystemHealthModal from './components/SystemHealthModal';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Register from './pages/Register';
import ClientsList from './pages/ClientsList';
import ClientWorkspace from './pages/ClientWorkspace';
import TemplateEditor from './pages/TemplateEditor';
import AdminDashboard from './pages/AdminDashboard';
import { authApi } from './api/authApi';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(authApi.isAuthenticated());
  const [activePage, setActivePage] = useState('home'); // 'home' | 'clients' | 'workspace' | 'templates' | 'admin' | 'login' | 'register'
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
        isAuthenticated={isAuthenticated}
        onDemoLoginSuccess={handleLoginSuccess}
      />

      <main className="main-content">
        {activePage === 'home' && (
          <LandingPage
            isAuthenticated={isAuthenticated}
            onLaunchWorkspace={() => setActivePage('clients')}
            onOpenAuth={(mode) => setActivePage(mode === 'register' ? 'register' : 'login')}
            onDemoLoginSuccess={handleLoginSuccess}
          />
        )}

        {activePage === 'login' && (
          <Login
            onLoginSuccess={handleLoginSuccess}
            onSwitchToRegister={() => setActivePage('register')}
          />
        )}

        {activePage === 'register' && (
          <Register
            onRegisterSuccess={handleLoginSuccess}
            onSwitchToLogin={() => setActivePage('login')}
          />
        )}

        {activePage === 'clients' && isAuthenticated && (
          <ClientsList onSelectClient={handleOpenClientWorkspace} />
        )}

        {activePage === 'workspace' && isAuthenticated && selectedClientId && (
          <ClientWorkspace
            clientId={selectedClientId}
            onBack={() => {
              setActivePage('clients');
              setSelectedClientId(null);
            }}
          />
        )}

        {activePage === 'templates' && isAuthenticated && (
          <TemplateEditor />
        )}

        {activePage === 'admin' && isAuthenticated && (
          <AdminDashboard />
        )}
      </main>

      <SystemHealthModal
        isOpen={isHealthModalOpen}
        onClose={() => setIsHealthModalOpen(false)}
      />
    </div>
  );
}
