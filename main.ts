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

dotenv.config();

async function run() {
  const customers = getCustomersAndErrors();
  const contacts = getContactsAndErrors();
  const po = getPoAndErrors();
  const owners = await getAllOwners();
  const orders = getOrdersAndErrors(owners, po);
  const products = getProductsAndErrors();
  const lineItems = getLineItemsAndErrors();

  const syncedCompanies: CompanyResource[] = [];
  const syncedContacts: ContactResource[] = [];
  const syncedDeals: DealResource[] = [];

  for (const customer of customers) {
    if (customer instanceof DataError) continue;
    const { id } = await syncCustomerAsCompany(customer);
    syncedCompanies.push({
      hubspotId: id,
      customerNumber: customer["Customer Number"],
    });
  }

  for (const contact of contacts) {
    if (contact instanceof DataError) continue;
    const { id } = await syncContactAsContact(contact, syncedCompanies);
    const { email: emailToUse } = mapContactToContact(contact);
    syncedContacts.push({
      hubspotId: id,
      email: emailToUse,
    });
  }

  for (const order of orders) {
    if (order instanceof DataError) continue;
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
}

run();
