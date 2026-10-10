// content.js

const PANEL_ID = "yadisk-save-root-panel";
const AUTO_CLOSE_DELAY = 10_000;

let alreadyShownForCurrentDialog = false;

function getPathSegmentsFromUrl(urlStr) {
  try {
    const url = new URL(urlStr);

    const allowedHosts = [
      "disk.yandex.ru",
      "disk.yandex.com",
      "disk.360.yandex.ru",
      "yadi.sk",
    ];

    if (!allowedHosts.includes(url.hostname)) {
      return null;
    }

    const marker = "/client/disk";
    const index = url.pathname.indexOf(marker);

    if (index === -1) {
      return null;
    }

    let rest = url.pathname.slice(index + marker.length);
    rest = rest.replace(/^\/+/, "").replace(/\/+$/, "");

    if (!rest) {
      return [];
    }

    return rest.split("/").map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }
}

function getSelectedFolderName() {
  // В Яндекс.Диске выделенная папка может оставаться в списке,
  // пока окно «Поделиться» открыто. Ищем именно выбранный элемент,
  // а не полагаемся только на URL текущей открытой папки.
  const selectedRowSelectors = [
    '[data-qa="resource"][aria-selected="true"]',
    '[data-qa="resource-item"][aria-selected="true"]',
    '[data-qa*="resource"][aria-selected="true"]',
    '[class*="listing-item_selected"]',
    '[class*="resource-item_selected"]',
    '[aria-selected="true"]',
  ];

  for (const selector of selectedRowSelectors) {
    const selected = document.querySelector(selector);
    if (!selected || selected.closest(`#${PANEL_ID}`)) continue;

    const nameElement = selected.matches('[data-qa="resource-name"]')
      ? selected
      : selected.querySelector(
          '[data-qa="resource-name"], [data-testid="resource-name"], [class*="resource-name"], [class*="listing-item__title"]'
        );

    const name = (nameElement?.textContent || "").trim();
    if (name) return name;
  }

  // Резервный вариант для версий интерфейса, где имя ресурса
  // помечено data-qa, но строка не имеет aria-selected.
  const activeName = document.querySelector(
    '[data-qa="resource-name"][aria-selected="true"]'
  );
  const name = (activeName?.textContent || "").trim();
  return name || null;
}

function getCurrentFolderData() {
  const urlSegments = getPathSegmentsFromUrl(window.location.href);
  const segments = urlSegments ? [...urlSegments] : [];
  const selectedFolderName = getSelectedFolderName();

  // Если выбрана вложенная папка в списке, она и является корнем,
  // для которого пользователь нажал «Поделиться».
  if (selectedFolderName && selectedFolderName !== segments[segments.length - 1]) {
    segments.push(selectedFolderName);
  }

  if (segments.length === 0) {
    return {
      prefixSegments: [],
      label: "Корень Диска",
    };
  }

  const rootFolderName = segments[segments.length - 1];
  const projectName =
    segments.length >= 2 ? segments[segments.length - 2] : "";

  return {
    prefixSegments: segments,
    label: projectName
      ? `${projectName} — ${rootFolderName}`
      : rootFolderName,
  };
}

function isShareDialogOpen() {
  const text = document.body.innerText || "";

  // Обычный личный Яндекс.Диск.
  const personalDiskDialog =
    text.includes("Ссылка на папку") &&
    text.includes("Скопировать");

  // Яндекс 360 / корпоративный Диск.
  const disk360Dialog =
    text.includes("Доступ к папке") &&
    text.includes("Скопировать ссылку");

  return personalDiskDialog || disk360Dialog;
}

function removePanel() {
  document.getElementById(PANEL_ID)?.remove();
}

function createPanel() {
  if (document.getElementById(PANEL_ID)) {
    return;
  }

  const { prefixSegments, label } = getCurrentFolderData();

  const panel = document.createElement("div");
  panel.id = PANEL_ID;

  panel.style.cssText =
    "position:fixed;" +
    "left:50%;" +
    "top:calc(50% + 210px);" +
    "transform:translateX(-50%);" +
    "z-index:2147483647;" +
    "box-sizing:border-box;" +
    "width:480px;" +
    "max-width:calc(100vw - 24px);" +
    "padding:16px 24px;" +
    "border-radius:20px;" +
    "background:#fff;" +
    "box-shadow:0 8px 28px rgba(0,0,0,.30);" +
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
    "color:#292929;";

  // Автозакрытие через 10 секунд без действий.
  let autoCloseTimer = null;
  let autoCloseEnabled = true;
  let panelClosed = false;

  function stopAutoCloseTimer() {
    if (autoCloseTimer !== null) {
      clearTimeout(autoCloseTimer);
      autoCloseTimer = null;
    }
  }

  function startAutoCloseTimer() {
    stopAutoCloseTimer();

    if (!autoCloseEnabled || panelClosed) {
      return;
    }

    autoCloseTimer = window.setTimeout(() => {
      if (!panelClosed && document.body.contains(panel)) {
        closeThisPanel();
      }
    }, AUTO_CLOSE_DELAY);
  }

  const title = document.createElement("div");
  title.textContent = `Сохранить корень: ${label}`;
  title.style.cssText =
    "margin-bottom:16px;" +
    "padding-right:26px;" +
    "font-size:15px;" +
    "font-weight:700;" +
    "line-height:1.35;";

  const row = document.createElement("div");
  row.style.cssText =
    "display:flex;" +
    "align-items:center;" +
    "gap:8px;";

  const input = document.createElement("input");
  input.type = "url";
  input.placeholder = "Вставьте ссылку Яндекс.Диска";
  input.autocomplete = "off";
  input.spellcheck = false;

  input.style.cssText =
    "box-sizing:border-box;" +
    "min-width:0;" +
    "flex:1;" +
    "height:48px;" +
    "padding:0 14px;" +
    "border:1px solid #cfcfcf;" +
    "border-radius:12px;" +
    "outline:none;" +
    "font-family:inherit;" +
    "font-size:14px;" +
    "color:#222;";

  input.addEventListener("focus", () => {
    input.style.borderColor = "#ffcc00";
    input.style.boxShadow = "0 0 0 3px rgba(255,204,0,.22)";
  });

  input.addEventListener("blur", () => {
    input.style.borderColor = "#cfcfcf";
    input.style.boxShadow = "none";
  });

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "Сохранить";

  saveButton.style.cssText =
    "height:48px;" +
    "padding:0 17px;" +
    "border:none;" +
    "border-radius:12px;" +
    "background:#ffdb4d;" +
    "color:#222;" +
    "font-family:inherit;" +
    "font-size:14px;" +
    "font-weight:700;" +
    "cursor:pointer;" +
    "white-space:nowrap;";

saveButton.addEventListener("mouseenter", () => {
  // После успешного сохранения не меняем зелёный стиль кнопки.
  if (saveButton.disabled) {
    return;
  }

  saveButton.style.background = "#ffd11a";
});

saveButton.addEventListener("mouseleave", () => {
  // После успешного сохранения не возвращаем жёлтый фон.
  if (saveButton.disabled) {
    return;
  }

  saveButton.style.background = "#ffdb4d";
});

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.title = "Не сохранять";
  closeButton.setAttribute("aria-label", "Закрыть");

  closeButton.innerHTML = `
    <svg
      width="20"
      height="20"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M3.333 3.333L12.667 12.667M12.667 3.333L3.333 12.667"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
    </svg>
  `;

  closeButton.style.cssText =
    "position:absolute;" +
    "top:14px;" +
    "right:16px;" +
    "display:flex;" +
    "align-items:center;" +
    "justify-content:center;" +
    "width:32px;" +
    "height:32px;" +
    "padding:0;" +
    "border:none;" +
    "border-radius:9px;" +
    "background:transparent;" +
    "color:#777;" +
    "cursor:pointer;";

  closeButton.addEventListener("mouseenter", () => {
    closeButton.style.background = "#f1f1f1";
    closeButton.style.color = "#333";
  });

  closeButton.addEventListener("mouseleave", () => {
    closeButton.style.background = "transparent";
    closeButton.style.color = "#777";
  });

  const error = document.createElement("div");
  error.style.cssText =
    "display:none;" +
    "margin-top:8px;" +
    "font-size:12px;" +
    "color:#b22;";

  // Обработчик Cmd/Ctrl+V создаётся ниже,
  // но функция может ссылаться на него благодаря замыканию.
  let handlePasteShortcut;
  let handleEnterShortcut;

   function closeThisPanel() {
    if (panelClosed) {
      return;
    }

    panelClosed = true;
    stopAutoCloseTimer();

    if (handlePasteShortcut) {
      document.removeEventListener(
        "keydown",
        handlePasteShortcut,
        true
      );
    }

    if (handleEnterShortcut) {
      document.removeEventListener(
        "keydown",
        handleEnterShortcut,
        true
      );
    }

    panel.remove();
  }

  function saveRoot() {

     // Не запускаем сохранение повторно, если запрос уже идёт.
    if (saveButton.disabled) {
      return;
    }
    const publicUrl = input.value.trim().replace(/\/+$/, "");

    if (!publicUrl) {
      error.textContent = "Вставьте публичную ссылку.";
      error.style.display = "block";
      startAutoCloseTimer();
      return;
    }

    if (
      !/^https?:\/\/(disk\.yandex\.ru|disk\.yandex\.com|disk\.360\.yandex\.ru|yadi\.sk)\/d\//i.test(
        publicUrl
      )
    ) {
      error.textContent =
        "Нужна ссылка вида https://disk.yandex.ru/d/... или https://disk.360.yandex.ru/d/...";
      error.style.display = "block";
      startAutoCloseTimer();
      return;
    }

    stopAutoCloseTimer();

    saveButton.disabled = true;
    saveButton.textContent = "Сохраняю…";

    // Если background.js по какой-то причине не ответит,
    // через 3 секунды возвращаем кнопку в рабочее состояние.
    let gotResponse = false;

    const saveTimeout = setTimeout(() => {
      if (gotResponse) {
        return;
      }

      saveButton.disabled = false;
      saveButton.textContent = "Сохранить";

      error.textContent =
        "Нет ответа от расширения. Обновите расширение и страницу.";
      error.style.display = "block";

      startAutoCloseTimer();
    }, 3000);

    chrome.runtime.sendMessage(
      {
        type: "save-root-from-page",
        publicUrl,
        prefixSegments,
        label,
      },
     (result) => {
        gotResponse = true;
        clearTimeout(saveTimeout);
        if (chrome.runtime.lastError || !result?.ok) {
          console.warn(
            "Ошибка сохранения:",
            chrome.runtime.lastError?.message || result?.error
          );

          saveButton.disabled = false;
          saveButton.textContent = "Сохранить";

          error.textContent =
            "Не удалось сохранить. Перезагрузите расширение и попробуйте ещё раз.";

          error.style.display = "block";
          startAutoCloseTimer();
          return;
        }

        saveButton.textContent = "Сохранено ✓";
        saveButton.style.background = "#dcefdc";
        saveButton.style.color = "#1e7d1e";
        
        saveButton.disabled = true;
        input.disabled = true;
        closeButton.disabled = true;

        setTimeout(closeThisPanel, 700);
      }
    );
  }

  // Cmd+V / Ctrl+V:
  // Ссылка вставляется в наш input даже если фокус пока находится
  // внутри окна Яндекс.Диска.
  handlePasteShortcut = async (event) => {
    const isPaste =
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === "v";

    if (!isPaste) {
      return;
    }

    // Если фокус в нашем input — браузер сам нормально вставит текст.
    if (document.activeElement === input) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    try {
      const text = await navigator.clipboard.readText();

      if (!text) {
        return;
      }

      input.value = text.trim();
      input.dispatchEvent(new Event("input", { bubbles: true }));

      input.style.borderColor = "#79b879";
      input.style.boxShadow = "0 0 0 3px rgba(93,165,93,.20)";

      setTimeout(() => {
        if (!input.matches(":focus")) {
          input.style.borderColor = "#cfcfcf";
          input.style.boxShadow = "none";
        }
      }, 900);

      startAutoCloseTimer();
    } catch (clipboardError) {
      console.warn(
        "Не удалось прочитать буфер обмена:",
        clipboardError
      );

      error.textContent =
        "Не удалось вставить из буфера. Кликните в поле и вставьте вручную.";
      error.style.display = "block";

      startAutoCloseTimer();
    }
  };

  // Enter после Cmd/Ctrl+V сохраняет ссылку,
  // даже если фокус находится внутри окна Яндекса.
  handleEnterShortcut = (event) => {
    if (event.key !== "Enter") {
      return;
    }

    if (!input.value.trim()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    saveRoot();
  };

  document.addEventListener("keydown", handlePasteShortcut, true);
  document.addEventListener("keydown", handleEnterShortcut, true);

  input.addEventListener("input", () => {
    error.style.display = "none";
    startAutoCloseTimer();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeThisPanel();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      saveRoot();
    }
  });

  saveButton.addEventListener("click", saveRoot);
  closeButton.addEventListener("click", closeThisPanel);

  // Не отдаём клики из панели Яндекс.Диску.
  // Используется обычная фаза, поэтому кнопки внутри продолжают работать.
  panel.addEventListener("click", (event) => {
    event.stopPropagation();
    startAutoCloseTimer();
  });

  panel.addEventListener("mousedown", (event) => {
    event.stopPropagation();
    startAutoCloseTimer();
  });

  panel.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    startAutoCloseTimer();
  });

  row.append(input, saveButton);
  panel.append(title, row, error, closeButton);
  document.body.appendChild(panel);

  // Загружаем настройку из popup.
  // Если её ещё нет — автозакрытие включено.
  chrome.storage.sync.get(
    {
      autoClosePanel: true,
    },
    (data) => {
      // Если панель успели закрыть до ответа storage — ничего не делаем.
      if (!document.body.contains(panel)) {
        return;
      }

      autoCloseEnabled = data.autoClosePanel;

      if (autoCloseEnabled) {
        startAutoCloseTimer();
      }
    }
  );
}

function checkDialog() {
  const isOpen = isShareDialogOpen();

  if (isOpen) {
    if (!alreadyShownForCurrentDialog) {
      alreadyShownForCurrentDialog = true;

      setTimeout(() => {
        createPanel();
      }, 150);
    }

    return;
  }

  // После закрытия модалки Яндекса нашу панель не удаляем.
  // Это необходимо, чтобы успеть вставить публичную ссылку.
  alreadyShownForCurrentDialog = false;
}

const observer = new MutationObserver(checkDialog);

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

checkDialog();
