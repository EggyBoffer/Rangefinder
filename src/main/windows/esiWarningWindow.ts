import { BrowserWindow } from "electron";

export type EsiWarningCharacter = {
  characterId: number;
  characterName: string;
  authStatus?: "unknown" | "valid" | "expired";
  authMessage?: string;
};

export type EsiWarningPayload = {
  characters: EsiWarningCharacter[];
};

let esiWarningWindow: BrowserWindow | null = null;

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildList(title: string, items: EsiWarningCharacter[], kind: "expired" | "unknown"): string {
  if (!items.length) return "";

  const rows = items
    .map((c) => {
      const name = escapeHtml(c.characterName || `Character ${c.characterId}`);
      const msg = escapeHtml(c.authMessage || "");
      const detail = msg ? `<div class="itemDetail">${msg}</div>` : "";
      return `<li><span>${name}</span>${detail}</li>`;
    })
    .join("");

  return `
    <section class="issueBlock ${kind}">
      <div class="issueTitle">
        <span class="dot"></span>
        <span>${escapeHtml(title)}</span>
      </div>
      <ul>${rows}</ul>
    </section>
  `;
}

function buildHtml(payload: EsiWarningPayload): string {
  const expired = payload.characters.filter((c) => c.authStatus === "expired");
  const unknown = payload.characters.filter((c) => c.authStatus === "unknown");

  const expiredBlock = buildList("Expired or revoked", expired, "expired");
  const unknownBlock = buildList("Could not be checked", unknown, "unknown");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Rangefinder ESI Warning</title>
<style>
  :root {
    --bg: #07101b;
    --text: rgba(255, 255, 255, 0.94);
    --muted: rgba(220, 230, 255, 0.68);
    --border: rgba(150, 190, 230, 0.22);
    --border2: rgba(150, 190, 230, 0.14);
    --blue: rgba(95, 150, 255, 0.9);
    --yellow: #ffd34d;
    --red: #ff6b5f;
    --unknown: #ffbd59;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: transparent;
    color: var(--text);
    font-family: Arial, sans-serif;
  }

  body {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal {
    width: calc(100vw - 20px);
    height: calc(100vh - 20px);
    border: 1px solid var(--border);
    border-radius: 16px;
    background:
      radial-gradient(circle at 18% 16%, rgba(255, 202, 74, 0.07), transparent 24%),
      radial-gradient(circle at 80% 0%, rgba(80, 150, 255, 0.11), transparent 30%),
      linear-gradient(135deg, rgba(12, 24, 38, 0.98), rgba(3, 10, 18, 0.98));
    box-shadow:
      0 20px 55px rgba(0, 0, 0, 0.62),
      inset 0 0 0 1px rgba(255, 255, 255, 0.035);
    overflow: hidden;
  }

  .titlebar {
    height: 54px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    border-bottom: 1px solid var(--border2);
    background: rgba(255, 255, 255, 0.03);
    -webkit-app-region: drag;
  }

  .title {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 16px;
    font-weight: 800;
    letter-spacing: 0.2px;
  }

  .titleIcon {
    width: 30px;
    height: 30px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255, 211, 77, 0.35);
    background: rgba(255, 211, 77, 0.08);
    color: var(--yellow);
    font-size: 18px;
  }

  .close {
    width: 34px;
    height: 34px;
    border: 0;
    background: transparent;
    color: rgba(255, 255, 255, 0.72);
    font-size: 28px;
    line-height: 28px;
    cursor: pointer;
    -webkit-app-region: no-drag;
  }

  .close:hover {
    color: white;
  }

  .content {
    height: calc(100% - 54px - 68px);
    padding: 22px 34px;
    overflow: hidden;
  }

  .hero {
    display: grid;
    grid-template-columns: 78px 1fr;
    gap: 22px;
    align-items: center;
    padding-bottom: 20px;
    border-bottom: 1px solid var(--border2);
  }

  .warningOrb {
    width: 72px;
    height: 72px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255, 211, 77, 0.35);
    background:
      radial-gradient(circle, rgba(255, 211, 77, 0.2), rgba(255, 211, 77, 0.04) 58%, rgba(255, 211, 77, 0.01));
    box-shadow: 0 0 24px rgba(255, 184, 53, 0.15);
    color: var(--yellow);
    font-size: 34px;
  }

  h1 {
    margin: 0;
    font-size: 22px;
    line-height: 1.15;
    letter-spacing: 0.2px;
  }

  .intro {
    margin-top: 8px;
    max-width: 590px;
    color: var(--muted);
    font-size: 14px;
    line-height: 1.4;
  }

  .issues {
    padding: 18px 0;
    display: grid;
    gap: 14px;
    border-bottom: 1px solid var(--border2);
  }

  .issueBlock {
    border: 1px solid var(--border2);
    background: rgba(255, 255, 255, 0.035);
    border-radius: 12px;
    padding: 14px 16px;
  }

  .issueTitle {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 15px;
    font-weight: 800;
  }

  .expired .issueTitle {
    color: var(--red);
  }

  .unknown .issueTitle {
    color: var(--unknown);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: currentColor;
    box-shadow: 0 0 12px currentColor;
  }

  ul {
    margin: 10px 0 0 20px;
    padding: 0;
  }

  li {
    margin: 8px 0;
    color: rgba(255, 255, 255, 0.9);
    font-size: 14px;
  }

  .itemDetail {
    margin-top: 3px;
    color: var(--muted);
    font-size: 12px;
  }

  .hint {
    margin-top: 18px;
    display: grid;
    grid-template-columns: 30px 1fr;
    gap: 12px;
    align-items: start;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }

  .infoIcon {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    border: 1px solid rgba(95, 150, 255, 0.65);
    color: rgba(140, 180, 255, 0.95);
    background: rgba(95, 150, 255, 0.1);
    font-size: 13px;
    font-weight: 800;
  }

  .footer {
    height: 68px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    padding: 0 24px;
    border-top: 1px solid var(--border2);
    background: rgba(255, 255, 255, 0.025);
  }

  .btn {
    height: 38px;
    min-width: 140px;
    border-radius: 11px;
    border: 1px solid var(--border);
    background: rgba(255, 255, 255, 0.055);
    color: var(--text);
    font-size: 14px;
    cursor: pointer;
  }

  .btn:hover {
    background: rgba(255, 255, 255, 0.085);
  }

  .btnPrimary {
    min-width: 170px;
    border-color: rgba(95, 150, 255, 0.75);
    background: linear-gradient(180deg, rgba(95, 150, 255, 0.24), rgba(95, 150, 255, 0.11));
    box-shadow: 0 0 18px rgba(95, 150, 255, 0.12);
  }

  .btnPrimary:hover {
    background: linear-gradient(180deg, rgba(95, 150, 255, 0.34), rgba(95, 150, 255, 0.15));
  }
</style>
</head>
<body>
  <div class="modal">
    <div class="titlebar">
      <div class="title">
        <div class="titleIcon">⚠</div>
        <div>Rangefinder ESI Warning</div>
      </div>
      <button class="close" id="closeBtn">×</button>
    </div>

    <div class="content">
      <div class="hero">
        <div class="warningOrb">⚠</div>
        <div>
          <h1>ESI character check found an issue</h1>
          <div class="intro">Rangefinder checked your linked ESI characters on launch and found an issue.</div>
        </div>
      </div>

      <div class="issues">
        ${expiredBlock}
        ${unknownBlock}
      </div>

      <div class="hint">
        <div class="infoIcon">i</div>
        <div>Open Settings and use Check ESI Keys, or remove and re-add any expired characters.</div>
      </div>
    </div>

    <div class="footer">
      <button class="btn btnPrimary" id="openSettingsBtn">Open Settings</button>
      <button class="btn" id="dismissBtn">Dismiss</button>
    </div>
  </div>

  <script>
    const send = (action) => {
      window.location.href = "rangefinder-esi-warning://" + action;
    };

    document.getElementById("openSettingsBtn").addEventListener("click", () => send("open-settings"));
    document.getElementById("dismissBtn").addEventListener("click", () => send("dismiss"));
    document.getElementById("closeBtn").addEventListener("click", () => send("dismiss"));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") send("dismiss");
    });
  </script>
</body>
</html>`;
}

export function showEsiWarningWindow(payload: EsiWarningPayload, onOpenSettings: () => void): void {
  const issueCharacters = payload.characters.filter((c) => c.authStatus === "expired" || c.authStatus === "unknown");
  if (!issueCharacters.length) return;

  if (esiWarningWindow && !esiWarningWindow.isDestroyed()) {
    esiWarningWindow.focus();
    return;
  }

  esiWarningWindow = new BrowserWindow({
    width: 760,
    height: 500,
    minWidth: 700,
    minHeight: 460,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  esiWarningWindow.once("ready-to-show", () => {
    esiWarningWindow?.show();
    esiWarningWindow?.focus();
  });

  esiWarningWindow.on("closed", () => {
    esiWarningWindow = null;
  });

  esiWarningWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("rangefinder-esi-warning://")) return;

    event.preventDefault();

    if (url === "rangefinder-esi-warning://open-settings") {
      onOpenSettings();
    }

    if (esiWarningWindow && !esiWarningWindow.isDestroyed()) {
      esiWarningWindow.close();
    }
  });

  esiWarningWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildHtml({ characters: issueCharacters }))}`);
}