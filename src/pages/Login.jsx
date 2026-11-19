import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../lib/auth';
import './Login.css';

export default function Login() {
  const { session, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  if (session) {
    return <Navigate to={location.state?.from ?? '/reservas'} replace />;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSending(true);
    const { error: err } = await signIn(email.trim(), password);
    setSending(false);
    if (err) {
      setError(
        err.message === 'Invalid login credentials'
          ? 'Email o contraseña incorrectos.'
          : 'No se ha podido iniciar sesión. Inténtalo de nuevo.'
      );
    }
  };

  return (
    <main className="login">
      <div className="login__photo" aria-hidden="true">
        <div className="login__photo-text">
          <p>Bélica Tours</p>
          <h1>Panel de gestión</h1>
          <span>Reservas · Actividades · Pagos</span>
        </div>
      </div>

      <div className="login__panel">
        <form className="login__card" onSubmit={onSubmit} noValidate>
          <img src="/logo.png" alt="Bélica Tours" className="login__logo" />
          <h2>Acceso privado</h2>
          <p className="login__lead">Entra con tu cuenta de administrador.</p>

          <label className="field">
            <span>Email</span>
            <input
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="field">
            <span>Contraseña</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error ? (
            <p className="alert" role="alert">
              {error}
            </p>
          ) : null}

          <button className="btn btn--primary" type="submit" disabled={sending || !email || !password}>
            <LogIn size={17} />
            {sending ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  );
}
