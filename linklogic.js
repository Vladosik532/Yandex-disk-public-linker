// linklogic.js

const ALLOWED_HOSTS = [
  "disk.yandex.ru",
  "disk.yandex.com",
  "disk.360.yandex.ru",
  "yadi.sk",
];

// Декодирует сегмент пути.
// На случай, если Яндекс передал его закодированным несколько раз,
// декодируем максимум 3 раза, пока значение изменяется.
function decodePathSegment(segment) {
  let result = segment;

  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(result);

      if (decoded === result) {
        break;
      }

      result = decoded;
    } catch {
      break;
    }
  }

  return result;
}

// Кодирует только то, что точно ломает URL в Telegram / почте:
// - пробел;
// - символ %;
// - #;
// - ?;
// - &.
//
// Русские буквы остаются читаемыми.
function encodePublicPathSegment(segment) {
  return String(segment)
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/\?/g, "%3F")
    .replace(/&/g, "%26")
    .replace(/ /g, "%20");
}

// Достаёт декодированные сегменты пути из URL вида:
// https://disk.yandex.ru/client/disk/Папка/Подпапка
// https://disk.360.yandex.ru/client/disk/Папка/Подпапка
export function getPathSegmentsFromUrl(urlStr) {
  try {
    const u = new URL(urlStr);

    if (!ALLOWED_HOSTS.includes(u.hostname)) {
      return null;
    }

    const marker = "/client/disk";
    const idx = u.pathname.indexOf(marker);

    if (idx === -1) {
      return null;
    }

    let rest = u.pathname.slice(idx + marker.length);
    rest = rest.replace(/^\/+/, "").replace(/\/+$/, "");

    if (!rest) {
      return [];
    }

    return rest.split("/").map(decodePathSegment);
  } catch {
    return null;
  }
}

// Сравнивает два пути.
function segmentsAreEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((segment, index) => segment === b[index]);
}

// Находит сохранённый корень с максимально длинным совпадающим префиксом.
export function findMatchingRoot(segments, roots) {
  let best = null;

  for (const root of roots) {
    const prefix = root.prefixSegments || [];

    if (prefix.length > segments.length) {
      continue;
    }

    let isMatch = true;

    for (let i = 0; i < prefix.length; i++) {
      if (prefix[i] !== segments[i]) {
        isMatch = false;
        break;
      }
    }

    if (
      isMatch &&
      (!best || prefix.length > (best.prefixSegments || []).length)
    ) {
      best = root;
    }
  }

  return best;
}

// Ищет корень, у которого была переименована последняя папка.
export function findRenamedRoot(segments, roots) {
  for (let index = 0; index < roots.length; index++) {
    const root = roots[index];
    const prefix = root.prefixSegments || [];

    if (prefix.length !== segments.length || prefix.length === 0) {
      continue;
    }

    const savedParent = prefix.slice(0, -1);
    const currentParent = segments.slice(0, -1);

    if (!segmentsAreEqual(savedParent, currentParent)) {
      continue;
    }

    if (prefix[prefix.length - 1] === segments[segments.length - 1]) {
      continue;
    }

    return {
      root,
      index,
    };
  }

  return null;
}

// Строит итоговую публичную ссылку на подпапку.
export function buildTargetUrl(root, segments) {
  const remainder = segments.slice(root.prefixSegments.length);
  const base = root.publicUrl.replace(/\/+$/, "");

  if (remainder.length === 0) {
    return base;
  }

  const safePath = remainder
    .map(encodePublicPathSegment)
    .join("/");

  return base + "/" + safePath;
}
