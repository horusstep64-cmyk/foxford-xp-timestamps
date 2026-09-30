(() => {
  "use strict";

  const PREFIX = "foxford-xp-timestamps";
  const TAB_ID = `${PREFIX}-tab`;
  const PANEL_ID = `${PREFIX}-panel`;
  const STYLE_ID = `${PREFIX}-styles`;
  const MARKER_LAYER_CLASS = `${PREFIX}-marker-layer`;
  const NATIVE_TAB_SELECTOR = '[data-testid="chat-tab"], [data-testid="events-tab"]';

  let syncQueued = false;
  let lastSignature = "";

  function parseTime(value) {
    const parts = String(value).trim().split(":").map(Number);
    if (parts.some(Number.isNaN) || parts.length < 2 || parts.length > 3) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.round(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return hours > 0
      ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function collectTasks() {
    const eventList = document.querySelector('[data-testid="events-list"]');
    if (!eventList) return [];

    return [...eventList.children].map((wrapper, index) => {
      const item = wrapper.querySelector('[class*="ListItem"]') || wrapper.firstElementChild;
      if (!item || !item.querySelector('[class*="event-task-xp"]')) return null;

      const timeNode = [...item.querySelectorAll("*")].find((element) => {
        const text = element.textContent?.trim() || "";
        return /^\d{1,2}:\d{2}(?::\d{2})?$/.test(text) && element.children.length === 0;
      });
      const timeText = timeNode?.textContent?.trim();
      const seconds = timeText ? parseTime(timeText) : null;
      if (seconds === null) return null;

      const xpText = item.querySelector('[class*="event-task-xp"]')?.textContent || "";
      const xp = xpText.match(/(\d+)\s*XP/i)?.[1] || "XP";
      const multiplier = xpText.match(/x\s*(\d+)/i)?.[1] || null;

      return {
        id: `${seconds}-${index}`,
        index,
        seconds,
        timeText: formatTime(seconds),
        xp,
        multiplier,
        source: item
      };
    }).filter(Boolean);
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${TAB_ID} {
        align-items: center;
        cursor: pointer;
        display: inline-flex;
        gap: 6px;
        user-select: none;
      }

      #${TAB_ID} .${PREFIX}-badge {
        align-items: center;
        background: #8a51e6;
        border-radius: 999px;
        color: #fff;
        display: inline-flex;
        font-size: 12px;
        font-weight: 700;
        height: 20px;
        justify-content: center;
        min-width: 20px;
        padding: 0 6px;
      }

      #${PANEL_ID} {
        background: #fff;
        box-sizing: border-box;
        color: #202124;
        height: 100%;
        min-height: 220px;
        overflow: auto;
        padding: 16px;
      }

      #${PANEL_ID}[hidden] {
        display: none !important;
      }

      .${PREFIX}-heading {
        font-size: 18px;
        font-weight: 700;
        margin: 0 0 4px;
      }

      .${PREFIX}-hint {
        color: #707581;
        font-size: 13px;
        line-height: 1.4;
        margin: 0 0 14px;
      }

      .${PREFIX}-list {
        display: grid;
        gap: 8px;
      }

      .${PREFIX}-task {
        align-items: center;
        background: #f5f1fc;
        border: 1px solid #e2d7f7;
        border-radius: 12px;
        color: #2c2340;
        cursor: pointer;
        display: grid;
        font: inherit;
        gap: 10px;
        grid-template-columns: auto 1fr auto;
        padding: 11px 12px;
        text-align: left;
        transition: background-color 120ms ease, border-color 120ms ease, transform 120ms ease;
        width: 100%;
      }

      .${PREFIX}-task:hover {
        background: #eee6fb;
        border-color: #bda4eb;
        transform: translateY(-1px);
      }

      .${PREFIX}-task:focus-visible {
        box-shadow: 0 0 0 3px rgba(138, 81, 230, 0.25);
        outline: none;
      }

      .${PREFIX}-number {
        align-items: center;
        background: #8a51e6;
        border-radius: 50%;
        color: #fff;
        display: inline-flex;
        font-size: 12px;
        font-weight: 700;
        height: 26px;
        justify-content: center;
        width: 26px;
      }

      .${PREFIX}-reward {
        color: #6f42c1;
        font-size: 13px;
        font-weight: 700;
      }

      .${PREFIX}-time {
        color: #6f42c1;
        font-variant-numeric: tabular-nums;
        font-weight: 700;
      }

      .${MARKER_LAYER_CLASS} {
        inset: 0;
        pointer-events: none;
        position: absolute;
        z-index: 4;
      }

      .${PREFIX}-marker {
        background: #8a51e6;
        border: 2px solid #fff;
        border-radius: 50%;
        box-shadow: 0 1px 5px rgba(0, 0, 0, 0.35);
        cursor: pointer;
        height: 14px;
        padding: 0;
        pointer-events: auto;
        position: absolute;
        top: 50%;
        transform: translate(-50%, -50%);
        transition: transform 120ms ease, background-color 120ms ease;
        width: 14px;
      }

      .${PREFIX}-marker:hover,
      .${PREFIX}-marker:focus-visible {
        background: #ff8a00;
        outline: none;
        transform: translate(-50%, -50%) scale(1.35);
      }
    `;
    document.head.append(style);
  }

  function getNativePanels(tabMenu) {
    const root = tabMenu?.parentElement;
    if (!root) return [];
    return [...root.children].filter((child) =>
      child !== document.getElementById(PANEL_ID)
      && child.matches?.(".ui.bottom.attached.segment")
    );
  }

  function hideTaskPanel() {
    const panel = document.getElementById(PANEL_ID);
    const tab = document.getElementById(TAB_ID);
    if (!panel || !tab) return;

    panel.hidden = true;
    tab.classList.remove("active");
    for (const nativePanel of getNativePanels(tab.parentElement)) {
      nativePanel.style.removeProperty("display");
    }
  }

  function showTaskPanel() {
    const panel = document.getElementById(PANEL_ID);
    const tab = document.getElementById(TAB_ID);
    if (!panel || !tab) return;

    document.querySelectorAll(NATIVE_TAB_SELECTOR).forEach((nativeTab) => {
      nativeTab.classList.remove("active");
    });
    for (const nativePanel of getNativePanels(tab.parentElement)) {
      nativePanel.style.setProperty("display", "none", "important");
    }
    tab.classList.add("active");
    panel.hidden = false;
  }

  function seekToTask(task) {
    const latestTask = collectTasks().find((candidate) => candidate.seconds === task.seconds);
    latestTask?.source?.click();

    const video = document.querySelector("video");
    if (video && Number.isFinite(video.duration)) {
      video.currentTime = Math.min(task.seconds + 0.05, video.duration);
    }

    document.querySelectorAll('[data-testid="player-timeline-slider"]').forEach((slider) => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(slider, String(task.seconds));
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function makeTaskButton(task, ordinal) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `${PREFIX}-task`;
    button.title = `Перейти к заданию на ${task.timeText}`;
    button.innerHTML = `
      <span class="${PREFIX}-number">${ordinal}</span>
      <span>
        <strong>XP-задание</strong><br>
        <span class="${PREFIX}-reward">${task.xp} XP${task.multiplier ? ` · x${task.multiplier}` : ""}</span>
      </span>
      <span class="${PREFIX}-time">${task.timeText}</span>
    `;
    button.addEventListener("click", () => seekToTask(task));
    return button;
  }

  function renderPanel(tasks) {
    const panel = document.getElementById(PANEL_ID);
    const badge = document.querySelector(`#${TAB_ID} .${PREFIX}-badge`);
    if (!panel || !badge) return;

    badge.textContent = String(tasks.length);
    panel.replaceChildren();

    const heading = document.createElement("h3");
    heading.className = `${PREFIX}-heading`;
    heading.textContent = `XP-задания: ${tasks.length}`;

    const hint = document.createElement("p");
    hint.className = `${PREFIX}-hint`;
    hint.textContent = "Нажмите на таймкод, чтобы перейти к заданию в записи.";

    const list = document.createElement("div");
    list.className = `${PREFIX}-list`;
    tasks.forEach((task, index) => list.append(makeTaskButton(task, index + 1)));

    panel.append(heading, hint, list);
  }

  function ensurePanel(tasks) {
    const eventsTab = document.querySelector('[data-testid="events-tab"]');
    const tabMenu = eventsTab?.parentElement;
    if (!eventsTab || !tabMenu) return false;

    let tab = document.getElementById(TAB_ID);
    if (!tab) {
      tab = document.createElement("a");
      tab.id = TAB_ID;
      tab.className = eventsTab.className.replace(/\bactive\b/g, "").trim();
      tab.setAttribute("role", "button");
      tab.setAttribute("tabindex", "0");
      tab.innerHTML = `⚡ XP <span class="${PREFIX}-badge">${tasks.length}</span>`;
      tab.addEventListener("click", showTaskPanel);
      tab.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        showTaskPanel();
      });
      tabMenu.append(tab);
    }

    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("div");
      panel.id = PANEL_ID;
      panel.className = "ui bottom attached segment tab";
      panel.hidden = true;
      tabMenu.parentElement?.append(panel);
    }

    document.querySelectorAll(NATIVE_TAB_SELECTOR).forEach((nativeTab) => {
      if (nativeTab.dataset.foxfordXpBound === "true") return;
      nativeTab.dataset.foxfordXpBound = "true";
      nativeTab.addEventListener("click", hideTaskPanel, true);
    });

    renderPanel(tasks);
    return true;
  }

  function renderMarkers(tasks) {
    document.querySelectorAll(`.${MARKER_LAYER_CLASS}`).forEach((layer) => layer.remove());

    document.querySelectorAll('[data-testid="player-timeline-slider"]').forEach((slider) => {
      const max = Number(slider.max);
      const parent = slider.parentElement;
      if (!parent || !Number.isFinite(max) || max <= 0) return;

      const parentStyle = getComputedStyle(parent);
      if (parentStyle.position === "static") parent.style.position = "relative";

      const sliderRect = slider.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      const layer = document.createElement("div");
      layer.className = MARKER_LAYER_CLASS;

      tasks.forEach((task, index) => {
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = `${PREFIX}-marker`;
        marker.style.left = `${sliderRect.left - parentRect.left + (task.seconds / max) * sliderRect.width}px`;
        marker.title = `Задание ${index + 1}: ${task.timeText}, ${task.xp} XP${task.multiplier ? ` x${task.multiplier}` : ""}`;
        marker.setAttribute("aria-label", marker.title);
        marker.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          seekToTask(task);
        });
        layer.append(marker);
      });

      parent.append(layer);
    });
  }

  function sync() {
    syncQueued = false;
    const tasks = collectTasks();
    if (tasks.length === 0) return;

    ensureStyles();
    const signature = tasks.map((task) => `${task.seconds}:${task.xp}:${task.multiplier || ""}`).join("|");
    const uiMissing = !document.getElementById(TAB_ID)
      || !document.getElementById(PANEL_ID)
      || !document.querySelector(`.${MARKER_LAYER_CLASS}`);

    if (signature === lastSignature && !uiMissing) return;
    if (!ensurePanel(tasks)) return;
    renderMarkers(tasks);
    lastSignature = signature;
  }

  function queueSync() {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(sync);
  }

  const observer = new MutationObserver(queueSync);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("resize", queueSync, { passive: true });
  queueSync();
})();
