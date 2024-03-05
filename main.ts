import { AppError, DataError } from "./error";
import { syncCustomerAsCompany } from "./fetch";
import {
  getContactsAndErrors,
  getCustomersAndErrors,
  getLineItemsAndErrors,
  getOrdersAndErrors,
  getPoAndErrors,
  getProductsAndErrors,
} from "./handleData";
import dotenv from "dotenv";

dotenv.config();

async function run() {
  const customers = getCustomersAndErrors();
  const contacts = getContactsAndErrors();
  const orders = getOrdersAndErrors();
  const products = getProductsAndErrors();
  const lineItems = getLineItemsAndErrors();
  const po = getPoAndErrors();

  for (const customer of customers) {
    if (customer instanceof DataError) continue;
    const { id } = await syncCustomerAsCompany(customer);
    console.log(`synced customer as company ${id}`);
  }
}

run();
