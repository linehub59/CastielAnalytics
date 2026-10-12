
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";

import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

const script = document.currentScript ||
  [...document.querySelectorAll("script[data-site-id]")]
    .find(s => s.src.includes("/track.js"));

if (script) {
  const siteId = script.dataset.siteId;

  const firebaseConfig = {
    apiKey: script.dataset.apiKey,
    authDomain: script.dataset.authDomain,
    projectId: script.dataset.projectId,
    appId: script.dataset.appId
  };

  if (
    siteId &&
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  ) {
    try {
      const app = initializeApp(
        firebaseConfig,
        `castiel-tracker-${siteId}`
      );

      const db = getFirestore(app);

      const domain = location.hostname
        .toLowerCase()
        .replace(/^www\./, "");

      const page = (
        location.pathname + location.search
      ).slice(0, 500);

      function getVisitorId() {
        const key = "castiel_visitor_id_v1";

        try {
          let id = localStorage.getItem(key);

          if (!id) {
            id = "v_" + (
              crypto.randomUUID
                ? crypto.randomUUID()
                : Date.now() + "_" +
                  Math.random().toString(36).slice(2)
            );

            localStorage.setItem(key, id);
          }

          return id;
        } catch {
          return "session_" + Date.now() + "_" +
            Math.random().toString(36).slice(2);
        }
      }

      addDoc(collection(db, "analyticsEvents"), {
        siteId,
        eventName: "page_view",
        page,
        domain,
        visitorId: getVisitorId(),
        clientTime: Date.now(),
        createdAt: serverTimestamp()
      }).catch(() => {
        // Analytics failures should not interrupt the website.
      });

    } catch (error) {
      console.warn("Castiel tracker could not start.", error);
    }
  }
}
