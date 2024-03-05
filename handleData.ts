import { ZodError } from "zod";
import { DataError } from "./error";
import {
  Contact,
  Customer,
  ImpressDataType,
  LineItem,
  Order,
  PO,
  Product,
} from "./schema";
import { getSourceJson } from "./spreadsheet";
import {
  parseContact,
  parseCustomer,
  parseLineItem,
  parseOrder,
  parsePo,
  parseProduct,
} from "./validation";

const useSampleData = true; //only for testing

export function getCustomersAndErrors(): (Customer | DataError)[] {
  return parseSheetData(
    "Customer",
    parseCustomer,
    (row) => row["Customer Number"]
  );
}

export function getContactsAndErrors(): (Contact | DataError)[] {
  return parseSheetData(
    "Contact",
    parseContact,
    (row) => `Contact for customer number ${row["Customer Number"]}`
  );
}

export function getOrdersAndErrors(): (Order | DataError)[] {
  const ordersAndErrors = parseSheetData(
    "Order",
    parseOrder,
    (row) => row["Sales Order#"]
  );
  return ordersAndErrors.map((item) => {
    if (item instanceof DataError) return item;
    return enrichOrder(item);
  });
}

export function getProductsAndErrors(): (Product | DataError)[] {
  return parseSheetData("Product", parseProduct, (row) => row["Name"]);
}

export function getLineItemsAndErrors(): (LineItem | DataError)[] {
  return parseSheetData(
    "Line Item",
    parseLineItem,
    (row) => `Line item for order ${row["Sales Order#"]} and SKU ${row["SKU#"]}`
  );
}

export function getPoAndErrors(): (PO | DataError)[] {
  return parseSheetData(
    "PO",
    parsePo,
    (row) => `PO for order ${row["Sales Order#"]}`
  );
}

function enrichOrder(order: Order): Order {
  const newOrder = { ...order };
  newOrder["Invoice Date"] = newOrder["Entered Date"];

  return newOrder;
}

function parseSheetData<T>(
  type: ImpressDataType,
  parseFn: (row: any) => T,
  createRowIdentifier?: (row: any) => string
): (T | DataError)[] {
  const sheetName = dataTypeToSheetName(type);
  const path = useSampleData
    ? `./samples/${sheetName}.xlsx`
    : `./data for upload/${sheetName}.xlsx`;
  const raw = getSourceJson(path)[sheetName];
  const parsedRows = raw.map((row, i) => {
    const rowIdentifier = createRowIdentifier
      ? createRowIdentifier(row)
      : "UNKNOWN";
    try {
      return parseFn(row);
    } catch (error) {
      if (error instanceof ZodError) {
        const badFields = error.issues
          .map((issue) => issue.path.join(""))
          .join(", ");
        return new DataError(
          type,
          rowIdentifier,
          i,
          `Encountered issues with the following fields: ${badFields}`
        );
      }
      return new DataError(
        type,
        rowIdentifier,
        i,
        `Unknown error while parsing`
      );
    }
  });
  return parsedRows;
}

function dataTypeToSheetName(type: ImpressDataType) {
  switch (type) {
    case "Customer":
      return "customers";
    case "Contact":
      return "contacts";
    case "Order":
      return "orders";
    case "Line Item":
      return "line items";
    case "PO":
      return "po";
    case "Product":
      return "products";
    default:
      return "unknown";
  }
}
