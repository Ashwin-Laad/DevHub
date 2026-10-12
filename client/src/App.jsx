import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import { useEffect } from 'react';
import { useAuth } from './auth/AuthContext.jsx';
import { LoadingState } from './components/Feedback.jsx';
import AppShell from './components/AppShell.jsx';
import AuthPage from './pages/AuthPage.jsx';
import ProjectPage from './pages/ProjectPage.jsx';
import WorkspacePage from './pages/WorkspacePage.jsx';
import { CURRENT_USER } from './graphql/operations.js';

function ProtectedLayout() {
  const { token, logout } = useAuth();
  const { data, loading, error } = useQuery(CURRENT_USER, {
    skip: !token,
    fetchPolicy: 'network-only',
  });

  useEffect(() => {
    if (token && !loading && !error && data?.currentUser === null) logout();
  }, [data, error, loading, logout, token]);

  if (!token) return <Navigate to="/login" replace />;
  
  if (loading || (!data?.currentUser && !error)) return <LoadingState label="Checking your session" />;
  if (error && !data?.currentUser) return <Navigate to="/login" replace />;
  if (!data?.currentUser) return <Navigate to="/login" replace />;

  return (
    <AppShell user={data.currentUser}>
      <Outlet context={{ user: data.currentUser }} />
    </AppShell>
  );
}

function PublicLayout() {
  const { token } = useAuth();
  return token ? <Navigate to="/" replace /> : <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
      </Route>
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<WorkspacePage />} />
        <Route path="/projects/:projectId" element={<ProjectPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
