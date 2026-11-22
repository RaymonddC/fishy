// One red flag as a list item: what it is in plain words, and the detail.

export function flagItem(title: string, detail: string | undefined): HTMLLIElement {
  const item = document.createElement('li');
  const heading = document.createElement('span');
  heading.className = 'flag-title';
  heading.textContent = title;
  item.append(heading);
  if (detail) {
    const note = document.createElement('span');
    note.className = 'flag-detail';
    note.textContent = detail;
    item.append(note);
  }
  return item;
}
