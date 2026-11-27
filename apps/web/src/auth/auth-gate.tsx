import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { autoSignInAvailable, autoSignInEnabled, sessionFrom, setAutoSignIn, signInAsDevUser, storedSession, supabase, supabaseConfigured, type Session } from '@/supabase';
import { ForgotScreen, LoadingScreen, MIN_PASSWORD_LENGTH, NewPasswordScreen, ResetSentScreen, SignInScreen } from './auth-screens';

type AuthState = { status: 'loading' } | { status: 'signedOut' } | { status: 'recovery' } | { status: 'signedIn'; session: Session };

interface AuthContextValue {
  email: string;
  /** Account name. Empty when there isn't one; the history screen says You. */
  name: string;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Who is signed in, and how to sign out. Only available inside `AuthGate` once someone is signed in. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth needs AuthGate');
  return value;
}

/** The signed-in account's name, or empty on the design screens, which sit outside the gate. */
export function useAccountName(): string {
  return useContext(AuthContext)?.name ?? '';
}

/** A recovery link lands on the app with `type=recovery` in the URL; the new-password screen has to win over the session it carries. */
function openedFromRecoveryLink(): boolean {
  return /[#&?]type=recovery\b/.test(window.location.hash + window.location.search);
}

function describe(error: { message: string; status?: number; code?: string }, fallback: string): string {
  if (error.code === 'invalid_credentials' || /invalid login credentials/i.test(error.message)) return 'Wrong email or password.';
  if (error.status === 429 || error.code === 'over_request_rate_limit' || error.code === 'over_email_send_rate_limit') return 'Too many tries. Wait a minute and try again.';
  if (/failed to fetch|network/i.test(error.message)) return "Can't reach the server. Check your connection.";
  return fallback;
}

/**
 * Shows the login screen until someone is signed in. Sign-ups are off on the server, so there's no
 * sign-up screen. Sessions persist and refresh on their own, so the installed app stays signed in.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [screen, setScreen] = useState<'signIn' | 'forgot' | 'sent'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    /error_code=otp_expired/.test(window.location.hash) ? 'That reset link has expired. Request a new one with Forgot password.' : null,
  );
  const recovering = useRef(openedFromRecoveryLink());

  useEffect(() => {
    if (!supabaseConfigured) return;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') recovering.current = true;
      if (recovering.current && event !== 'SIGNED_OUT') {
        setState({ status: 'recovery' });
        return;
      }
      if (session) {
        const next = sessionFrom(session.user);
        setState((prev) => (prev.status === 'signedIn' && prev.session.userId === next.userId && prev.session.email === next.email && prev.session.name === next.name ? prev : { status: 'signedIn', session: next }));
        return;
      }
      if (event === 'INITIAL_SESSION') {
        // Offline with an expired token the cached board still opens; it's read-only until the connection is back.
        const stored = storedSession();
        if (stored && !navigator.onLine) {
          setState({ status: 'signedIn', session: stored });
          return;
        }
        // Not inside the callback itself: supabase-js holds its auth lock while it runs.
        if (autoSignInEnabled()) {
          setTimeout(() => void signInAsDevUser().catch(() => setState({ status: 'signedOut' })), 0);
          return;
        }
      }
      if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') setState({ status: 'signedOut' });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    // In dev, stay signed out until asked, so the real login screen can be seen.
    if (autoSignInAvailable()) setAutoSignIn(false);
    // Offline, revoking on the server fails; the device still has to forget the session.
    const { error: failure } = await supabase.auth.signOut();
    if (failure) await supabase.auth.signOut({ scope: 'local' });
    queryClient.clear();
    window.localStorage.removeItem('board-cache');
    setPassword('');
    setScreen('signIn');
  }, [queryClient]);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    const { error: failure } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (failure) {
      setError(describe(failure, "Couldn't sign in. Try again."));
      return;
    }
    setPassword('');
  };

  const sendReset = async () => {
    setBusy(true);
    setError(null);
    const { error: failure } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    setBusy(false);
    if (failure) {
      setError(describe(failure, "Couldn't send the email. Try again."));
      return;
    }
    setScreen('sent');
  };

  const saveNewPassword = async () => {
    setBusy(true);
    setError(null);
    const { data: updated, error: failure } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (failure || !updated.user) {
      setError(failure ? describe(failure, "Couldn't save the password. Try again.") : "Couldn't save the password. Try again.");
      return;
    }
    setPassword('');
    recovering.current = false;
    // The link's tokens are in the URL; drop them so a reload doesn't reopen the recovery screen.
    window.history.replaceState(null, '', window.location.pathname);
    setState({ status: 'signedIn', session: sessionFrom(updated.user) });
  };

  const value = useMemo<AuthContextValue | null>(() => (state.status === 'signedIn' ? { email: state.session.email, name: state.session.name, signOut } : null), [state, signOut]);

  // Without a Supabase URL the app shows its own setup message instead of a login that can't work.
  if (!supabaseConfigured) return <AuthContext.Provider value={{ email: '', name: '', signOut: async () => {} }}>{children}</AuthContext.Provider>;
  if (state.status === 'loading') return <LoadingScreen />;
  if (state.status === 'signedIn' && value) return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  if (state.status === 'recovery') {
    return <NewPasswordScreen password={password} onPasswordChange={setPassword} onSubmit={() => password.length >= MIN_PASSWORD_LENGTH && void saveNewPassword()} busy={busy} error={error} />;
  }
  if (screen === 'forgot') {
    return (
      <ForgotScreen
        email={email}
        onEmailChange={setEmail}
        onSubmit={() => void sendReset()}
        onBack={() => {
          setError(null);
          setScreen('signIn');
        }}
        busy={busy}
        error={error}
      />
    );
  }
  if (screen === 'sent') return <ResetSentScreen email={email.trim()} onBack={() => setScreen('signIn')} />;
  return (
    <SignInScreen
      email={email}
      password={password}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={() => void signIn()}
      onForgot={() => {
        setError(null);
        setScreen('forgot');
      }}
      busy={busy}
      error={error}
      onDevUser={
        autoSignInAvailable()
          ? () => {
              setAutoSignIn(true);
              void signInAsDevUser().catch((e: Error) => setError(e.message));
            }
          : undefined
      }
    />
  );
}
