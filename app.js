import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAzYv4xg36XM24VXo-Iz-6mvwk2TtqrGpA",
  authDomain: "drz-eu-2026.firebaseapp.com",
  projectId: "drz-eu-2026",
  storageBucket: "drz-eu-2026.firebasestorage.app",
  messagingSenderId: "239529329033",
  appId: "1:239529329033:web:2bd5e0f6819f802b026158"
};

const TRIP_ID = "europe-2026";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const authShell = document.querySelector("#auth");
const authStatus = document.querySelector("#auth-status");
const signInButton = document.querySelector("#sign-in");
const signOutButton = document.querySelector("#sign-out");
const topbar = document.querySelector("#topbar");
const syncStatus = document.querySelector("#sync-status");
const pageStyle = document.querySelector("#trip-page-style");
const appRoot = document.querySelector("#app");

let currentPageId = pageIdFromPath();
let checklistUnsubscribe = null;
let remoteItems = {};
let applyingRemote = false;

signInButton.addEventListener("click", async () => {
  setAuthStatus("Opening Google sign-in...");
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (["auth/popup-blocked", "auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(error.code)) {
      setAuthStatus("Popup did not complete. Trying redirect sign-in...");
      await signInWithRedirect(auth, provider);
      return;
    }
    setAuthStatus("Sign-in failed. Check that this Google account is on the allowed list.");
    console.error(error);
  }
});

signOutButton.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  cleanupChecklistListener();
  remoteItems = {};

  if (!user) {
    document.title = "Drazic Europe 2026";
    pageStyle.textContent = "";
    appRoot.innerHTML = "";
    appRoot.hidden = true;
    topbar.classList.remove("is-visible");
    authShell.hidden = false;
    setAuthStatus("Waiting for sign-in.");
    return;
  }

  authShell.hidden = true;
  topbar.classList.add("is-visible");
  appRoot.hidden = false;
  setSyncStatus(`Signed in as ${user.email}. Loading...`);

  try {
    await renderPage(currentPageId);
    initChecklist(currentPageId);
    setSyncStatus(`Signed in as ${user.email}. Synced.`);
  } catch (error) {
    renderError(error);
    setSyncStatus(`Signed in as ${user.email}. Could not load trip data.`);
    console.error(error);
  }
});

async function renderPage(pageId) {
  const pageRef = doc(db, "trips", TRIP_ID, "pages", pageId);
  const snapshot = await getDoc(pageRef);

  if (!snapshot.exists()) {
    throw new Error(`Missing Firestore page: ${pageId}`);
  }

  const page = snapshot.data();
  document.title = page.title || "Drazic Europe 2026";
  pageStyle.textContent = page.style || "";
  appRoot.innerHTML = page.bodyHtml || "";
  rewriteLocalLinks();
}

function initChecklist(pageId) {
  const boxes = Array.from(appRoot.querySelectorAll('input[type="checkbox"][data-check-id]'));
  if (!boxes.length) return;

  const checklistRef = doc(db, "trips", TRIP_ID, "checklists", pageId);

  checklistUnsubscribe = onSnapshot(checklistRef, (snapshot) => {
    remoteItems = snapshot.exists() ? (snapshot.data().items || {}) : {};
    applyingRemote = true;
    boxes.forEach((box) => {
      box.checked = !!remoteItems[box.dataset.checkId];
    });
    applyingRemote = false;
    setSyncStatus("Synced.");
  }, (error) => {
    setSyncStatus("Sync paused. Check your sign-in permissions.");
    console.error(error);
  });

  boxes.forEach((box) => {
    box.addEventListener("change", async () => {
      if (applyingRemote) return;
      const nextItems = {...remoteItems, [box.dataset.checkId]: box.checked};
      remoteItems = nextItems;
      setSyncStatus("Saving...");
      try {
        await setDoc(checklistRef, {
          items: nextItems,
          updatedAt: serverTimestamp()
        }, {merge: true});
        setSyncStatus("Saved.");
      } catch (error) {
        setSyncStatus("Save failed. Check your connection/sign-in.");
        box.checked = !box.checked;
        console.error(error);
      }
    });
  });
}

function rewriteLocalLinks() {
  appRoot.querySelectorAll('a[href="Adam-Europe-2026-Itinerary-detailed.html"]').forEach((link) => {
    link.setAttribute("href", "index.html");
  });
}

function cleanupChecklistListener() {
  if (checklistUnsubscribe) {
    checklistUnsubscribe();
    checklistUnsubscribe = null;
  }
}

function pageIdFromPath() {
  return window.location.pathname.endsWith("/packing.html") ? "packing" : "index";
}

function renderError(error) {
  pageStyle.textContent = "";
  appRoot.innerHTML = `<section class="page-error"><b>Could not load this page.</b><br>${escapeHtml(error.message || "Unknown error")}</section>`;
}

function setAuthStatus(message) {
  authStatus.textContent = message;
}

function setSyncStatus(message) {
  syncStatus.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
