import {
  Contact,
  Customer,
  ImpressDataType,
  LineItem,
  Order,
  Product,
} from "./schema";
import { writeAsSheet } from "./spreadsheet";

export class DataError extends Error {
  public readonly rowIdentifier;
  public readonly rowNumber; //this is not necessarily the actual row number in Excel because if there are blank rows, they will be skipped
  public readonly type;

  constructor(
    type: ImpressDataType,
    rowIdentifier: string,
    rowNumber: number,
    message?: string
  ) {
    super(message);

    this.type = type;
    this.rowIdentifier = rowIdentifier;
    this.rowNumber = rowNumber;
  }
}

type AppErrorType = "Environment" | "API" | "Data Integrity" | "Unknown";

export class AppError extends Error {
  public readonly type;

  constructor(type: AppErrorType, message?: string) {
    super(message);

    this.type = type;
  }
}

export function gatherDataErrors(
  customers: (Customer | DataError)[],
  contacts: (Contact | DataError)[],
  orders: (Order | DataError)[],
  products: (Product | DataError)[],
  lineItems: (LineItem | DataError)[]
) {
  const dataErrors: DataError[] = [];

  for (const item of customers) {
    if (item instanceof DataError) dataErrors.push(item);
  }
  for (const item of contacts) {
    if (item instanceof DataError) dataErrors.push(item);
  }
  for (const item of orders) {
    if (item instanceof DataError) dataErrors.push(item);
  }
  for (const item of products) {
    if (item instanceof DataError) dataErrors.push(item);
  }
  for (const item of lineItems) {
    if (item instanceof DataError) dataErrors.push(item);
  }

  return dataErrors;
}

export function writeErrors(errors: Error[]) {
  const rows: {
    errorType?: string;
    dataType?: string;
    message?: string;
    ["rowNumber (approx)"]?: number;
    rowIdentifier?: string;
  }[] = [];

  for (const error of errors) {
    if (error instanceof DataError) {
      rows.push({
        errorType: "Data",
        dataType: error.type,
        message: error.message,
        rowIdentifier: error.rowIdentifier,
        ["rowNumber (approx)"]: error.rowNumber,
      });
    } else if (error instanceof AppError) {
      rows.push({
        errorType: `App (${error.type})`,
        message: error.message,
      });
    } else if (error instanceof Error) {
      rows.push({
        errorType: "Other",
        message: error.message,
      });
    }
    writeAsSheet(rows, "./output/Errors");
  }
}
