import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import RequireAdmin from './components/RequireAdmin';
import AdminLayout from './components/AdminLayout';
import Login from './pages/Login';
import Reservas from './pages/reservas/Reservas';
import ActividadesList from './pages/actividades/ActividadesList';
import ActividadEditor from './pages/actividades/ActividadEditor';
import Pagos from './pages/Pagos';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAdmin />}>
            <Route element={<AdminLayout />}>
              <Route path="/reservas" element={<Reservas />} />
              <Route path="/actividades" element={<ActividadesList />} />
              <Route path="/actividades/:id" element={<ActividadEditor />} />
              <Route path="/pagos" element={<Pagos />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/reservas" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
