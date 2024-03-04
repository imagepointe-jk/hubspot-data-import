import {
  getContactsAndErrors,
  getCustomersAndErrors,
  getLineItemsAndErrors,
  getOrdersAndErrors,
  getPoAndErrors,
  getProductsAndErrors,
} from "./handleData";

async function run() {
  const customers = getCustomersAndErrors();
  const contacts = getContactsAndErrors();
  const orders = getOrdersAndErrors();
  const products = getProductsAndErrors();
  const lineItems = getLineItemsAndErrors();
  const po = getPoAndErrors();
  console.log(po);
}

run();
