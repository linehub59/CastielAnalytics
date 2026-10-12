
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";

import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

function showStatus(message) {
  console.log("[Castiel]", message);

  const display = document.createElement("div");
  display.textContent = "Castiel: " + message;
  display.style.cssText = `
    position: fixed;
    bottom: 12px;
    left: 12px;
    z-index: 999999;
    background: #10251f;
    color: white;
    padding: 12px;
    border-radius: 8px;
    font: 13px sans-serif;
    max-width: 90%;
    overflow-wrap: anywhere;
  `;

  document.body.appendChild(display);
}

const script = document.currentScript ||
  [...document.querySelectorAll("script[data-site-id]")]
    .find(s => s.src.includes("/track.js"));

if (!script) {
  showStatus("ERROR: tracking script tag not found.");
} else {
  const siteId = script.dataset.siteId;

  const firebaseConfig = {
    apiKey: script.dataset.apiKey,
    authDomain: script.dataset.authDomain,
    projectId: script.dataset.projectId,
    appId: script.dataset.appId
  };

  if (
    !siteId ||
    !firebaseConfig.apiKey ||
    !firebaseConfig.projectId ||
    !firebaseConfig.appId
  ) {
    showStatus("ERROR: missing tracking configuration.");
  } else {
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

      showStatus("Tracker loaded. Sending test page view...");

      addDoc(collection(db, "analyticsEvents"), {
        siteId,
        eventName: "page_view",
        page,
        domain,
        visitorId: getVisitorId(),
        clientTime: Date.now(),
        createdAt: serverTimestamp()
      })
        .then((docRef) => {
          showStatus("SUCCESS: page view saved. ID: " + docRef.id);
        })
        .catch((error) => {
          showStatus(
            "WRITE FAILED: " +
            (error.code || "unknown") +
            " — " + error.message
          );

          console.error("[Castiel] Firestore write failed", error);
        });

    } catch (error) {
      showStatus(
        "STARTUP FAILED: " + error.message
      );

      console.error("[Castiel] Startup failed", error);
    }
  }
}
