import {
  contactSchema,
  customerSchema,
  lineItemSchema,
  orderSchema,
  poSchema,
  productSchema,
} from "./schema";

export function parseCustomer(row: any) {
  return customerSchema.parse(row);
}

export function parseContact(row: any) {
  return contactSchema.parse(row);
}

export function parseOrder(row: any) {
  return orderSchema.parse(row);
}

export function parseLineItem(row: any) {
  return lineItemSchema.parse(row);
}

export function parsePo(row: any) {
  return poSchema.parse(row);
}

export function parseProduct(row: any) {
  return productSchema.parse(row);
}
