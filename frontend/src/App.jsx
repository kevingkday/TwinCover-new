import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import SystemHealthModal from './components/SystemHealthModal';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Register from './pages/Register';
import ClientsList from './pages/ClientsList';
import ClientWorkspace from './pages/ClientWorkspace';
import ProducerCopilot from './pages/ProducerCopilot';
import TemplateEditor from './pages/TemplateEditor';
import AdminDashboard from './pages/AdminDashboard';
import Profile from './pages/Profile';
import { authApi } from './api/authApi';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(authApi.isAuthenticated());
  const [currentUser, setCurrentUser] = useState(authApi.getCurrentUser());
  const [activePage, setActivePage] = useState('home'); // 'home' | 'copilot' | 'clients' | 'workspace' | 'templates' | 'admin' | 'profile' | 'login' | 'register'
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [isHealthModalOpen, setIsHealthModalOpen] = useState(false);

  useEffect(() => {
    setIsAuthenticated(authApi.isAuthenticated());
    setCurrentUser(authApi.getCurrentUser());
  }, []);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    setCurrentUser(authApi.getCurrentUser());
    setActivePage('copilot');
  };

  const handleLogout = () => {
    authApi.logout();
    window.location.reload();
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
        currentUser={currentUser}
        onDemoLoginSuccess={handleLoginSuccess}
      />

      <main className="main-content">
        {activePage === 'home' && (
          <LandingPage
            isAuthenticated={isAuthenticated}
            onLaunchWorkspace={() => setActivePage('copilot')}
            onOpenAuth={(mode) => setActivePage(mode === 'register' ? 'register' : 'login')}
            onDemoLoginSuccess={handleLoginSuccess}
          />
        )}

        {activePage === 'copilot' && isAuthenticated && (
          <ProducerCopilot initialClientId={selectedClientId} />
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

        {activePage === 'profile' && isAuthenticated && (
          <Profile
            onProfileUpdated={setCurrentUser}
            onLogout={handleLogout}
          />
        )}
      </main>

      <SystemHealthModal
        isOpen={isHealthModalOpen}
        onClose={() => setIsHealthModalOpen(false)}
      />
    </div>
  );
}
