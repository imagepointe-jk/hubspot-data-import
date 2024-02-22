import fs from "fs";
import xlsx, { WorkBook, WorkSheet } from "xlsx";

type Obj = {
  [key: string]: any;
};

type DataFromWorkbook = {
  [key: string]: Obj[];
};

export function getSourceJson(path: string) {
  try {
    const file = fs.readFileSync(path);
    const workbook = xlsx.read(file, { type: "buffer" });
    const data: DataFromWorkbook = {};
    for (const sheetName of workbook.SheetNames) {
      data[`${sheetName}`] = xlsx.utils.sheet_to_json(
        workbook.Sheets[sheetName]
      );
    }

    return data;
  } catch (error) {
    throw new Error("ERROR PARSING SOURCE");
  }
}

export function writeAsSheet(data: Obj[], filename: string) {
  const sheet = xlsx.utils.json_to_sheet(data);
  const workbook: WorkBook = {
    Sheets: {
      Sheet1: sheet,
    },
    SheetNames: ["Sheet1"],
  };
  xlsx.writeFile(workbook, `${filename}.xlsx`);
}
