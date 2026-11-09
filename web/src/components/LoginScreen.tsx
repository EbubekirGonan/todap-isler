import { useState, type FormEvent } from 'react';
import { ApiError, requestLoginCode, verifyLoginCode } from '../api';

type Props = {
  notice?: string;
  onSignedIn: () => void;
};

const CODE_PATTERN = /^\d{6}$/;

export function LoginScreen({ notice, onSignedIn }: Props) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(notice ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(address: string) {
    await requestLoginCode(address);
    setStep('code');
    setMessage('E-posta adresiniz kayıtlıysa giriş bağlantısı ve 6 haneli kod gönderildi.');
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await sendCode(email.trim());
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!CODE_PATTERN.test(code)) {
      setError('6 haneli kodu girin.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await verifyLoginCode(email.trim(), code);
      onSignedIn();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setError(null);
    setBusy(true);
    try {
      await sendCode(email.trim());
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  function changeEmail() {
    setStep('email');
    setCode('');
    setError(null);
    setMessage(null);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <h1 className="text-3xl font-bold text-teal-800">Todap</h1>
      <p className="mt-2 text-slate-600">Giriş için e-posta adresinizi yazın.</p>

      {step === 'email' ? (
        <form onSubmit={handleEmailSubmit} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            E-posta
            <input
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/30"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-teal-700 px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
          >
            Giriş kodu gönder
          </button>
        </form>
      ) : (
        <form onSubmit={handleCodeSubmit} className="mt-8 flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">{email}</span> adresine gelen 6 haneli kodu girin.
            Bağlantıyı e-postadan açarsanız kod girmenize gerek yoktur.
          </p>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Kod
            <input
              type="text"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-center text-2xl tracking-[0.4em] text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/30"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-teal-700 px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
          >
            Giriş yap
          </button>
          <div className="flex justify-between text-sm">
            <button type="button" onClick={handleResend} disabled={busy} className="text-teal-800 underline">
              Kodu yeniden gönder
            </button>
            <button type="button" onClick={changeEmail} className="text-teal-800 underline">
              Farklı e-posta
            </button>
          </div>
        </form>
      )}

      {message && <p className="mt-4 rounded-lg bg-teal-50 px-4 py-3 text-sm text-teal-900">{message}</p>}
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}
    </main>
  );
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.';
}
