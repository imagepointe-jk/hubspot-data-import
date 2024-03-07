import { DataError } from "./error";
import {
  getAllOwners,
  syncContactAsContact,
  syncCustomerAsCompany,
  syncOrderAsDeal,
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
import { CompanyResource, ContactResource, DealResource } from "./schema";
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
  const lineItems = getLineItemsAndErrors();
  const totalItems = customers.length + contacts.length + orders.length;

  const syncedCompanies: CompanyResource[] = [];
  const syncedContacts: ContactResource[] = [];
  const syncedDeals: DealResource[] = [];

  for (let i = 0; i < customers.length; i++) {
    const customer = customers[i];
    if (customer instanceof DataError) continue;
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
  }

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    if (contact instanceof DataError) continue;
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
  }

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    if (order instanceof DataError) continue;
    printProgress({
      message: `Syncing order entry ${i + 1} of ${orders.length}...`,
      currentItem: i + customers.length + contacts.length,
      totalItems,
    });
    const { id } = await syncOrderAsDeal(
      order,
      syncedCompanies,
      syncedContacts
    );
    syncedDeals.push({
      hubspotId: id,
      salesOrderNum: order["Sales Order#"],
    });
  }

  process.stdout.clearLine(0);
  console.log("Syncing complete.");
}

run();
