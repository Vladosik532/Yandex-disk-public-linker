import {
  getPathSegmentsFromUrl,
  findMatchingRoot,
  findRenamedRoot,
  buildTargetUrl,
} from "./linklogic.js";

async function getRoots() {
  const localData = await chrome.storage.local.get("roots");

  // Если локальные данные уже есть — используем их.
  if (Array.isArray(localData.roots)) {
    return localData.roots;
  }

  // Первый запуск после обновления:
  // переносим старые корни из sync в local.
  const syncData = await chrome.storage.sync.get("roots");
  const roots = syncData.roots || [];

  await chrome.storage.local.set({ roots });

  return roots;
}

async function saveRoots(roots) {
  await chrome.storage.local.set({ roots });
}

async function saveRootFromPage(publicUrl, prefixSegments, label) {
  const roots = await getRoots();

  const cleanUrl = publicUrl.trim().replace(/\/+$/, "");
  const path = prefixSegments || [];

  const withoutSamePath = roots.filter((root) => {
    const savedSegments = root.prefixSegments || [];

    if (savedSegments.length !== path.length) {
      return true;
    }

    return savedSegments.some(
      (segment, index) => segment !== path[index]
    );
  });

  const newRoot = {
    publicUrl: cleanUrl,
    prefixSegments: path,
    label: label || path[path.length - 1] || "Корень Диска",
  };

  await saveRoots([...withoutSamePath, newRoot]);

  return newRoot;
}

async function showToast(tabId, message, isError = false) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      args: [message, isError],
      func: (message, isError) => {
        document.getElementById("yadisk-link-copier-toast")?.remove();

        const toast = document.createElement("div");
        toast.id = "yadisk-link-copier-toast";
        toast.textContent = message;

        toast.style.cssText =
          "position:fixed;" +
          "bottom:20px;" +
          "right:20px;" +
          "z-index:2147483647;" +
          "max-width:460px;" +
          "padding:10px 14px;" +
          "border-radius:8px;" +
          "background:" + (isError ? "#a33" : "#2f2f2f") + ";" +
          "color:#fff;" +
          "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
          "font-size:13px;" +
          "line-height:1.35;" +
          "word-break:break-word;" +
          "box-shadow:0 2px 10px rgba(0,0,0,.35);";

        document.body.appendChild(toast);

        setTimeout(() => toast.remove(), 3200);
      },
    });
  } catch (error) {
    console.warn("Не удалось показать уведомление:", error);
  }
}

async function copyText(tabId, text) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      args: [text],
      func: (text) => {
        const textarea = document.createElement("textarea");

        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.cssText =
          "position:fixed;" +
          "left:-9999px;" +
          "top:-9999px;" +
          "opacity:0;" +
          "pointer-events:none;";

        document.body.appendChild(textarea);

        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);

        const copied = document.execCommand("copy");

        textarea.remove();

        document.getElementById("yadisk-link-copier-toast")?.remove();

        const toast = document.createElement("div");
        toast.id = "yadisk-link-copier-toast";
        toast.textContent = copied
          ? "Ссылка скопирована: " + text
          : "Не удалось скопировать ссылку.";

        toast.style.cssText =
          "position:fixed;" +
          "bottom:20px;" +
          "right:20px;" +
          "z-index:2147483647;" +
          "max-width:460px;" +
          "padding:10px 14px;" +
          "border-radius:8px;" +
          "background:" + (copied ? "#2f2f2f" : "#a33") + ";" +
          "color:#fff;" +
          "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
          "font-size:13px;" +
          "line-height:1.35;" +
          "word-break:break-word;" +
          "box-shadow:0 2px 10px rgba(0,0,0,.35);";

        document.body.appendChild(toast);

        setTimeout(() => toast.remove(), 3200);

        return copied;
      },
    });
  } catch (error) {
    console.error("Не удалось скопировать ссылку:", error);
  }
}

async function addCurrentRoot(tab) {
  if (!tab || !tab.id || !tab.url) {
    return { ok: false };
  }

  const segments = getPathSegmentsFromUrl(tab.url);

  if (segments === null) {
    await showToast(
      tab.id,
      "Откройте нужную папку в Яндекс.Диске.",
      true
    );

    return { ok: false };
  }

  const [{ result: link }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () =>
      window.prompt(
        "Вставьте публичную ссылку именно на текущую открытую папку:"
      ),
  });

  if (!link || !link.trim()) {
    return { ok: false };
  }

  const publicUrl = link.trim().replace(/\/+$/, "");

  if (
    !/^https?:\/\/(disk\.yandex\.ru|disk\.yandex\.com|disk\.360\.yandex\.ru|yadi\.sk)\/d\//i.test(
      publicUrl
    )
  ) {
    await showToast(
      tab.id,
      "Нужна публичная ссылка Яндекс.Диска вида https://disk.yandex.ru/d/...",
      true
    );

    return { ok: false };
  }

  const newRoot = await saveRootFromPage(
    publicUrl,
    segments,
    segments[segments.length - 1] || "Корень Диска"
  );

  await showToast(tab.id, `Корень сохранён: ${newRoot.label}`);

  return {
    ok: true,
    root: newRoot,
  };
}

// Возвращает подходящий корень.
// Дополнительно пытается автоматически восстановиться,
// если вы просто переименовали корневую папку.
async function getMatchForPath(tab, segments) {
  let roots = await getRoots();
  let match = findMatchingRoot(segments, roots);

  if (match) {
    return match;
  }

  const renamed = findRenamedRoot(segments, roots);

  if (!renamed) {
    return null;
  }

  const oldRoot = renamed.root;
  const oldPrefix = oldRoot.prefixSegments || [];
  const oldFolderName = oldPrefix[oldPrefix.length - 1];
  const newFolderName = segments[segments.length - 1];

  const updatedRoot = {
    ...oldRoot,
    prefixSegments: segments,
    label: (oldRoot.label || oldFolderName).replace(
      oldFolderName,
      newFolderName
    ),
  };

  roots[renamed.index] = updatedRoot;
  await saveRoots(roots);

  await showToast(
    tab.id,
    `Корень обновлён: ${oldFolderName} → ${newFolderName}`
  );

  return updatedRoot;
}

// Ctrl+Shift+Y / Command+Shift+Y.
async function copyForTab(tab) {
  if (!tab || !tab.id || !tab.url) {
    return { ok: false };
  }

  const segments = getPathSegmentsFromUrl(tab.url);

  if (segments === null) {
    await showToast(
      tab.id,
      "Это не похоже на страницу Яндекс.Диска.",
      true
    );

    return { ok: false };
  }

  const match = await getMatchForPath(tab, segments);

  if (!match) {
    await showToast(
      tab.id,
      "Нет сохранённого корня для этой папки. Откройте «Поделиться» у корневой папки и вставьте ссылку в появившееся поле.",
      true
    );

    return { ok: false };
  }

  const target = buildTargetUrl(match, segments);

  await copyText(tab.id, target);

  return {
    ok: true,
    url: target,
  };
}

// Ctrl+Shift+O / Command+Shift+O.
async function openAndCopyForTab(tab) {
  if (!tab || !tab.id || !tab.url) {
    return { ok: false };
  }

  const segments = getPathSegmentsFromUrl(tab.url);

  if (segments === null) {
    await showToast(
      tab.id,
      "Это не похоже на страницу Яндекс.Диска.",
      true
    );

    return { ok: false };
  }

  const match = await getMatchForPath(tab, segments);

  if (!match) {
    await showToast(
      tab.id,
      "Нет сохранённого корня для этой папки.",
      true
    );

    return { ok: false };
  }

  const target = buildTargetUrl(match, segments);

  // Сначала копируем ссылку.
  await copyText(tab.id, target);

  // Затем открываем её в новой активной вкладке.
  await chrome.tabs.create({
    url: target,
    active: true,
  });

  return {
    ok: true,
    url: target,
  };
}

chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];

    if (!tab) {
      return;
    }

    if (command === "copy-link") {
      copyForTab(tab);
      return;
    }

    if (command === "open-and-copy-link") {
      openAndCopyForTab(tab);
    }
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "save-root-from-page") {
    saveRootFromPage(
      msg.publicUrl,
      msg.prefixSegments || [],
      msg.label
    )
      .then((newRoot) => {
        sendResponse({
          ok: true,
          root: newRoot,
        });
      })
      .catch((error) => {
        console.error("Не удалось сохранить корень:", error);

        sendResponse({
          ok: false,
          error: String(error),
        });
      });

    return true;
  }

  if (msg.type === "copy-current") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse({ ok: false });
        return;
      }

      copyForTab(tabs[0]).then(sendResponse);
    });

    return true;
  }

  if (msg.type === "add-current-root") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse({ ok: false });
        return;
      }

      addCurrentRoot(tabs[0]).then(sendResponse);
    });

    return true;
  }

  if (msg.type === "rename-root") {
    getRoots().then(async (roots) => {
      const index = Number(msg.index);
      const label = String(msg.label || "").trim();

      if (!Number.isInteger(index) || !roots[index] || !label) {
        sendResponse(roots);
        return;
      }

      roots[index] = {
        ...roots[index],
        label,
      };

      await saveRoots(roots);

      sendResponse(roots);
    });

    return true;
  }

  if (msg.type === "get-roots") {
    getRoots().then(sendResponse);
    return true;
  }

  if (msg.type === "delete-root") {
    getRoots().then(async (roots) => {
      const updated = roots.filter((_, index) => index !== msg.index);

      await saveRoots(updated);
      sendResponse(updated);
    });

    return true;
  }
});
