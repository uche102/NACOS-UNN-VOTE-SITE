import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const docxPath = "/home/uche/Pictures/Sorted_Organization_Photos.docx";
const publicDir = path.join(root, "public", "candidates");
const outputPath = path.join(root, "tmp-candidates-import.json");

function unzipText(file, member) {
  return execFileSync("unzip", ["-p", file, member], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

function unzipBuffer(file, member) {
  return execFileSync("unzip", ["-p", file, member], { maxBuffer: 20 * 1024 * 1024 });
}

function decodeXml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanTitle(title) {
  return title
    .replace(/\s+Candidate$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^Ass\.?\s+Director\s+of\s+Socials$/i, "Assistant Director of Socials")
    .replace(/^Asst\.?\s+Director\s+of\s+Socials$/i, "Assistant Director of Socials")
    .replace(/^Asst\.?\s+Director\s+of\s+Sports$/i, "Assistant Director of Sports")
    .replace(/^Asst\.?\s+Director\s+of\s+Academics$/i, "Assistant Director of Academics")
    .replace(/^Assistant\s+PRO$/i, "Assistant PRO")
    .replace(/^Public Relations Officer 2$/i, "Assistant PRO")
    .replace(/^PRO\s*1$/i, "Public Relations Officer 1")
    .replace(/^Assistant Editor[- ]in[- ]chief$/i, "Associate Editor-in-Chief")
    .replace(/^vice president$/i, "Vice President")
    .replace(/^House of representative\b/i, "House of Representatives")
    .replace(/^House of representatives\b/i, "House of Representatives");
}

function postOrder(title) {
  const normalized = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const level = normalized.match(/\b(200|300|400|500)\s*(l|level)\b/);
  const levelOrder = { "200": 1, "300": 2, "400": 3, "500": 4 };
  if (level && normalized.includes("hor")) return levelOrder[level[1]];
  if (normalized.includes("house of representatives")) return levelOrder[level?.[1]] || 4;

  const map = new Map([
    ["assistant director of socials", 5],
    ["director of socials", 6],
    ["assistant director of academics", 7],
    ["director of academics", 8],
    ["assistant director of sports", 9],
    ["director of sports", 10],
    ["associate editor in chief", 11],
    ["editor in chief", 12],
    ["deputy director of health", 13],
    ["director of health", 14],
    ["assistant pro", 15],
    ["public relations officer 2", 15],
    ["public relations officer 1", 16],
    ["financial secretary", 17],
    ["treasurer", 18],
    ["assistant secretary general", 19],
    ["secretary general", 20],
    ["vice president", 21],
    ["president", 22],
  ]);
  return map.get(normalized) || 100;
}

function eligibleLevel(title) {
  const match = title.match(/\b(200|300|400|500)\s*(?:L|level)\b/i);
  return match ? `${match[1]}L` : "";
}

function normalizePost(title) {
  const level = title.match(/\b(200|300|400|500)\s*(?:L|level)\b/i)?.[1];
  if (/hor|house of representatives?/i.test(title) && level) return `${level}L HOR`;
  return cleanTitle(title)
    .replace(/\b500L HOR\b/i, "500L HOR")
    .replace(/\b400L HOR\b/i, "400L HOR")
    .replace(/\b300L HOR\b/i, "300L HOR")
    .replace(/\b200L HOR\b/i, "200L HOR");
}

const titleCorrections = new Map([
  ["agbo princewill izuchukwu", "Assistant Director of Socials"],
  ["agbo princewill", "Assistant Director of Socials"],
  ["agwuncha chisom ugochukwu", "Assistant PRO"],
  ["chukwunenye chisom divine-gift", "Assistant PRO"],
]);

function correctedPost(name, title) {
  return titleCorrections.get(name.toLowerCase()) || title;
}

const relsXml = unzipText(docxPath, "word/_rels/document.xml.rels");
const rels = new Map(
  [...relsXml.matchAll(/<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"/g)]
    .filter(([, , target]) => target.startsWith("media/"))
    .map(([, id, target]) => [id, `word/${target}`]),
);

const docXml = unzipText(docxPath, "word/document.xml");
const paragraphs = [...docXml.matchAll(/<w:p[\s\S]*?<\/w:p>/g)].map((match) => match[0]);

const candidates = [];
let pending = null;

function flushPending() {
  if (!pending || !pending.image || pending.lines.length < 2) return;
  const name = pending.lines[0].replace(/^Name:\s*/i, "").trim();
  const title = pending.lines.slice(1).join(" ").replace(/^Title:\s*/i, "").trim();
  if (!name || !title) return;
  candidates.push({ name, title: normalizePost(title), source: pending.image });
  pending = null;
}

for (const paragraph of paragraphs) {
  const embeds = [...paragraph.matchAll(/r:embed="([^"]+)"/g)].map((match) => match[1]);
  const text = decodeXml([...paragraph.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join("\n"));

  if (embeds.length) {
    flushPending();
    pending = { image: rels.get(embeds.at(-1)), lines: [] };
  }
  if (!text || !pending) continue;

  const nameTitle = text.match(/Name:\s*(.*?)\s*Title:\s*(.*)/i);
  if (nameTitle) {
    candidates.push({ name: nameTitle[1].trim(), title: normalizePost(nameTitle[2].trim()), source: pending.image });
    pending = null;
    continue;
  }

  const pipe = text.match(/^(.*?)\s*\|\s*(.*)$/);
  if (pipe) {
    candidates.push({ name: pipe[1].trim(), title: normalizePost(pipe[2].trim()), source: pending.image });
    pending = null;
    continue;
  }

  pending.lines.push(text);
  if (pending.lines.length >= 2) flushPending();
}
flushPending();

const extras = [
  ["Diribey Chinemerem Marvelous", "200L HOR", "/home/uche/Documents/candidate.jpeg"],
  ["Anozie Kenneth Chizitere", "200L HOR", "/home/uche/Documents/candidate1.jpeg"],
  ["Ozomma Nnaemeka Michael", "200L HOR", "/home/uche/Documents/candidate2.jpeg"],
  ["Anibueze Vanessa", "200L HOR", "/home/uche/Documents/candidate3.jpeg"],
  ["Imoh Oghenetejiri Alphonsus", "200L HOR", "/home/uche/Documents/candidate4.jpeg"],
  ["Obiudu Olive Mary Akachukwu", "Associate Editor-in-Chief", "/home/uche/Documents/candidate5.jpeg"],
  ["Ojiakor Chibuike Johnbosco", "400L HOR", "/home/uche/Pictures/37th.jpeg"],
];

fs.mkdirSync(publicDir, { recursive: true });
const rows = [];
const seen = new Set();

for (const candidate of candidates) {
  const candidateTitle = correctedPost(candidate.name, candidate.title);
  const key = `${candidate.name.toLowerCase()}|${candidateTitle.toLowerCase()}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const filename = `${slug(candidateTitle)}-${slug(candidate.name)}.jpeg`;
  fs.writeFileSync(path.join(publicDir, filename), unzipBuffer(docxPath, candidate.source));
  rows.push({
    post: candidateTitle,
    eligible_level: eligibleLevel(candidateTitle),
    post_order: postOrder(candidateTitle),
    name: candidate.name,
    tagline: candidateTitle,
    image_url: `/candidates/${filename}`,
    display_order: rows.filter((row) => row.post === candidateTitle).length + 1,
  });
}

for (const [name, title, source] of extras) {
  const normalizedTitle = normalizePost(title);
  const key = `${name.toLowerCase()}|${normalizedTitle.toLowerCase()}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const filename = `${slug(normalizedTitle)}-${slug(name)}.jpeg`;
  fs.copyFileSync(source, path.join(publicDir, filename));
  rows.push({
    post: normalizedTitle,
    eligible_level: eligibleLevel(normalizedTitle),
    post_order: postOrder(normalizedTitle),
    name,
    tagline: normalizedTitle,
    image_url: `/candidates/${filename}`,
    display_order: rows.filter((row) => row.post === normalizedTitle).length + 1,
  });
}

const noPhotoCandidates = [
  ["Nwonyia Mary", "200L HOR"],
  ["Nwanoruio Joshua", "500L HOR"],
  ["Okafor Ikechukwu", "500L HOR"],
  ["Ozuzu Nnaemeka", "500L HOR"],
  ["Ezeofor Chisom", "Assistant Secretary General"],
  ["Okeke Angela", "Assistant Secretary General"],
  ["Martins Chinonso", "Assistant Director of Academics"],
  ["Ukwuoma Emmanuel", "Editor-in-Chief"],
  ["Anigbogu Somtochukwu", "Director of Health"],
];

for (const [name, title] of noPhotoCandidates) {
  const normalizedTitle = normalizePost(title);
  const key = `${name.toLowerCase()}|${normalizedTitle.toLowerCase()}`;
  if (seen.has(key)) continue;
  seen.add(key);
  rows.push({
    post: normalizedTitle,
    eligible_level: eligibleLevel(normalizedTitle),
    post_order: postOrder(normalizedTitle),
    name,
    tagline: normalizedTitle,
    image_url: "",
    display_order: rows.filter((row) => row.post === normalizedTitle).length + 1,
  });
}

rows.sort((a, b) => a.post_order - b.post_order || a.display_order - b.display_order || a.name.localeCompare(b.name));
fs.writeFileSync(outputPath, JSON.stringify(rows, null, 2));
console.log(`Wrote ${rows.length} candidate rows to ${outputPath}`);
for (const row of rows) {
  console.log(`${row.post_order}. ${row.post} | ${row.name}`);
}
