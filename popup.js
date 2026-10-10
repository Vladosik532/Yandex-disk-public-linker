const copyBtn = document.getElementById("copy-btn");
const addRootBtn = document.getElementById("add-root-btn");
const rootsList = document.getElementById("roots-list");
const emptyHint = document.getElementById("empty-hint");

const autoCloseToggle = document.getElementById("auto-close-toggle");

// По умолчанию автозакрытие включено.
chrome.storage.sync.get(
  {
    autoClosePanel: true,
  },
  (data) => {
    autoCloseToggle.checked = data.autoClosePanel;
  }
);

autoCloseToggle.addEventListener("change", () => {
  chrome.storage.sync.set({
    autoClosePanel: autoCloseToggle.checked,
  });
});

copyBtn.addEventListener("click", () => {
  if (copyBtn.disabled) return;

  copyBtn.disabled = true;

  chrome.runtime.sendMessage({ type: "copy-current" }, (result) => {
    if (result?.ok) {
      copyBtn.textContent = "Скопировано ✓";
      copyBtn.classList.add("copied");
      setTimeout(() => window.close(), 900);
    } else {
      copyBtn.disabled = false;
      copyBtn.textContent = "Скопировать ссылку";
    }
  });
});

addRootBtn.addEventListener("click", () => {
  if (addRootBtn.disabled) return;

  addRootBtn.disabled = true;

  chrome.runtime.sendMessage({ type: "add-current-root" }, (result) => {
    if (result?.ok) {
      addRootBtn.textContent = "Корень сохранён ✓";
      setTimeout(() => window.close(), 900);
    } else {
      addRootBtn.disabled = false;
      addRootBtn.textContent = "📌 Запомнить корень";
    }
  });
});

function renderRoots(roots) {
  rootsList.innerHTML = "";
  emptyHint.style.display = roots.length ? "none" : "block";

  roots.forEach((root, index) => {
    const li = document.createElement("li");

    const info = document.createElement("div");
    info.className = "root-info";

    const labelRow = document.createElement("div");
    labelRow.className = "root-label-row";

    const label = document.createElement("div");
    label.className = "root-label";
    label.textContent = root.label || root.prefixSegments.join("/");

    const editBtn = document.createElement("button");
    editBtn.className = "edit-btn";
    editBtn.type = "button";
    editBtn.textContent = "✎";
    editBtn.title = "Переименовать";
    editBtn.setAttribute("aria-label", "Переименовать корень");

    editBtn.addEventListener("click", () => {
      startRename(root, index, labelRow);
    });

    labelRow.append(label, editBtn);
    info.appendChild(labelRow);

    const url = document.createElement("div");
    url.className = "root-url";
    url.textContent = root.publicUrl;
    info.appendChild(url);

    li.appendChild(info);

    // Контейнер для кнопок справа.
    const actions = document.createElement("div");
    actions.className = "root-actions";

    // Кнопка открытия публичной ссылки в новой вкладке.
    const openBtn = document.createElement("button");
    openBtn.className = "open-btn";
    openBtn.type = "button";
    openBtn.textContent = "↗";
    openBtn.title = "Открыть публичную ссылку";
    openBtn.setAttribute("aria-label", "Открыть публичную ссылку");

    openBtn.addEventListener("click", () => {
      chrome.tabs.create({
        url: root.publicUrl,
        active: true,
      });
    });

    // Кнопка удаления корня.
    const delBtn = document.createElement("button");
    delBtn.className = "delete-btn";
    delBtn.type = "button";
    delBtn.textContent = "×";
    delBtn.title = "Удалить";
    delBtn.setAttribute("aria-label", "Удалить корень");

    delBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage(
        { type: "delete-root", index },
        (updated) => renderRoots(updated || [])
      );
    });

    actions.append(openBtn, delBtn);
    li.appendChild(actions);

    rootsList.appendChild(li);
  });
}

function startRename(root, index, labelRow) {
  const oldLabel = root.label || root.prefixSegments.join("/");

  const input = document.createElement("input");
  input.className = "rename-input";
  input.type = "text";
  input.value = oldLabel;
  input.placeholder = "Название корня";

  const controls = document.createElement("div");
  controls.className = "rename-controls";

  const saveBtn = document.createElement("button");
  saveBtn.className = "rename-save-btn";
  saveBtn.type = "button";
  saveBtn.textContent = "✓";
  saveBtn.title = "Сохранить";
  saveBtn.setAttribute("aria-label", "Сохранить новое название");

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "rename-cancel-btn";
  cancelBtn.type = "button";
  cancelBtn.textContent = "×";
  cancelBtn.title = "Отмена";
  cancelBtn.setAttribute("aria-label", "Отменить переименование");

  function cancelRename() {
    renderRootsFromStorage();
  }

  function saveRename() {
    const newLabel = input.value.trim();

    if (!newLabel) {
      input.focus();
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: "rename-root",
        index,
        label: newLabel,
      },
      (updated) => {
        renderRoots(updated || []);
      }
    );
  }

  saveBtn.addEventListener("click", saveRename);
  cancelBtn.addEventListener("click", cancelRename);

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      saveRename();
    }

    if (event.key === "Escape") {
      cancelRename();
    }
  });

  labelRow.innerHTML = "";
  controls.append(saveBtn, cancelBtn);
  labelRow.append(input, controls);

  setTimeout(() => {
    input.focus();
    input.select();
  }, 0);
}

function renderRootsFromStorage() {
  chrome.runtime.sendMessage({ type: "get-roots" }, (roots) => {
    renderRoots(roots || []);
  });
}

renderRootsFromStorage();

// ===== Слайдер поддержки =====

const promoSlides = document.querySelectorAll(".promo-slide");
const promoDots = document.querySelectorAll(".promo-dot");

let currentPromoSlide = 0;
let promoTimer = null;

const TELEGRAM_URL =
  "https://t.me/Vlados_fm?text=" +
  encodeURIComponent(
    "Привет! Пишу по поводу расширения для Яндекс.Диска. Мой вопрос / идея / баг:"
  );


function showPromoSlide(index) {
  currentPromoSlide = index;

  promoSlides.forEach((slide, i) => {
    slide.classList.toggle("active", i === index);
  });

  promoDots.forEach((dot, i) => {
    dot.classList.toggle("active", i === index);
  });
}


function startPromoTimer() {
  clearInterval(promoTimer);

  promoTimer = setInterval(() => {
    const nextSlide =
      (currentPromoSlide + 1) % promoSlides.length;

    showPromoSlide(nextSlide);
  }, 5000);
}


promoDots.forEach((dot) => {
  dot.addEventListener("click", () => {
    const index = Number(dot.dataset.slide);

    showPromoSlide(index);
    startPromoTimer();
  });
});


promoSlides.forEach((slide) => {
  slide.addEventListener("click", () => {
    const action = slide.dataset.action;

    if (action === "feedback") {
      chrome.tabs.create({
        url: TELEGRAM_URL,
      });

      return;
    }

    if (action === "support") {
    openSupportModal();
    return;
  }
  });

  slide.addEventListener("mouseenter", () => {
    clearInterval(promoTimer);
  });

  slide.addEventListener("mouseleave", () => {
    startPromoTimer();
  });
});


showPromoSlide(0);
startPromoTimer();

// ===== Модальное окно поддержки =====

const supportModal = document.getElementById("support-modal");
const supportOverlay = document.querySelector(".support-overlay");
const supportClose = document.getElementById("support-close");
const supportQr = document.getElementById("support-qr");

const SUPPORT_URL =
  "https://t.tb.ru/pm_short/2VuG8r8rVbs";


function openSupportModal() {
  clearInterval(promoTimer);
  supportModal.classList.add("active");
}


function closeSupportModal() {
  supportModal.classList.remove("active");
  supportModal.classList.add("closing");

  setTimeout(() => {
    supportModal.classList.remove("closing");
    startPromoTimer();
  }, 250);
}

supportClose.addEventListener("click", () => {
  closeSupportModal();
});


supportOverlay.addEventListener("click", () => {
  closeSupportModal();
});


supportQr.addEventListener("click", () => {
  chrome.tabs.create({
    url: SUPPORT_URL,
  });
});


document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && supportModal.classList.contains("active")) {
    closeSupportModal();
  }
});