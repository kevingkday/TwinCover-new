import React, { useEffect, useRef, useState } from 'react';
import { authApi } from '../api/authApi';

/**
 * Renders the Google Identity Services button and exchanges the returned
 * ID token with TwinCover's `/api/auth/google` endpoint.
 */
export default function GoogleSignInButton({
  text = 'signin_with',
  agencyName,
  onSuccess,
  onError,
}) {
  const buttonRef = useRef(null);
  const agencyRef = useRef(agencyName);
  const [submitting, setSubmitting] = useState(false);

  agencyRef.current = agencyName;
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId || !buttonRef.current) return;

    let cancelled = false;
    let pollTimer = null;

    const renderGoogleButton = () => {
      if (cancelled || !window.google?.accounts?.id || !buttonRef.current) {
        return false;
      }

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          if (!response?.credential) {
            onError?.('Google sign-in did not return a credential.');
            return;
          }
          setSubmitting(true);
          try {
            await authApi.googleAuth(response.credential, agencyRef.current);
            onSuccess?.();
          } catch (err) {
            onError?.(err.message || 'Google authentication failed');
          } finally {
            setSubmitting(false);
          }
        },
      });

      buttonRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(buttonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text,
        shape: 'rectangular',
        width: buttonRef.current.offsetWidth || 360,
      });

      return true;
    };

    if (!renderGoogleButton()) {
      pollTimer = setInterval(() => {
        if (renderGoogleButton()) {
          clearInterval(pollTimer);
        }
      }, 200);
    }

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [clientId, text, onSuccess, onError]);

  if (!clientId) {
    return null;
  }

  return (
    <div style={{ width: '100%', opacity: submitting ? 0.65 : 1, pointerEvents: submitting ? 'none' : 'auto' }}>
      <div ref={buttonRef} style={{ width: '100%', display: 'flex', justifyContent: 'center', minHeight: '40px' }} />
    </div>
  );
}
