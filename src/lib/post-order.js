function normalizedTitle(post) {
  return String(post?.title || post?.post_title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function positionRank(post) {
  const title = normalizedTitle(post);

  if (/\b200\s*(l|level)\b.*\b(hor|house of rep|house of representative|house of representatives)\b/.test(title)) return 1;
  if (/\b300\s*(l|level)\b.*\b(hor|house of rep|house of representative|house of representatives)\b/.test(title)) return 2;
  if (/\b400\s*(l|level)\b.*\b(hor|house of rep|house of representative|house of representatives)\b/.test(title)) return 3;
  if (/\b500\s*(l|level)\b.*\b(hor|house of rep|house of representative|house of representatives)\b/.test(title)) return 4;
  if (title.includes("assistant director of socials")) return 5;
  if (title.includes("director of socials")) return 6;
  if (title.includes("assistant director of academics")) return 7;
  if (title.includes("director of academics")) return 8;
  if (title.includes("assistant director of sports")) return 9;
  if (title.includes("director of sports")) return 10;
  if (title.includes("associate editor in chief")) return 11;
  if (title.includes("editor in chief")) return 12;
  if (title.includes("deputy director of health")) return 13;
  if (title.includes("director of health")) return 14;
  if (title.includes("assistant pro")) return 15;
  if (title.includes("public relations officer 2") || /\bpro 2\b/.test(title)) return 15;
  if (title.includes("public relations officer 1") || /\bpro 1\b/.test(title)) return 16;
  if (title.includes("financial secretary")) return 17;
  if (title.includes("treasurer")) return 18;
  if (title.includes("assistant secretary general")) return 19;
  if (title.includes("secretary general")) return 20;
  if (title.includes("vice president")) return 21;
  if (title === "president" || /\bpresident\b/.test(title)) return 22;

  return 1000;
}

export function inferEligibleLevel(post) {
  const title = normalizedTitle(post);
  const match = title.match(/\b(200|300|400|500)\s*(l|level)\b/);
  if (!match) return post?.eligible_level || null;
  return `${match[1]}L`;
}

export function sortPostsByHierarchy(posts) {
  return [...posts].sort((a, b) => {
    const rankDiff = positionRank(a) - positionRank(b);
    if (rankDiff !== 0) return rankDiff;

    const orderDiff = Number(a.display_order || a.post_order || 0) - Number(b.display_order || b.post_order || 0);
    if (orderDiff !== 0) return orderDiff;

    return normalizedTitle(a).localeCompare(normalizedTitle(b));
  });
}
