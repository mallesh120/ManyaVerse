import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import './AuthButton.css';

const GoogleIcon = () => (
  <svg className="auth-google-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
    />
  </svg>
);

const AuthButton = () => {
  const {
    user,
    loading,
    authError,
    syncStatus,
    signInWithGoogle,
    signOut,
    clearAuthError,
  } = useAuth();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    setAvatarError(false);
  }, [user?.photoURL]);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!isMenuOpen) return undefined;

    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  // Close modal on Escape
  useEffect(() => {
    if (!isModalOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
        clearAuthError();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, clearAuthError]);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    const signedInUser = await signInWithGoogle();
    setIsSigningIn(false);
    if (signedInUser) {
      setIsModalOpen(false);
    }
  };

  const handleSignOut = async () => {
    setIsMenuOpen(false);
    await signOut();
  };

  const openModal = () => {
    clearAuthError();
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    clearAuthError();
  };

  if (loading) {
    return <div className="auth-btn-skeleton" aria-hidden="true" />;
  }

  if (user) {
    const initial = (user.displayName || user.email || 'U').charAt(0).toUpperCase();
    const syncLabel =
      syncStatus === 'syncing'
        ? 'Syncing progress...'
        : syncStatus === 'synced'
          ? 'Synced to cloud'
          : syncStatus === 'error'
            ? 'Local only (sync paused)'
            : 'Signed in';

    return (
      <div className="auth-user-menu" ref={menuRef}>
        <button
          type="button"
          className="auth-avatar-btn"
          onClick={() => setIsMenuOpen((prev) => !prev)}
          aria-label="Account menu"
          aria-expanded={isMenuOpen}
          title={user.displayName || user.email || 'Account'}
        >
          {user.photoURL && !avatarError ? (
            <img
              src={user.photoURL}
              alt={user.displayName || 'User avatar'}
              className="auth-avatar-img"
              referrerPolicy="no-referrer"
              onError={() => setAvatarError(true)}
            />
          ) : (
            <span className="auth-avatar-initial">{initial}</span>
          )}
          <span
            className={`auth-sync-dot auth-sync-dot--${syncStatus}`}
            aria-hidden="true"
          />
        </button>

        {isMenuOpen && (
          <div className="auth-dropdown" role="menu">
            <div className="auth-dropdown-header">
              <p className="auth-dropdown-name">{user.displayName || 'Devotee'}</p>
              {user.email && <p className="auth-dropdown-email">{user.email}</p>}
              <div className={`auth-sync-badge auth-sync-badge--${syncStatus}`}>
                <span className="auth-sync-badge-dot" />
                {syncLabel}
              </div>
            </div>
            <div className="auth-dropdown-divider" />
            <button
              type="button"
              className="auth-dropdown-item auth-dropdown-signout"
              onClick={handleSignOut}
              role="menuitem"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="auth-signin-nav-btn"
        onClick={openModal}
        aria-label="Sign in to sync progress"
      >
        Sign In
      </button>

      {isModalOpen &&
        createPortal(
          <div
            className="auth-modal-backdrop"
            onClick={closeModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
          >
            <div
              className="auth-modal-card"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="auth-modal-close"
                onClick={closeModal}
                aria-label="Close sign in dialog"
              >
                ×
              </button>

              <div className="auth-modal-emblem" aria-hidden="true">ॐ</div>
              <h2 id="auth-modal-title" className="auth-modal-title">
                Sign in to ManyaVerse
              </h2>
              <p className="auth-modal-subtitle">
                Keep your daily Sadhana streaks, custom goals, learning pathway, and preferences synced across all your devices.
              </p>

              {authError && (
                <div className="auth-modal-error" role="alert">
                  {authError}
                </div>
              )}

              <button
                type="button"
                className="auth-google-btn"
                onClick={handleGoogleSignIn}
                disabled={isSigningIn}
              >
                <GoogleIcon />
                <span>{isSigningIn ? 'Signing in...' : 'Continue with Google'}</span>
              </button>

              <button
                type="button"
                className="auth-guest-btn"
                onClick={closeModal}
                disabled={isSigningIn}
              >
                Continue as Guest
              </button>

              <p className="auth-modal-footnote">
                Your existing local progress will automatically merge into your account on first sign-in.
              </p>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default AuthButton;
