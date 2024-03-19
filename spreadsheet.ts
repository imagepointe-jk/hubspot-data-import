import fs from "fs";
import xlsx, { WorkBook, WorkSheet } from "xlsx";

type Obj = {
  [key: string]: any;
};

type DataFromWorkbook = {
  [key: string]: Obj[];
};

export function getSourceSheet(path: string, sheetName: string) {
  const file = fs.readFileSync(path);
  const workbook = xlsx.read(file, { type: "buffer" });
  return workbook.Sheets[sheetName];
}

export function getSourceJson(path: string) {
  const file = fs.readFileSync(path);
  const workbook = xlsx.read(file, { type: "buffer" });
  const data: DataFromWorkbook = {};
  for (const sheetName of workbook.SheetNames) {
    data[`${sheetName}`] = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
  }

  return data;
}

export function writeAsSheet(
  data: Obj[],
  filename: string,
  sheetName = "Sheet1"
) {
  const sheet = xlsx.utils.json_to_sheet(data);
  const workbook: WorkBook = {
    Sheets: {
      [`${sheetName}`]: sheet,
    },
    SheetNames: [sheetName],
  };
  xlsx.writeFile(workbook, `${filename}.xlsx`);
}

export function getSheetCellValue(
  colNum: number,
  rowNum: number,
  sheet: WorkSheet
) {
  const colLabel = numberToColumnLetterLabel(colNum);
  const cellLabel = `${colLabel}${rowNum}`;
  return sheet[cellLabel] ? `${sheet[cellLabel].v}` : undefined;
}

function numberToColumnLetterLabel(num: number) {
  let label = "";
  while (num > 0) {
    label = String.fromCharCode((num % 26) + 64) + label;
    num = Math.floor(num / 26);
  }
  return label;
}

//returns a 2D array with the raw cell values found in the given range (zero-indexed).
//so rows[13][42] would give the value in column 43, row 14.
//the column and row parameters are one-indexed to better reflect how columns and rows appear in excel.
export function getSheetRawCells(
  bounds: {
    columns: {
      from: number; //use 1, not 0, for first column
      to: number;
    };
    rows: {
      from: number; //use 1, not 0, for first row
      to: number;
    };
  },
  sheet: WorkSheet
): any[][] {
  const rows: any[][] = [];

  for (let y = bounds.rows.from; y <= bounds.rows.to; y++) {
    const row: any[] = [];
    for (let x = bounds.columns.from; x <= bounds.columns.to; x++) {
      const val = getSheetCellValue(x, y, sheet);
      row.push(val);
    }
    rows.push(row);
  }

  return rows;
}
