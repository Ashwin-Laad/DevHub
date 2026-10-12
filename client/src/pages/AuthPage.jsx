import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useApolloClient, useMutation } from '@apollo/client/react';
import { ArrowRight, Layers3, Sparkles } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { ErrorMessage } from '../components/Feedback.jsx';
import { LOGIN, REGISTER } from '../graphql/operations.js';

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const apollo = useApolloClient();
  const { token, establishSession } = useAuth();
  const [register, registerState] = useMutation(REGISTER);
  const [login, loginState] = useMutation(LOGIN);
  const mutationState = isRegister ? registerState : loginState;

  if (token) return <Navigate to="/" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitted(false);

    if (isRegister) {
      try {
        const result = await register({ variables: { input: { name, email, password } } });
        if (result.data?.register) {
          setSubmitted(true);
          setPassword('');
        }
      } catch {
        setSubmitted(false);
      }
      return;
    }

    try {
      const result = await login({ variables: { input: { email, password } } });
      const accessToken = result.data?.login?.token;
      if (accessToken) {
        establishSession(accessToken);
        await apollo.resetStore();
        navigate('/', { replace: true });
      }
    } catch {
      return;
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-story">
        <div className="brand-lockup">
          <span className="brand-symbol"><Layers3 size={21} /></span>
          <span>DevHub</span>
        </div>
        <div className="story-copy">
          <div className="eyebrow"><Sparkles size={14} /> BUILD IN GOOD COMPANY</div>
          <h1>Make room<br />for momentum.</h1>
          <p>A focused space for teams to shape projects, move issues forward, and keep the important details close.</p>
        </div>
        <div className="story-foot"><span>01</span><span>Organize the work. Keep the signal.</span></div>
      </section>

      <section className="auth-panel">
        <div className="auth-mobile-brand"><span className="brand-symbol"><Layers3 size={19} /></span>DevHub</div>
        <div className="auth-form-wrap">
          <div className="auth-kicker">{isRegister ? 'YOUR TEAM SPACE STARTS HERE' : 'WELCOME BACK'}</div>
          <h2>{isRegister ? 'Create your account' : 'Sign in to DevHub'}</h2>
          <p className="auth-intro">{isRegister ? 'Set up your profile to start collaborating.' : 'Pick up where your team left off.'}</p>

          {searchParams.get('registered') && !isRegister && (
            <div className="success-message" role="status">Account created. Sign in to continue.</div>
          )}
          {submitted && (
            <div className="success-message" role="status">Account created. You can sign in now.</div>
          )}
          <ErrorMessage error={mutationState.error} />

          <form className="auth-form" onSubmit={handleSubmit}>
            {isRegister && (
              <label>
                Full name
                <input autoComplete="name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Riley Chen" />
              </label>
            )}
            <label>
              Email address
              <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" />
            </label>
            <label>
              Password
              <input type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={isRegister ? 8 : undefined} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isRegister ? 'At least 8 characters' : 'Enter your password'} />
              {isRegister && <small>Use 8 or more characters.</small>}
            </label>
            <button className="button button-primary auth-submit" type="submit" disabled={mutationState.loading}>
              {mutationState.loading ? 'Working…' : isRegister ? 'Create account' : 'Sign in'}
              {!mutationState.loading && <ArrowRight size={17} />}
            </button>
          </form>
          <div className="auth-switch">
            {isRegister ? 'Already have an account?' : 'New to DevHub?'}{' '}
            <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link>
          </div>
        </div>
        <div className="auth-legal">DEVHUB <span>·</span> TEAMWORK, WITH CLARITY</div>
      </section>
    </main>
  );
}
