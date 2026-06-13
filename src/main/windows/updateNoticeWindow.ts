import { BrowserWindow } from "electron";

export type UpdateNoticePayload = {
  localVersion: string;
  latestVersion: string;
  releaseName: string;
  patchNotesPreview: string;
  hasReleaseUrl: boolean;
};

export type UpdateNoticeAction = "download" | "patch-notes" | "later";

let updateNoticeWindow: BrowserWindow | null = null;

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildPatchNotes(preview: string): string {
  const lines = String(preview || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) return "";

  const rows = lines
    .map((line) => `<li>${escapeHtml(line.replace(/^•\s*/, ""))}</li>`)
    .join("");

  return `
    <section class="notesBlock">
      <div class="sectionTitle">
        <span class="dot"></span>
        <span>What’s new</span>
      </div>
      <ul>${rows}</ul>
    </section>
  `;
}

function buildHtml(payload: UpdateNoticePayload): string {
  const notes = buildPatchNotes(payload.patchNotesPreview);
  const releaseName = payload.releaseName ? `<div class="releaseName">${escapeHtml(payload.releaseName)}</div>` : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Rangefinder Update</title>
<style>
  :root {
    --text: rgba(255, 255, 255, 0.94);
    --muted: rgba(220, 230, 255, 0.68);
    --border: rgba(150, 190, 230, 0.22);
    --border2: rgba(150, 190, 230, 0.14);
    --blue: rgba(95, 150, 255, 0.9);
    --green: #5affaa;
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
      radial-gradient(circle at 18% 16%, rgba(90, 255, 170, 0.07), transparent 24%),
      radial-gradient(circle at 80% 0%, rgba(80, 150, 255, 0.12), transparent 30%),
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
    border: 1px solid rgba(90, 255, 170, 0.35);
    background: rgba(90, 255, 170, 0.08);
    color: var(--green);
    font-size: 17px;
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
    padding: 24px 34px;
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

  .updateOrb {
    width: 72px;
    height: 72px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(90, 255, 170, 0.35);
    background:
      radial-gradient(circle, rgba(90, 255, 170, 0.18), rgba(90, 255, 170, 0.04) 58%, rgba(90, 255, 170, 0.01));
    box-shadow: 0 0 24px rgba(90, 255, 170, 0.12);
    color: var(--green);
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

  .versionGrid {
    margin-top: 18px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .versionCard {
    border: 1px solid var(--border2);
    background: rgba(255, 255, 255, 0.035);
    border-radius: 12px;
    padding: 12px 14px;
  }

  .versionLabel {
    color: var(--muted);
    font-size: 12px;
    margin-bottom: 4px;
  }

  .versionValue {
    font-size: 18px;
    font-weight: 800;
  }

  .latest {
    color: var(--green);
  }

  .releaseName {
    margin-top: 14px;
    color: rgba(255, 255, 255, 0.88);
    font-size: 13px;
  }

  .notesBlock {
    margin-top: 16px;
    border: 1px solid var(--border2);
    background: rgba(255, 255, 255, 0.035);
    border-radius: 12px;
    padding: 14px 16px;
  }

  .sectionTitle {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--blue);
    font-size: 15px;
    font-weight: 800;
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
    margin: 6px 0;
    color: rgba(255, 255, 255, 0.86);
    font-size: 13px;
    line-height: 1.35;
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
    min-width: 130px;
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
    min-width: 150px;
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
        <div class="titleIcon">↥</div>
        <div>Rangefinder Update</div>
      </div>
      <button class="close" id="closeBtn">×</button>
    </div>

    <div class="content">
      <div class="hero">
        <div class="updateOrb">↥</div>
        <div>
          <h1>A newer version is available</h1>
          <div class="intro">A newer Rangefinder release is ready to download.</div>
        </div>
      </div>

      <div class="versionGrid">
        <div class="versionCard">
          <div class="versionLabel">Installed</div>
          <div class="versionValue">v${escapeHtml(payload.localVersion)}</div>
        </div>
        <div class="versionCard">
          <div class="versionLabel">Latest</div>
          <div class="versionValue latest">v${escapeHtml(payload.latestVersion)}</div>
        </div>
      </div>

      ${releaseName}
      ${notes}
    </div>

    <div class="footer">
      <button class="btn btnPrimary" id="downloadBtn">Download</button>
      <button class="btn" id="notesBtn">Patch Notes</button>
      <button class="btn" id="laterBtn">Later</button>
    </div>
  </div>

  <script>
    const send = (action) => {
      window.location.href = "rangefinder-update://" + action;
    };

    document.getElementById("downloadBtn").addEventListener("click", () => send("download"));
    document.getElementById("notesBtn").addEventListener("click", () => send("patch-notes"));
    document.getElementById("laterBtn").addEventListener("click", () => send("later"));
    document.getElementById("closeBtn").addEventListener("click", () => send("later"));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") send("later");
    });
  </script>
</body>
</html>`;
}

export function showUpdateNoticeWindow(payload: UpdateNoticePayload): Promise<UpdateNoticeAction> {
  return new Promise((resolve) => {
    if (updateNoticeWindow && !updateNoticeWindow.isDestroyed()) {
      updateNoticeWindow.focus();
      resolve("later");
      return;
    }

    let resolved = false;

    const finish = (action: UpdateNoticeAction) => {
      if (resolved) return;
      resolved = true;
      resolve(action);
      if (updateNoticeWindow && !updateNoticeWindow.isDestroyed()) {
        updateNoticeWindow.close();
      }
    };

    updateNoticeWindow = new BrowserWindow({
      width: 720,
      height: 520,
      minWidth: 680,
      minHeight: 480,
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

    updateNoticeWindow.once("ready-to-show", () => {
      updateNoticeWindow?.show();
      updateNoticeWindow?.focus();
    });

    updateNoticeWindow.on("closed", () => {
      updateNoticeWindow = null;
      if (!resolved) resolve("later");
    });

    updateNoticeWindow.webContents.on("will-navigate", (event, url) => {
      if (!url.startsWith("rangefinder-update://")) return;

      event.preventDefault();

      if (url === "rangefinder-update://download") {
        finish("download");
        return;
      }

      if (url === "rangefinder-update://patch-notes") {
        finish("patch-notes");
        return;
      }

      finish("later");
    });

    updateNoticeWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildHtml(payload))}`);
  });
}