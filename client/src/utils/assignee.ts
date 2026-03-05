/** Extract display name (First Last) from "First Last - github_username" or return full string if no separator */
export function getAssigneeDisplayName(assignee: string | null | undefined): string {
  const s = assignee?.trim() || '';
  if (!s) return '';
  const dashIdx = s.lastIndexOf(' - ');
  if (dashIdx >= 0) {
    return s.slice(0, dashIdx).trim();
  }
  return s;
}
