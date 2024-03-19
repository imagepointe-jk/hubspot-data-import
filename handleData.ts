import { ZodError } from "zod";
import { DataError } from "./error";
import {
  Contact,
  Customer,
  HubSpotOwner,
  ImpressDataType,
  LineItem,
  Order,
  PO,
  Product,
} from "./schema";
import {
  getSheetRawCells,
  getSourceJson,
  getSourceSheet,
  writeAsSheet,
} from "./spreadsheet";
import {
  parseContact,
  parseCustomer,
  parseLineItem,
  parseOrder,
  parsePo,
  parseProduct,
} from "./validation";
import { duplicateFile, makeStringTitleCase } from "./utility";

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

export function getOrdersAndErrors(
  allOwners: HubSpotOwner[],
  allPo: (PO | DataError)[]
): (Order | DataError)[] {
  const ordersAndErrors = parseSheetData(
    "Order",
    parseOrder,
    (row) => row["Sales Order#"]
  );
  return ordersAndErrors.map((item) => {
    if (item instanceof DataError) return item;
    return enrichOrder(item, allOwners, allPo);
  });
}

export function getProductsAndErrors(): (Product | DataError)[] {
  return parseSheetData("Product", parseProduct, (row) => row["Name"]);
}

export function cleanupProductsSheet() {
  duplicateFile(
    "./data for upload/products.xlsx",
    "./data for upload/products (auto-backup).xlsx"
  );

  const sheet = getSourceSheet("./data for upload/products.xlsx", "products");
  const productsPerPage = 59;
  const products: Product[] = [
    {
      Name: "Less than Minimum Charge - Dye Sub",
      SKU: "<MIN-DS",
      "Product Type": "Service",
      "Unit Price": 0,
    },
    {
      Name: "Less than Minimum Charge - Embroidery",
      SKU: "<MIN-EMB",
      "Product Type": "Service",
      "Unit Price": 0,
    },
    {
      Name: "Less than Minimum Charge - PIP",
      SKU: "<MIN-PIP",
      "Product Type": "Service",
      "Unit Price": 0,
    },
    {
      Name: "Less than Minimum Charge - Screen Print",
      SKU: "<MIN-SP",
      "Product Type": "Service",
      "Unit Price": 0,
    },
  ];

  for (let page = 0; page < 500; page++) {
    const startingRow = page * 63 + 5; //formula determined by observing pattern of Impress paginated output
    const rows = getSheetRawCells(
      {
        columns: {
          from: 1,
          to: 2,
        },
        rows: {
          from: startingRow,
          to: startingRow + productsPerPage - 1,
        },
      },
      sheet
    );
    const firstVal = rows[0][0];
    const noPage = firstVal === undefined;
    if (noPage) break;

    for (const row of rows) {
      const SKU = row[0];
      const Name = row[1];
      if (!SKU) break;
      products.push({
        SKU,
        Name,
        "Unit Price": 0,
      });
    }
  }

  writeAsSheet(products, "./data for upload/products", "products");
}

export function getLineItemsAndErrors(
  allProducts: (Product | DataError)[]
): (LineItem | DataError)[] {
  const lineItemsAndErrors = parseSheetData(
    "Line Item",
    parseLineItem,
    (row) => `Line item for order ${row["Sales Order#"]} and SKU ${row["SKU#"]}`
  );
  return lineItemsAndErrors.map((item) => {
    if (item instanceof DataError) return item;
    return enrichLineItem(item, allProducts);
  });
}

export function getPoAndErrors(): (PO | DataError)[] {
  return parseSheetData(
    "PO",
    parsePo,
    (row) => `PO for order ${row["Sales Order#"]}`
  );
}

function enrichOrder(
  order: Order,
  allOwners: HubSpotOwner[],
  allPo: (PO | DataError)[]
): Order {
  //To assign a HubSpot owner, we need their HubSpot id, and currently HubSpot doesn't allow us to search this by name.
  const foundOwner = allOwners.find(
    (owner) =>
      `${owner.firstName} ${owner.lastName}`.toLocaleLowerCase() ===
      order["Agent Name#1"]?.toLocaleLowerCase()
  );
  const foundPo = allPo.find(
    (po) =>
      !(po instanceof DataError) && po["Sales Order#"] === order["Sales Order#"]
  );
  const newOrder = { ...order };
  newOrder["Invoice Date"] = newOrder["Entered Date"];
  newOrder.Pipeline = "default";
  newOrder["Deal Stage"] = "closedwon";
  if (newOrder.Shorted) newOrder["Deal Stage"] = "closedlost";
  if (!newOrder.Shorted && !newOrder["Invoice Date"])
    newOrder["Deal Stage"] = "contractsent";
  newOrder["HubSpot Owner ID"] = foundOwner ? `${foundOwner.id}` : undefined;
  newOrder["PO#"] =
    foundPo && !(foundPo instanceof DataError) ? foundPo["PO#"] : undefined;
  newOrder["Sales Order Type"] = newOrder["Sales Order Type"]
    ? makeStringTitleCase(newOrder["Sales Order Type"])
    : undefined;

  return newOrder;
}

function enrichLineItem(
  lineItem: LineItem,
  allProducts: (Product | DataError)[]
): LineItem {
  const newLineItem = { ...lineItem };
  newLineItem.SKU = newLineItem["Item#"]
    ? newLineItem["Item#"]
    : newLineItem["SKU#"];
  const foundProduct = allProducts.find(
    (product) =>
      !(product instanceof DataError) && product.SKU === newLineItem.SKU
  );
  if (foundProduct && !(foundProduct instanceof DataError))
    newLineItem.Name = foundProduct.Name;

  return newLineItem;
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
