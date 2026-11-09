import { useEffect, useRef, useState } from 'react';
import { getCurrentUser, verifyLoginLink, type CurrentUser } from './api';
import { AppShell } from './components/AppShell';
import { LoginScreen } from './components/LoginScreen';
import { Spinner } from './components/Spinner';

type Session =
  | { status: 'anonymous'; notice?: string }
  | { status: 'signed-in'; user: CurrentUser };

const LINK_EXPIRED_MESSAGE = 'Bağlantının süresi dolmuş ya da daha önce kullanılmış. Yeni bir kod isteyin.';

// E-postadaki bağlantı token'ı #token= parçasında gelir; token sunucuya gider ve adres çubuğundan hemen silinir.
async function consumeLoginLinkFromHash(): Promise<string | undefined> {
  const match = /^#token=([^&]+)$/.exec(window.location.hash);
  if (!match) {
    return undefined;
  }
  window.history.replaceState(null, '', window.location.pathname);
  try {
    await verifyLoginLink(decodeURIComponent(match[1]));
    return undefined;
  } catch {
    return LINK_EXPIRED_MESSAGE;
  }
}

async function loadSession(): Promise<Session> {
  const linkNotice = await consumeLoginLinkFromHash();
  const user = await getCurrentUser().catch(() => null);
  return user ? { status: 'signed-in', user } : { status: 'anonymous', notice: linkNotice };
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  // StrictMode geliştirmede etkileri iki kez çalıştırır; başlangıç isteği yalnızca bir kez yapılsın diye saklanır.
  const bootRef = useRef<Promise<Session> | null>(null);

  useEffect(() => {
    let cancelled = false;
    bootRef.current ??= loadSession();
    bootRef.current.then((next) => {
      if (!cancelled) setSession(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSignedIn() {
    const user = await getCurrentUser().catch(() => null);
    setSession(user ? { status: 'signed-in', user } : { status: 'anonymous', notice: 'Oturum açılamadı. Tekrar deneyin.' });
  }

  if (session === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (session.status === 'anonymous') {
    return <LoginScreen notice={session.notice} onSignedIn={handleSignedIn} />;
  }

  return (
    <AppShell
      user={session.user}
      onSignedOut={() => setSession({ status: 'anonymous', notice: 'Oturumunuz kapatıldı.' })}
    />
  );
}
