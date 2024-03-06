import { z } from "zod";

const excelSerialDate = z.number().transform((val) => {
  // Excel serial date starts from January 1, 1900 (excluding leap year bug)
  const excelStartDate = new Date("1899-12-30T00:00:00Z");

  // Adjust for the 1900 leap year bug in Excel
  if (val > 59) {
    val++;
  }

  // Convert days to milliseconds
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  // Calculate the equivalent JavaScript date
  const jsDate = new Date(excelStartDate.getTime() + val * millisecondsPerDay);

  return jsDate;
});

export const customerSchema = z.object({
  ["Customer Number"]: z.number(),
  ["Agent #1"]: z.number().optional(),
  ["Customer Name"]: z.string(),
  ["Street Address"]: z.string().optional(),
  ["Address Line 2"]: z.string().optional(),
  ["City"]: z.string().optional(),
  ["State"]: z.string().optional(),
  ["Zip Code"]: z.coerce.string().optional(),
  ["Country"]: z.string().optional(),
  ["Phone#"]: z.coerce.string().optional(),
});

export const contactSchema = z.object({
  ["Customer Number"]: z.number(),
  ["Address Code"]: z.number().optional(),
  ["Name"]: z.string(),
  ["Address Line 2"]: z.string().optional(),
  ["City"]: z.string().optional(),
  ["State"]: z.string().optional(),
  ["Zip Code"]: z.coerce.string().optional(),
  ["Country"]: z.string().optional(),
  ["Phone#"]: z.string().optional(),
  ["Fax#"]: z.string().optional(),
  ["Email"]: z.string().email().optional(),
});

export const orderSchema = z.object({
  ["Customer Number"]: z.number(),
  ["Sales Order Type"]: z.string().optional(),
  ["Sales Order#"]: z.string(),
  ["Entered Date"]: excelSerialDate.optional(),
  ["Request Date"]: excelSerialDate.optional(),
  ["Cancel Date"]: excelSerialDate.optional(),
  ["Customer PO#"]: z.string().optional(),
  ["Agent Name#1"]: z.string().optional(),
  ["Purchaser"]: z.string().optional(),
  ["Buyer Email"]: z.string().email().optional(),
  ["Shipping $Cost"]: z.number().optional(),
  ["Tax $Total"]: z.number().optional(),
  ["Order $Total"]: z.number().optional(),
  ["Order $Cost"]: z.number().optional(),
  ["Commission Amount"]: z.number().optional(),
  ["Invoice Date"]: excelSerialDate.optional(),
  ["Internal Comments"]: z.string().optional(),
  ["Comments"]: z.string().optional(),
  ["Ship Via"]: z.string().optional(),
  ["Garment Design"]: z.string().optional(),
  ["Garment Design Description"]: z.string().optional(),
  ["Garment Design Instructions"]: z.string().optional(),
  ["Pipeline"]: z.string().optional(),
  ["Deal Stage"]: z.string().optional(),
  ["PO#"]: z.string().optional(),
});

export const lineItemSchema = z.object({
  ["Entered Date"]: excelSerialDate.optional(),
  ["Size"]: z.string().optional(),
  ["Size Qty Ordered"]: z.number().optional(),
  ["Size Cost"]: z.number().optional(),
  ["Unit Price"]: z.number().optional(),
  ["SKU#"]: z.string().optional(), //comes from impress
  ["SKU"]: z.string().optional(), //filled with Item# if it's defined, otherwise SKU#
  ["Item#"]: z.string().optional(), //comes from impress
  ["Name"]: z.string().optional(),
});

export const poSchema = z.object({
  ["Sales Order#"]: z.coerce.string(),
  ["PO#"]: z.string().optional(),
});

export const productSchema = z.object({
  ["Name"]: z.string(),
  ["SKU"]: z.string().optional(),
  ["Product Type"]: z.string().optional(),
  ["Unit Price"]: z.number().optional(),
});

export type Customer = z.infer<typeof customerSchema>;
export type Contact = z.infer<typeof contactSchema>;
export type Order = z.infer<typeof orderSchema>;
export type Product = z.infer<typeof productSchema>;
export type LineItem = z.infer<typeof lineItemSchema>;
export type PO = z.infer<typeof poSchema>;
export type ImpressDataType =
  | "Customer"
  | "Contact"
  | "Order"
  | "Line Item"
  | "PO"
  | "Product";

//associates the ID of the company resource that got created in HubSpot with the Impress customer number
export type CompanyResource = {
  hubspotId: number;
  customerNumber: number;
};

//associates the ID of the company resource that got created in HubSpot with the Impress contact email. Note that this is not a reliable association yet because many historical contacts have no listed email.
export type ContactResource = {
  hubspotId: number;
  email: string;
};
