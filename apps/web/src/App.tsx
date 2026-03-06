import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { InstanceProvider } from './context/InstanceContext';
import { ChannelProvider } from './context/ChannelContext';
import { LoginPage } from './pages/LoginPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { InstancePickerPage } from './pages/InstancePickerPage';
import { WorkspacePage } from './pages/WorkspacePage';

function ProtectedRoutes() {
  return (
    <InstanceProvider>
      <Routes>
        <Route path="/" element={<InstancePickerPage />} />
        <Route
          path="/i/:instanceId"
          element={
            <ChannelProvider>
              <WorkspacePage />
            </ChannelProvider>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </InstanceProvider>
  );
}

function AppRoutes() {
  const { user, isLoading } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        path="/*"
        element={
          isLoading ? (
            <div className="flex h-full items-center justify-center bg-surface text-muted">
              Loading...
            </div>
          ) : !user ? (
            <Navigate to="/login" replace />
          ) : (
            <ProtectedRoutes />
          )
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <div className="h-full bg-surface" data-theme="neutral">
        <AppRoutes />
      </div>
    </AuthProvider>
  );
}
