import { DataError } from "./error";
import { syncContactAsContact, syncCustomerAsCompany } from "./fetch";
import {
  getContactsAndErrors,
  getCustomersAndErrors,
  getLineItemsAndErrors,
  getOrdersAndErrors,
  getPoAndErrors,
  getProductsAndErrors,
} from "./handleData";
import dotenv from "dotenv";
import { CompanyResource, ContactResource } from "./schema";
import { mapContactToContact } from "./mapData";

dotenv.config();

async function run() {
  const customers = getCustomersAndErrors();
  const contacts = getContactsAndErrors();
  const orders = getOrdersAndErrors();
  const products = getProductsAndErrors();
  const lineItems = getLineItemsAndErrors();
  const po = getPoAndErrors();

  const syncedCompanies: CompanyResource[] = [];
  const syncedContacts: ContactResource[] = [];

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
}

run();
