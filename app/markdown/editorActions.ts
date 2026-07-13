// Editor action helpers shared by the Typora-style table grid picker and the
// custom right-click context menu. Formatting operations delegate to Vditor's
// own toolbar buttons (so its per-mode logic stays authoritative), while table
// structure edits operate on the rendered table DOM and then resync through the
// public getValue()/setValue() round-trip.

export interface VditorLike {
  getValue: () => string;
  setValue: (markdown: string, clearStack?: boolean) => void;
  insertValue: (value: string, render?: boolean) => void;
  focus: () => void;
}

/** Build a GFM table with `cols` columns and `rows` total rows (row 1 is the header). */
export function buildTableMarkdown(rows: number, cols: number): string {
  const safeCols = Math.max(1, cols);
  const safeRows = Math.max(1, rows);
  const header = `| ${Array.from({ length: safeCols }, (_, index) => `列 ${index + 1}`).join(" | ")} |`;
  const divider = `| ${Array.from({ length: safeCols }, () => "---").join(" | ")} |`;
  const bodyRowCount = Math.max(1, safeRows - 1);
  const bodyRow = `| ${Array.from({ length: safeCols }, () => "  ").join(" | ")} |`;
  const body = Array.from({ length: bodyRowCount }, () => bodyRow).join("\n");
  return `\n${header}\n${divider}\n${body}\n`;
}

/** Locate the Vditor toolbar button carrying `data-type` and click it. */
export function triggerToolbarAction(host: HTMLElement, type: string): boolean {
  const button = host.querySelector<HTMLElement>(`.vditor-toolbar [data-type="${type}"]`);
  if (!button) return false;
  button.click();
  return true;
}

/** The rendered editor surface for the active mode (wysiwyg/ir/sv). */
export function getActiveEditableElement(host: HTMLElement): HTMLElement | null {
  return host.querySelector<HTMLElement>(
    ".vditor-wysiwyg .vditor-reset, .vditor-ir .vditor-reset, .vditor-sv",
  );
}

export function findCellFromNode(node: Node | null): HTMLTableCellElement | null {
  let current: Node | null = node;
  while (current && current !== document.body) {
    if (current instanceof HTMLTableCellElement) return current;
    current = current.parentNode;
  }
  return null;
}

export function findTableFromNode(node: Node | null): HTMLTableElement | null {
  let current: Node | null = node;
  while (current && current !== document.body) {
    if (current instanceof HTMLTableElement) return current;
    current = current.parentNode;
  }
  return null;
}

type TableAlign = "left" | "center" | "right";

function tableRows(table: HTMLTableElement): HTMLTableRowElement[] {
  return Array.from(table.querySelectorAll<HTMLTableRowElement>("tr"));
}

function cellsInRow(row: HTMLTableRowElement): HTMLTableCellElement[] {
  return Array.from(row.querySelectorAll<HTMLTableCellElement>("th, td"));
}

function makeBodyCell(reference: HTMLTableCellElement): HTMLTableCellElement {
  const cell = document.createElement("td");
  const align = reference.getAttribute("align");
  if (align) cell.setAttribute("align", align);
  cell.innerHTML = "<wbr>";
  cell.querySelector("wbr")?.remove();
  cell.textContent = " ";
  return cell;
}

/** Insert a body row above or below the row containing `cell`. */
export function domInsertRow(table: HTMLTableElement, cell: HTMLTableCellElement, position: "above" | "below") {
  const row = cell.parentElement as HTMLTableRowElement | null;
  if (!row) return;
  const templateCells = cellsInRow(row);
  const newRow = document.createElement("tr");
  templateCells.forEach((reference) => newRow.appendChild(makeBodyCell(reference)));

  // A header row lives in <thead>; inserting "above" it still lands in the body.
  const isHeader = row.parentElement?.tagName === "THEAD";
  let tbody = table.querySelector("tbody");
  if (!tbody) {
    tbody = document.createElement("tbody");
    table.appendChild(tbody);
  }

  if (isHeader) {
    tbody.insertBefore(newRow, tbody.firstChild);
    return;
  }
  if (position === "above") {
    row.parentElement?.insertBefore(newRow, row);
  } else {
    row.parentElement?.insertBefore(newRow, row.nextSibling);
  }
}

/** Insert a column to the left or right of `cell`'s column across all rows. */
export function domInsertColumn(table: HTMLTableElement, cell: HTMLTableCellElement, position: "left" | "right") {
  const columnIndex = cell.cellIndex;
  tableRows(table).forEach((row) => {
    const cells = cellsInRow(row);
    const isHeaderRow = row.parentElement?.tagName === "THEAD" || cells.some((item) => item.tagName === "TH");
    const newCell = document.createElement(isHeaderRow ? "th" : "td");
    newCell.textContent = isHeaderRow ? "列" : " ";
    const reference = cells[columnIndex];
    if (!reference) {
      row.appendChild(newCell);
      return;
    }
    if (position === "left") {
      row.insertBefore(newCell, reference);
    } else {
      row.insertBefore(newCell, reference.nextSibling);
    }
  });
}

/** Delete the row containing `cell` (header rows are protected). */
export function domDeleteRow(table: HTMLTableElement, cell: HTMLTableCellElement): boolean {
  const row = cell.parentElement as HTMLTableRowElement | null;
  if (!row) return false;
  const isHeader = row.parentElement?.tagName === "THEAD" || cellsInRow(row).some((item) => item.tagName === "TH");
  if (isHeader) return false;
  const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
  if (bodyRows.length <= 1) return false;
  row.remove();
  return true;
}

/** Delete `cell`'s column across all rows (last remaining column is protected). */
export function domDeleteColumn(table: HTMLTableElement, cell: HTMLTableCellElement): boolean {
  const columnIndex = cell.cellIndex;
  const headerCells = cellsInRow(tableRows(table)[0] ?? cell.parentElement as HTMLTableRowElement);
  if (headerCells.length <= 1) return false;
  tableRows(table).forEach((row) => {
    const cells = cellsInRow(row);
    cells[columnIndex]?.remove();
  });
  return true;
}

/** Set the alignment for `cell`'s column across all rows. */
export function domSetColumnAlign(table: HTMLTableElement, cell: HTMLTableCellElement, align: TableAlign) {
  const columnIndex = cell.cellIndex;
  tableRows(table).forEach((row) => {
    const target = cellsInRow(row)[columnIndex];
    if (!target) return;
    target.setAttribute("align", align);
  });
}
