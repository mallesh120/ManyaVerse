import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured } from '../config/firebase';
import { syncUserOnSignIn, syncProfilePatchToCloud } from '../services/userSyncService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [authError, setAuthError] = useState(null);
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle' | 'syncing' | 'synced' | 'error'
  const isInitialSyncingRef = useRef(false);
  const syncTimerRef = useRef(null);
  const pendingPatchRef = useRef({});

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return undefined;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      if (firebaseUser) {
        isInitialSyncingRef.current = true;
        setSyncStatus('syncing');
        try {
          await syncUserOnSignIn(firebaseUser);
          setSyncStatus('synced');
        } catch (err) {
          console.error('Cloud sync failed:', err);
          setSyncStatus('error');
        } finally {
          isInitialSyncingRef.current = false;
        }
      } else {
        setSyncStatus('idle');
      }
    });

    return () => unsubscribe();
  }, []);

  const syncProfilePatch = useCallback((patch) => {
    if (!user?.uid || isInitialSyncingRef.current) return;

    pendingPatchRef.current = {
      ...pendingPatchRef.current,
      ...patch,
    };

    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }

    syncTimerRef.current = setTimeout(async () => {
      const toSync = pendingPatchRef.current;
      pendingPatchRef.current = {};
      if (Object.keys(toSync).length === 0) return;

      setSyncStatus('syncing');
      try {
        await syncProfilePatchToCloud(user.uid, toSync);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to sync profile update:', err);
        setSyncStatus('error');
      }
    }, 600);
  }, [user]);

  // Automatically sync Sadhana and Theme updates dispatched across the app
  useEffect(() => {
    if (!user?.uid) return undefined;

    const handleSadhanaUpdate = (e) => {
      if (isInitialSyncingRef.current || !e.detail?.state) return;
      const key = e.detail.storageKey === 'divinepath_kids_sadhana_state' ? 'kidsSadhana' : 'sadhana';
      syncProfilePatch({ [key]: e.detail.state });
    };

    const handleThemeChange = (e) => {
      if (isInitialSyncingRef.current) return;
      if (e.detail === 'light' || e.detail === 'dark') {
        syncProfilePatch({ theme: e.detail });
      }
    };

    window.addEventListener('divineSadhanaUpdate', handleSadhanaUpdate);
    window.addEventListener('divineThemeChange', handleThemeChange);

    return () => {
      window.removeEventListener('divineSadhanaUpdate', handleSadhanaUpdate);
      window.removeEventListener('divineThemeChange', handleThemeChange);
    };
  }, [user, syncProfilePatch]);

  useEffect(() => () => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!isFirebaseConfigured || !auth || !googleProvider) {
      setAuthError('Firebase is not configured. Please add your Firebase keys to .env.local.');
      return null;
    }

    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    } catch (error) {
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        return null;
      }
      if (error.code === 'auth/unauthorized-domain') {
        setAuthError('This domain is not authorized in Firebase Console (Authentication → Settings → Authorized domains).');
      } else {
        setAuthError(error.message || 'Sign-in failed. Please try again.');
      }
      return null;
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!auth) return;
    setAuthError(null);
    try {
      await firebaseSignOut(auth);
      setSyncStatus('idle');
    } catch (error) {
      setAuthError(error.message || 'Failed to sign out.');
    }
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const value = {
    user,
    loading,
    authError,
    syncStatus,
    isFirebaseConfigured,
    signInWithGoogle,
    signOut,
    clearAuthError,
    syncProfilePatch,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};
