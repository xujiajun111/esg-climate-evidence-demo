export function reconstructTextLines(items, pageWidth = 0) {
  const tokens = collectTokens(items);
  if (tokens.length === 0) {
    return [];
  }

  const detectedWidth =
    Number(pageWidth) ||
    Math.max(...tokens.map((token) => token.right), 1) * 1.04;
  const fragments = buildLineFragments(tokens);
  const gutters = detectColumnGutters(fragments, detectedWidth);
  const ordered = orderFragments(fragments, gutters, detectedWidth);

  const mergedLines = [];
  for (const fragment of ordered) {
    const line = normalizeInlineSpacing(fragment.text);
    if (!line) {
      continue;
    }

    const previousIndex = mergedLines.length - 1;
    const isStandalonePunctuation =
      /^[，。；：、！？）】》]+$/.test(line) && previousIndex >= 0;

    if (isStandalonePunctuation) {
      mergedLines[previousIndex] += line;
    } else {
      mergedLines.push(line);
    }
  }

  return mergedLines;
}

function collectTokens(items) {
  const tokens = [];

  for (const item of items) {
    if (typeof item.str !== "string" || !item.str.trim() || !item.transform) {
      continue;
    }

    const x = Number(item.transform[4]) || 0;
    const y = Number(item.transform[5]) || 0;
    const width = Math.max(0, Number(item.width) || 0);
    const fontSize =
      Math.hypot(
        Number(item.transform[2]) || 0,
        Number(item.transform[3]) || 0
      ) || 10;

    tokens.push({
      x,
      y,
      width,
      fontSize,
      text: item.str.replace(/\u0000/g, ""),
      left: x,
      right: x + width
    });
  }

  return tokens;
}

function buildLineFragments(tokens) {
  const rows = [];
  const sortedTokens = [...tokens].sort(
    (first, second) => second.y - first.y || first.x - second.x
  );

  for (const token of sortedTokens) {
    const row = rows.at(-1);
    const tolerance = Math.max(
      1.8,
      Math.min(Math.max(token.fontSize * 0.3, 2), 3.2)
    );

    if (row && Math.abs(row.y - token.y) <= tolerance) {
      row.tokens.push(token);
      row.y = (row.y * (row.tokens.length - 1) + token.y) / row.tokens.length;
    } else {
      rows.push({
        y: token.y,
        tokens: [token]
      });
    }
  }

  return rows.flatMap(splitRowIntoFragments);
}

function splitRowIntoFragments(row) {
  const fragments = [];
  const sorted = [...row.tokens].sort(
    (first, second) => first.x - second.x
  );
  let current = [];
  let previousEnd = null;
  let previousFontSize = 10;

  const flush = () => {
    if (current.length === 0) {
      return;
    }
    const left = Math.min(...current.map((token) => token.left));
    const right = Math.max(...current.map((token) => token.right));
    const text = joinLineItems(current);
    if (text.trim()) {
      fragments.push({
        y: row.y,
        left,
        right,
        width: right - left,
        center: (left + right) / 2,
        text
      });
    }
    current = [];
    previousEnd = null;
  };

  for (const token of sorted) {
    const gap = previousEnd === null ? 0 : token.left - previousEnd;
    const splitThreshold = Math.max(
      8,
      Math.min(Math.max(previousFontSize, token.fontSize) * 1.4, 16)
    );

    if (current.length > 0 && gap > splitThreshold) {
      flush();
    }

    current.push(token);
    previousEnd = Math.max(
      previousEnd ?? token.right,
      token.right
    );
    previousFontSize = token.fontSize;
  }

  flush();
  return fragments;
}

function detectColumnGutters(fragments, pageWidth) {
  const narrowFragments = fragments.filter(
    (fragment) =>
      fragment.text.trim().length >= 2 &&
      fragment.width <= pageWidth * 0.58
  );
  if (narrowFragments.length < 6) {
    return [];
  }

  const minimumSideCount = Math.max(
    3,
    Math.round(narrowFragments.length * 0.1)
  );
  const maximumCrossing = Math.max(
    2,
    Math.round(narrowFragments.length * 0.06)
  );
  const validPositions = [];

  for (
    let position = pageWidth * 0.2;
    position <= pageWidth * 0.8;
    position += 4
  ) {
    let leftCount = 0;
    let rightCount = 0;
    let crossingCount = 0;

    for (const fragment of narrowFragments) {
      if (fragment.right <= position) {
        leftCount += 1;
      } else if (fragment.left >= position) {
        rightCount += 1;
      } else {
        crossingCount += 1;
      }
    }

    if (
      leftCount >= minimumSideCount &&
      rightCount >= minimumSideCount &&
      crossingCount <= maximumCrossing
    ) {
      validPositions.push({
        position,
        crossingCount,
        balance: Math.min(leftCount, rightCount)
      });
    }
  }

  if (validPositions.length === 0) {
    return [];
  }

  const clusters = [];
  let cluster = [];

  for (const entry of validPositions) {
    const previous = cluster.at(-1);
    if (previous && entry.position - previous.position > 8) {
      clusters.push(cluster);
      cluster = [];
    }
    cluster.push(entry);
  }
  if (cluster.length > 0) {
    clusters.push(cluster);
  }

  const candidates = clusters
    .map((entries) => ({
      position:
        entries.reduce((sum, entry) => sum + entry.position, 0) /
        entries.length,
      crossingCount:
        entries.reduce((sum, entry) => sum + entry.crossingCount, 0) /
        entries.length,
      balance:
        entries.reduce((sum, entry) => sum + entry.balance, 0) /
        entries.length
    }))
    .sort(
      (first, second) =>
        first.crossingCount - second.crossingCount ||
        second.balance - first.balance
    );

  const selected = [];
  for (const candidate of candidates) {
    if (
      selected.every(
        (existing) =>
          Math.abs(existing.position - candidate.position) >
          pageWidth * 0.18
      )
    ) {
      selected.push(candidate);
    }
    if (selected.length === 2) {
      break;
    }
  }

  return selected
    .sort((first, second) => first.position - second.position)
    .map((candidate) => candidate.position);
}

function orderFragments(fragments, gutters, pageWidth) {
  const sorted = [...fragments].sort(
    (first, second) => second.y - first.y || first.left - second.left
  );
  if (gutters.length === 0) {
    return sorted;
  }

  const columnCount = gutters.length + 1;
  const ordered = [];
  let band = [];

  const flushBand = () => {
    for (let column = 0; column < columnCount; column += 1) {
      band
        .filter((fragment) => fragmentColumn(fragment, gutters) === column)
        .sort((first, second) => second.y - first.y || first.left - second.left)
        .forEach((fragment) => ordered.push(fragment));
    }
    band = [];
  };

  for (const fragment of sorted) {
    const isSpanning =
      fragment.width > pageWidth * 0.62 ||
      gutters.some(
        (gutter) =>
          fragment.left < gutter - 2 && fragment.right > gutter + 2
      );

    if (isSpanning) {
      flushBand();
      ordered.push(fragment);
    } else {
      band.push(fragment);
    }
  }
  flushBand();

  return ordered;
}

function fragmentColumn(fragment, gutters) {
  return gutters.filter((gutter) => fragment.center >= gutter).length;
}

function joinLineItems(items) {
  const sorted = [...items].sort((first, second) => first.x - second.x);
  let output = "";
  let endX = null;
  let previousCharacter = "";
  let lastFontSize = 10;

  for (const item of sorted) {
    const text = item.text.replace(/\u0000/g, "");
    const firstCharacter = text.trim().charAt(0);
    const gap = endX === null ? 0 : item.x - endX;
    const looksLikeWordGap =
      gap > Math.max(2.5, Math.min(lastFontSize * 0.55, 7)) &&
      /[A-Za-z0-9]$/.test(previousCharacter) &&
      /^[A-Za-z0-9(]/.test(firstCharacter);

    if (output && looksLikeWordGap) {
      output += " ";
    }

    output += text;
    endX = item.x + item.width;
    const visibleCharacters = text.replace(/\s/g, "");
    if (visibleCharacters) {
      previousCharacter = visibleCharacters.at(-1);
    }
    lastFontSize = item.fontSize;
  }

  return output;
}

function normalizeInlineSpacing(line) {
  return line
    .replace(/\u0000/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([，。；：、！？）】》])/g, "$1")
    .replace(/([（【《])\s+/g, "$1")
    .trim();
}
