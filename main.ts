import { AppError, DataError, gatherDataErrors, writeErrors } from "./error";
import {
  getAllOwners,
  syncContactAsContact,
  syncCustomerAsCompany,
  syncLineItemAsLineItem,
  syncOrderAsDeal,
  syncProductAsProduct,
} from "./fetch";
import {
  getContactsAndErrors,
  getCustomersAndErrors,
  getLineItemsAndErrors,
  getOrdersAndErrors,
  getPoAndErrors,
  getProductsAndErrors,
} from "./handleData";
import dotenv from "dotenv";
import {
  CompanyResource,
  ContactResource,
  DealResource,
  ProductResource,
} from "./schema";
import { mapContactToContact } from "./mapData";
import { printProgress } from "./console";

dotenv.config();

async function run() {
  printProgress("Gathering data...");
  const customers = getCustomersAndErrors();
  const contacts = getContactsAndErrors();
  const po = getPoAndErrors();
  const owners = await getAllOwners();
  const orders = getOrdersAndErrors(owners, po);
  const products = getProductsAndErrors();
  const lineItems = getLineItemsAndErrors(products);
  const totalItems =
    customers.length +
    contacts.length +
    orders.length +
    products.length +
    lineItems.length;

  const syncedCompanies: CompanyResource[] = [];
  const syncedContacts: ContactResource[] = [];
  const syncedDeals: DealResource[] = [];
  const existingDeals: string[] = []; //an array of "S" numbers for all the deals that were already in HubSpot BEFORE this run of syncing
  const syncedProducts: ProductResource[] = [];

  const syncErrors: Error[] = [];

  for (let i = 0; i < customers.length; i++) {
    const customer = customers[i];
    if (customer instanceof DataError) continue;
    try {
      printProgress({
        message: `Syncing customer entry ${i + 1} of ${customers.length}...`,
        currentItem: i,
        totalItems,
      });
      const { id } = await syncCustomerAsCompany(customer);
      syncedCompanies.push({
        hubspotId: id,
        customerNumber: customer["Customer Number"],
      });
    } catch (error) {
      const errorToKeep =
        error instanceof Error
          ? error
          : new AppError(
              "Unknown",
              `Unknown error while syncing customer ${customer["Customer Name"]}`
            );
      syncErrors.push(errorToKeep);
    }
  }

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    if (contact instanceof DataError) continue;
    try {
      printProgress({
        message: `Syncing contact entry ${i + 1} of ${contacts.length}...`,
        currentItem: i + customers.length,
        totalItems,
      });
      const { id } = await syncContactAsContact(contact, syncedCompanies);
      const { email: emailToUse } = mapContactToContact(contact);
      syncedContacts.push({
        hubspotId: id,
        email: emailToUse,
      });
    } catch (error) {
      const errorToKeep =
        error instanceof Error
          ? error
          : new AppError(
              "Unknown",
              `Unknown error while syncing contact ${contact.Name}`
            );
      syncErrors.push(errorToKeep);
    }
  }

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    if (order instanceof DataError) continue;
    try {
      printProgress({
        message: `Syncing order entry ${i + 1} of ${orders.length}...`,
        currentItem: i + customers.length + contacts.length,
        totalItems,
      });
      const { id, syncType } = await syncOrderAsDeal(
        order,
        syncedCompanies,
        syncedContacts
      );
      syncedDeals.push({
        hubspotId: id,
        salesOrderNum: order["Sales Order#"],
      });
      if (syncType === "update") existingDeals.push(order["Sales Order#"]);
    } catch (error) {
      const errorToKeep =
        error instanceof Error
          ? error
          : new AppError(
              "Unknown",
              `Unknown error while syncing order ${order["Sales Order#"]}`
            );
      syncErrors.push(errorToKeep);
    }
  }

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    if (product instanceof DataError) continue;
    try {
      printProgress({
        message: `Syncing product entry ${i + 1} of ${products.length}...`,
        currentItem: i + customers.length + contacts.length + orders.length,
        totalItems,
      });
      const { id } = await syncProductAsProduct(product);
      syncedProducts.push({
        hubspotId: id,
        sku: product.Name, //these are reversed in impress for some reason
      });
    } catch (error) {
      const errorToKeep =
        error instanceof Error
          ? error
          : new AppError(
              "Unknown",
              `Unknown error while syncing product ${product.Name}`
            );
      syncErrors.push(errorToKeep);
    }
  }

  for (let i = 0; i < lineItems.length; i++) {
    const lineItem = lineItems[i];
    if (lineItem instanceof DataError) continue;
    try {
      printProgress({
        message: `Syncing line item entry ${i + 1} of ${lineItems.length}...`,
        currentItem:
          i +
          customers.length +
          contacts.length +
          orders.length +
          products.length,
        totalItems,
      });
      await syncLineItemAsLineItem(
        lineItem,
        existingDeals,
        syncedDeals,
        syncedProducts
      );
    } catch (error) {
      const errorToKeep =
        error instanceof Error
          ? error
          : new AppError(
              "Unknown",
              `Unknown error while syncing line item ${lineItem["SKU#"]}`
            );
      syncErrors.push(errorToKeep);
    }
  }

  const allDataErrors = gatherDataErrors(
    customers,
    contacts,
    orders,
    products,
    lineItems
  );
  writeErrors([...allDataErrors, ...syncErrors]);

  process.stdout.clearLine(0);
  console.log("Syncing complete.");
}

run();
