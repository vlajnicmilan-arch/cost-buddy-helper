import { useEffect } from 'react';

const NATIVE_CALLBACK = 'app.lovable.costbuddy://auth/callback';

const NativeOAuthCallback = () => {
  useEffect(() => {
    const target = `${NATIVE_CALLBACK}${window.location.search || ''}${window.location.hash || ''}`;
    window.location.replace(target);
  }, []);

  return <div className="min-h-dvh bg-background" aria-hidden="true" />;
};

export default NativeOAuthCallback;