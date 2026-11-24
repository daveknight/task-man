import { APP_NAME } from '@app/core';
import type { FormEvent, ReactNode } from 'react';
import { RowList } from '@/components/board/board-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** A borderless field inside a grouped list, like the rows on the board. */
const FIELD = 'h-row rounded-[inherit] border-0 bg-transparent px-row-x text-body shadow-none focus-visible:ring-inset dark:bg-transparent';

function AuthPage({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-row-x pt-[env(safe-area-inset-top)] pb-[max(2rem,env(safe-area-inset-bottom))]"
      data-slot="auth-page"
    >
      <p className="text-subhead font-semibold text-muted-foreground">{APP_NAME}</p>
      <h1 className="text-large-title font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-body text-muted-foreground">{subtitle}</p>}
      <div className="mt-6 flex flex-col gap-3">{children}</div>
    </main>
  );
}

function ErrorRow({ message }: { message: string }) {
  return (
    <p role="alert" className="px-row-x py-2.5 text-footnote text-destructive" data-slot="auth-error">
      {message}
    </p>
  );
}

function submit(handler: () => void) {
  return (event: FormEvent) => {
    event.preventDefault();
    handler();
  };
}

export interface SignInProps {
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  onForgot: () => void;
  busy?: boolean;
  error?: string | null;
  /** Local development only: sign in as the seeded dev user. */
  onDevUser?: () => void;
}

export function SignInScreen({ email, password, onEmailChange, onPasswordChange, onSubmit, onForgot, busy, error, onDevUser }: SignInProps) {
  return (
    <AuthPage title="Sign in">
      <form className="flex flex-col gap-3" onSubmit={submit(onSubmit)} noValidate>
        <RowList fields flush>
          <div>
            <Input
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Email"
              aria-label="Email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              className={FIELD}
            />
          </div>
          <div>
            <Input
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="Password"
              aria-label="Password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              className={FIELD}
            />
          </div>
          {error && <ErrorRow message={error} />}
        </RowList>
        <Button type="submit" className="h-control" disabled={busy || !email.trim() || !password}>
          Sign in
        </Button>
      </form>
      <Button type="button" variant="ghost" className="h-control text-link" onClick={onForgot}>
        Forgot password?
      </Button>
      {onDevUser && (
        <Button type="button" variant="ghost" className="h-control text-xs text-muted-foreground" onClick={onDevUser}>
          Use the local dev user
        </Button>
      )}
    </AuthPage>
  );
}

export interface ForgotProps {
  email: string;
  onEmailChange: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  busy?: boolean;
  error?: string | null;
}

export function ForgotScreen({ email, onEmailChange, onSubmit, onBack, busy, error }: ForgotProps) {
  return (
    <AuthPage title="Reset password" subtitle="We'll email you a link to choose a new one.">
      <form className="flex flex-col gap-3" onSubmit={submit(onSubmit)} noValidate>
        <RowList fields flush>
          <div>
            <Input
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Email"
              aria-label="Email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              className={FIELD}
            />
          </div>
          {error && <ErrorRow message={error} />}
        </RowList>
        <Button type="submit" className="h-control" disabled={busy || !email.trim()}>
          Send reset link
        </Button>
      </form>
      <Button type="button" variant="ghost" className="h-control text-link" onClick={onBack}>
        Back to sign in
      </Button>
    </AuthPage>
  );
}

export function ResetSentScreen({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <AuthPage title="Check your email" subtitle={email ? `If ${email} has an account, a reset link is on its way.` : 'If that email has an account, a reset link is on its way.'}>
      <Button type="button" variant="ghost" className="h-control text-link" onClick={onBack}>
        Back to sign in
      </Button>
    </AuthPage>
  );
}

export interface NewPasswordProps {
  password: string;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  busy?: boolean;
  error?: string | null;
}

export const MIN_PASSWORD_LENGTH = 8;

export function NewPasswordScreen({ password, onPasswordChange, onSubmit, busy, error }: NewPasswordProps) {
  return (
    <AuthPage title="New password" subtitle={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
      <form className="flex flex-col gap-3" onSubmit={submit(onSubmit)} noValidate>
        <RowList fields flush>
          <div>
            <Input
              type="password"
              name="new-password"
              autoComplete="new-password"
              placeholder="New password"
              aria-label="New password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              className={FIELD}
            />
          </div>
          {error && <ErrorRow message={error} />}
        </RowList>
        <Button type="submit" className="h-control" disabled={busy || password.length < MIN_PASSWORD_LENGTH}>
          Save password
        </Button>
      </form>
    </AuthPage>
  );
}

export function LoadingScreen() {
  return <div className="min-h-dvh bg-background" role="status" aria-label="Loading" data-slot="auth-loading" />;
}
