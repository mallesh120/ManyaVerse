import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

const STORAGE_KEYS = {
  userName: 'userName',
  theme: 'divine_path_theme',
  city: 'divine_path_selected_city',
  activePathway: 'divine_path_active_pathway',
  lastRead: 'divine_path_last_read',
  sadhana: 'divinepath_sadhana_state',
  kidsSadhana: 'divinepath_kids_sadhana_state',
};

const safeParseJSON = (raw) => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

export const collectLocalUserData = () => {
  const userName = localStorage.getItem(STORAGE_KEYS.userName) || '';
  const theme = localStorage.getItem(STORAGE_KEYS.theme) || '';
  const city = localStorage.getItem(STORAGE_KEYS.city) || '';
  const activePathway = localStorage.getItem(STORAGE_KEYS.activePathway) || '';
  const lastRead = safeParseJSON(localStorage.getItem(STORAGE_KEYS.lastRead));
  const sadhana = safeParseJSON(localStorage.getItem(STORAGE_KEYS.sadhana));
  const kidsSadhana = safeParseJSON(localStorage.getItem(STORAGE_KEYS.kidsSadhana));

  const payload = {};
  if (userName) payload.userName = userName.slice(0, 100);
  if (theme === 'light' || theme === 'dark') payload.theme = theme;
  if (city) payload.city = city.slice(0, 100);
  if (activePathway) payload.activePathway = activePathway.slice(0, 100);
  if (lastRead) payload.lastRead = lastRead;
  if (sadhana) payload.sadhana = sadhana;
  if (kidsSadhana) payload.kidsSadhana = kidsSadhana;

  return payload;
};

const mergeSadhanaStates = (localState, cloudState) => {
  if (!cloudState) return localState || null;
  if (!localState) return cloudState;

  const localScore = (localState.streak || 0) + (localState.stars || 0) + (localState.completionHistory?.length || 0);
  const cloudScore = (cloudState.streak || 0) + (cloudState.stars || 0) + (cloudState.completionHistory?.length || 0);

  const primary = cloudScore >= localScore ? cloudState : localState;
  const secondary = cloudScore >= localScore ? localState : cloudState;

  const mergedCustomGoals = Array.from(
    new Set([...(primary.customGoals || []), ...(secondary.customGoals || [])])
  );
  const mergedHistory = Array.from(
    new Set([...(primary.completionHistory || []), ...(secondary.completionHistory || [])])
  );
  const mergedGoals = {
    ...(secondary.goals || {}),
    ...(primary.goals || {}),
  };

  return {
    ...secondary,
    ...primary,
    streak: Math.max(localState.streak || 0, cloudState.streak || 0),
    stars: Math.max(localState.stars || 0, cloudState.stars || 0),
    pathwayProgress: Math.max(localState.pathwayProgress || 1, cloudState.pathwayProgress || 1),
    shlokaPracticeDays: Math.max(localState.shlokaPracticeDays || 0, cloudState.shlokaPracticeDays || 0),
    customGoals: mergedCustomGoals,
    completionHistory: mergedHistory,
    goals: mergedGoals,
  };
};

const applyDataToLocalStorage = (data) => {
  if (!data) return;

  if (data.userName) {
    localStorage.setItem(STORAGE_KEYS.userName, data.userName);
  }
  if (data.theme === 'light' || data.theme === 'dark') {
    localStorage.setItem(STORAGE_KEYS.theme, data.theme);
    window.dispatchEvent(new CustomEvent('divineThemeChange', { detail: data.theme }));
  }
  if (data.city) {
    localStorage.setItem(STORAGE_KEYS.city, data.city);
  }
  if (data.activePathway) {
    localStorage.setItem(STORAGE_KEYS.activePathway, data.activePathway);
  }
  if (data.lastRead) {
    localStorage.setItem(STORAGE_KEYS.lastRead, JSON.stringify(data.lastRead));
  }
  if (data.sadhana) {
    localStorage.setItem(STORAGE_KEYS.sadhana, JSON.stringify(data.sadhana));
    window.dispatchEvent(new CustomEvent('divineSadhanaUpdate', {
      detail: { storageKey: STORAGE_KEYS.sadhana, state: data.sadhana },
    }));
  }
  if (data.kidsSadhana) {
    localStorage.setItem(STORAGE_KEYS.kidsSadhana, JSON.stringify(data.kidsSadhana));
    window.dispatchEvent(new CustomEvent('divineSadhanaUpdate', {
      detail: { storageKey: STORAGE_KEYS.kidsSadhana, state: data.kidsSadhana },
    }));
  }

  window.dispatchEvent(new CustomEvent('divineProfileSync', { detail: data }));
};

/**
 * Syncs localStorage and Firestore on sign-in.
 * - First sign-in: migrates local progress to Firestore.
 * - Returning sign-in: merges cloud and local progress and applies locally.
 */
export const syncUserOnSignIn = async (user) => {
  if (!db || !user?.uid) return null;

  const userRef = doc(db, 'users', user.uid);
  const localData = collectLocalUserData();
  const snap = await getDoc(userRef);

  const authProfile = {
    displayName: user.displayName ? user.displayName.slice(0, 120) : null,
    email: user.email ? user.email.slice(0, 254) : null,
    photoURL: user.photoURL ? user.photoURL.slice(0, 1000) : null,
  };

  if (!snap.exists()) {
    const initialUserName = localData.userName || (user.displayName ? user.displayName.split(' ')[0].slice(0, 100) : '');
    const initialDoc = {
      ...authProfile,
      ...localData,
      ...(initialUserName ? { userName: initialUserName } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(userRef, initialDoc, { merge: true });
    if (initialUserName && !localData.userName) {
      localStorage.setItem(STORAGE_KEYS.userName, initialUserName);
      window.dispatchEvent(new CustomEvent('divineProfileSync', { detail: { userName: initialUserName } }));
    }
    return initialDoc;
  }

  const cloudData = snap.data();
  const merged = {
    ...authProfile,
    userName: cloudData.userName || localData.userName || (user.displayName ? user.displayName.split(' ')[0].slice(0, 100) : ''),
    theme: cloudData.theme || localData.theme || '',
    city: cloudData.city || localData.city || '',
    activePathway: cloudData.activePathway || localData.activePathway || '',
    lastRead: cloudData.lastRead || localData.lastRead || null,
    sadhana: mergeSadhanaStates(localData.sadhana, cloudData.sadhana),
    kidsSadhana: mergeSadhanaStates(localData.kidsSadhana, cloudData.kidsSadhana),
  };

  applyDataToLocalStorage(merged);

  const updatePayload = {
    ...authProfile,
    updatedAt: serverTimestamp(),
  };
  if (merged.userName) updatePayload.userName = merged.userName;
  if (merged.theme) updatePayload.theme = merged.theme;
  if (merged.city) updatePayload.city = merged.city;
  if (merged.activePathway) updatePayload.activePathway = merged.activePathway;
  if (merged.lastRead) updatePayload.lastRead = merged.lastRead;
  if (merged.sadhana) updatePayload.sadhana = merged.sadhana;
  if (merged.kidsSadhana) updatePayload.kidsSadhana = merged.kidsSadhana;

  await setDoc(userRef, updatePayload, { merge: true });
  return merged;
};

/**
 * Pushes a partial update to the user's Firestore document.
 */
export const syncProfilePatchToCloud = async (uid, patch) => {
  if (!db || !uid || !patch || typeof patch !== 'object') return;
  const userRef = doc(db, 'users', uid);
  await setDoc(
    userRef,
    {
      ...patch,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};
