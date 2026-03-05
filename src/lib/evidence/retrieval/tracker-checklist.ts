export type TrackerChecklistIssue = {
  lineNumber: number;
  text: string;
};

function isActionableUncheckedLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('- [ ]')) {
    return false;
  }
  const normalized = trimmed.toLowerCase();
  if (normalized === '- [ ] not started') {
    return false;
  }
  return true;
}

export function findUncheckedChecklistItems(markdown: string): TrackerChecklistIssue[] {
  return markdown
    .split(/\r?\n/)
    .map((line, index) => ({
      lineNumber: index + 1,
      text: line.trim(),
    }))
    .filter((entry) => isActionableUncheckedLine(entry.text));
}
