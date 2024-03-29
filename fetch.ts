import { AppError } from "./error";
import {
  mapContactToContact,
  mapCustomerToCompany,
  mapLineItemToLineItem,
  mapOrderToDeal,
  mapProductToProduct,
} from "./mapData";
import {
  CompanyResource,
  Contact,
  ContactResource,
  Customer,
  DealResource,
  HubSpotOwner,
  LineItem,
  Order,
  PO,
  Product,
  ProductResource,
} from "./schema";
import { parseHubSpotOwnerResults } from "./validation";

const accessToken = () => {
  const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!accessToken)
    throw new AppError("Environment", "No HubSpot access token!");
  return accessToken;
};

const standardHeaders = () => {
  const headers = new Headers();
  headers.append("Content-Type", "application/json");
  headers.append("Authorization", `Bearer ${accessToken()}`);
  return headers;
};

type ResourceData = {
  id: number;
};

export async function syncCustomerAsCompany(
  customer: Customer
): Promise<ResourceData> {
  //assume the company doesn't exist yet and try to create a new one
  const postResponse = await postCustomerAsCompany(customer);
  const postJson = await postResponse.json();
  if (postResponse.ok) {
    return {
      id: +postJson.id,
    };
  }

  const message = postJson.message;
  //! this check could break if HubSpot changes the wording of this error message.
  //! unfortunately the response they send for an existing resource conflict is status 400,
  //! so it's hard to distinguish between this and a bad request.
  const customerAlreadyExists =
    typeof message === "string" &&
    message.includes("propertyName=customer_number") &&
    message.includes("already has that value");
  if (!customerAlreadyExists) {
    //there was some error, but not because of a pre-existing customer number
    throw new AppError(
      "API",
      `Error ${postResponse.status} while trying to sync customer number ${customer["Customer Number"]}!`
    );
  }

  //at this point we know there's already a company with the given customer number.
  //we have to first find the existing company with the customer number so that we can update it by its id.
  //the error from the post request does not reliably provide the id of the existing record,
  //and the PATCH endpoint currently doesn't allow patching by customer number (even though it's unique).
  const findResponse = await findCompanyByCustomerNumber(
    customer["Customer Number"]
  );
  if (!findResponse.ok) {
    throw new AppError(
      "API",
      `Failed to execute search for existing customer number ${customer["Customer Number"]}!`
    );
  }
  const findJson = await findResponse.json();
  if (findJson.total !== 1) {
    throw new AppError(
      "API",
      `Failed to find existing customer number ${customer["Customer Number"]}!`
    );
  }

  //now that we have the id of the existing company, update its data.
  const existingCompanyId = +findJson.results[0].id;
  const patchResponse = await patchCompanyWithCustomer(
    customer,
    existingCompanyId
  );
  if (!patchResponse.ok) {
    throw new AppError(
      "API",
      `Failed to patch existing customer number ${customer["Customer Number"]}!`
    );
  }

  return {
    id: existingCompanyId,
  };
}

export async function syncContactAsContact(
  contact: Contact,
  syncedCompanies: CompanyResource[]
): Promise<ResourceData> {
  const associatedCompany = syncedCompanies.find(
    (company) => company.customerNumber === contact["Customer Number"]
  );
  if (!associatedCompany) {
    throw new AppError(
      "Data Integrity",
      `Contact ${contact.Name} references customer number ${contact["Customer Number"]}, which was not found in the dataset!`
    );
  }

  //assume the contact doesn't exist yet and try to create a new one
  const postResponse = await postContactAsContact(
    contact,
    associatedCompany.hubspotId
  );
  const postJson = await postResponse.json();
  if (postResponse.ok)
    return {
      id: +postJson.id,
    };

  const contactAlreadyExists = postResponse.status === 409;
  if (!contactAlreadyExists) {
    throw new AppError(
      "API",
      `Unknown error creating contact. Name was ${contact.Name}, email was ${contact.Email}, phone was ${contact["Phone#"]}.`
    );
  }

  //at this point we know there's already a contact with the given email.
  //we have to first find the existing contact with the email so that we can update it by its id.
  //the error from the post request does not reliably provide the id of the existing record,
  //and the PATCH endpoint currently doesn't allow patching by email (even though it's unique).
  const { email: expectedEmail } = mapContactToContact(contact);
  const findResponse = await findContactByEmail(expectedEmail);
  if (!findResponse.ok) {
    throw new AppError(
      "API",
      `Failed to execute search for existing contact. Name was ${contact.Name}, email was ${contact.Email}, phone was ${contact["Phone#"]}.`
    );
  }

  const findJson = await findResponse.json();
  if (findJson.total !== 1) {
    throw new AppError(
      "API",
      `Failed to find existing contact. Name was ${contact.Name}, email was ${contact.Email}, phone was ${contact["Phone#"]}.`
    );
  }

  //now that we have the id of the existing contact, update its data.
  const existingContactId = +findJson.results[0].id;
  const patchResponse = await patchContactWithContact(
    contact,
    existingContactId
  );
  if (!patchResponse.ok) {
    throw new AppError(
      "API",
      `Failed to update existing contact. Name was ${contact.Name}, email was ${contact.Email}, phone was ${contact["Phone#"]}.`
    );
  }

  const patchJson = await patchResponse.json();
  return {
    id: +patchJson.id,
  };
}

export async function syncOrderAsDeal(
  order: Order,
  syncedCompanies: CompanyResource[],
  syncedContacts: ContactResource[]
): Promise<ResourceData & { syncType: "create" | "update" }> {
  const associatedCompany = syncedCompanies.find(
    (company) => company.customerNumber === order["Customer Number"]
  );
  const associatedContact = syncedContacts.find(
    (contact) => contact.email === order["Buyer E-Mail"]
  );
  if (!associatedCompany) {
    throw new AppError(
      "Data Integrity",
      `Order ${order["Sales Order#"]} references a company that was not found in the dataset.`
    );
  }
  if (!associatedContact) {
    throw new AppError(
      "Data Integrity",
      `Order ${order["Sales Order#"]} references a contact that was not found in the dataset.`
    );
  }
  //? We're currently mapping Sales Order# to HubSpot's default Deal Name, but Deal Name doesn't require unique values.
  //? This allows multiple deals with the same Sales Order# to be posted, when we intended Sales Order# to be unique.
  //? Currently we get around this by making an extra API call to first search for the deal before trying to create it.
  //? It would be better for each deal to have a unique identifier other than the HubSpot record ID.
  //? This way we don't need the extra call just to avoid creating duplicate deals.
  const findResponse = await findDealByName(order["Sales Order#"]);
  if (!findResponse.ok) {
    throw new AppError(
      "API",
      `Failed to execute search for deal with sales order# ${order["Sales Order#"]}`
    );
  }
  const findJson = await findResponse.json();
  const existingDealId =
    findJson.results.length > 0 ? +findJson.results[0].id : undefined;

  if (existingDealId) {
    //a deal with this sales order# already exists, so update it
    const patchResponse = await patchDealWithOrder(order, existingDealId);
    if (!patchResponse.ok) {
      throw new AppError(
        "API",
        `Failed to update existing deal with sales order# ${order["Sales Order#"]}`
      );
    }
    const patchJson = await patchResponse.json();
    return {
      id: +patchJson.id,
      syncType: "update",
    };
  } else {
    //the deal doesn't already exist, so create it
    const postResponse = await postOrderAsDeal(
      order,
      associatedCompany.hubspotId,
      associatedContact.hubspotId
    );
    if (!postResponse.ok) {
      throw new AppError(
        "API",
        `Failed to create deal with sales order# ${order["Sales Order#"]}`
      );
    }
    const postJson = await postResponse.json();
    return {
      id: +postJson.id,
      syncType: "create",
    };
  }
}

export async function syncProductAsProduct(
  product: Product
): Promise<ResourceData> {
  //assume the product doesn't exist yet and try to create a new one
  const postResponse = await postProductAsProduct(product);
  const postJson = await postResponse.json();
  if (postResponse.ok) {
    return {
      id: +postJson.id,
    };
  }

  const message = postJson.message;
  //! this check could break if HubSpot changes the wording of this error message.
  //! unfortunately the response they send for an existing resource conflict is status 400,
  //! so it's hard to distinguish between this and a bad request.
  const productAlreadyExists =
    typeof message === "string" &&
    message.includes("propertyName=hs_sku") &&
    message.includes("already has that value");
  if (!productAlreadyExists) {
    //there was some error, but not because of a pre-existing product
    throw new AppError(
      "API",
      `Error ${postResponse.status} while trying to sync product ${product.Name}.`
    );
  }

  //at this point we know there's already a product with the given SKU.
  //we have to first find the existing product with the SKU so that we can update it by its id.
  //the error from the post request does not reliably provide the id of the existing record,
  //and the PATCH endpoint currently doesn't allow patching by customer number (even though it's unique).
  const findResponse = await findProductBySku(product.SKU);
  if (!findResponse.ok) {
    throw new AppError(
      "API",
      `Failed to execute search for existing product ${product.Name}`
    );
  }
  const findJson = await findResponse.json();
  if (findJson.total !== 1) {
    throw new AppError(
      "API",
      `Failed to find existing product ${product.Name}`
    );
  }

  //now that we have the id of the existing product, update its data.
  const existingProductId = +findJson.results[0].id;
  const patchResponse = await patchProductWithProduct(
    product,
    existingProductId
  );
  if (!patchResponse.ok) {
    throw new AppError(
      "API",
      `Failed to patch existing product ${product.Name}`
    );
  }

  return {
    id: +existingProductId,
  };
}

//! Since a deal could hypothetically have two line items with exactly the same data,
//! and we don't have any unique identifiers for line items from Impress,
//! there is currently no way to tell if a line item already existing for a deal in HubSpot
//! is the same line item as the one input into this function.
//! For now, SKIP all line items for deals that were already in HubSpot before this run of syncing.
//! This is probably safe because needing to add new line items to already-synced deals
//! would be very unusual.
export async function syncLineItemAsLineItem(
  lineItem: LineItem,
  existingDealsArr: string[],
  syncedDeals: DealResource[],
  syncedProducts: ProductResource[]
) {
  const existingDeal = existingDealsArr.find(
    (dealNumber) => dealNumber === lineItem["Sales Order#"]
  );
  if (existingDeal) return;

  const associatedDeal = syncedDeals.find(
    (deal) => deal.salesOrderNum === lineItem["Sales Order#"]
  );
  if (!associatedDeal) {
    throw new AppError(
      "Data Integrity",
      `Line item for deal ${lineItem["Sales Order#"]} references a deal that was not found in the dataset.`
    );
  }

  const associatedProduct = syncedProducts.find(
    (product) => product.sku === lineItem.SKU
  );
  if (!associatedProduct) {
    throw new AppError(
      "Data Integrity",
      `Line item for deal ${lineItem["Sales Order#"]} referenced product ${lineItem.SKU}, which was not found in the dataset.`
    );
  }

  await postLineItem(
    lineItem,
    associatedDeal.hubspotId,
    associatedProduct.hubspotId
  );
}

function postCustomerAsCompany(customer: Customer) {
  const headers = standardHeaders();

  const raw = JSON.stringify({
    properties: mapCustomerToCompany(customer),
  });

  const requestOptions = {
    method: "POST",
    headers: headers,
    body: raw,
  };

  return fetch(
    "https://api.hubapi.com/crm/v3/objects/companies",
    requestOptions
  );
}

function findCompanyByCustomerNumber(num: number) {
  const headers = standardHeaders();

  const raw = JSON.stringify({
    filters: [
      {
        propertyName: "customer_number",
        operator: "EQ",
        value: `${num}`,
      },
    ],
  });

  const requestOptions = {
    method: "POST",
    headers: headers,
    body: raw,
  };

  return fetch(
    "https://api.hubapi.com/crm/v3/objects/companies/search",
    requestOptions
  );
}

function patchCompanyWithCustomer(customer: Customer, id: number) {
  const headers = standardHeaders();

  const raw = JSON.stringify({
    properties: mapCustomerToCompany(customer),
  });

  const requestOptions = {
    method: "PATCH",
    headers: headers,
    body: raw,
  };

  return fetch(
    `https://api.hubapi.com/crm/v3/objects/companies/${id}`,
    requestOptions
  );
}

function postContactAsContact(contact: Contact, associatedCompanyId: number) {
  const headers = standardHeaders();

  const raw = JSON.stringify({
    properties: mapContactToContact(contact),
    associations: [
      {
        to: {
          id: associatedCompanyId,
        },
        types: [
          {
            associationCategory: "HUBSPOT_DEFINED",
            associationTypeId: 279,
          },
        ],
      },
    ],
  });

  const requestOptions = {
    method: "POST",
    headers: headers,
    body: raw,
  };

  return fetch(
    "https://api.hubapi.com/crm/v3/objects/contacts",
    requestOptions
  );
}

function findContactByEmail(email: string) {
  const headers = standardHeaders();

  const raw = JSON.stringify({
    filters: [
      {
        propertyName: "email",
        operator: "EQ",
        value: email,
      },
    ],
  });

  const requestOptions = {
    method: "POST",
    headers: headers,
    body: raw,
  };

  return fetch(
    "https://api.hubapi.com/crm/v3/objects/contacts/search",
    requestOptions
  );
}

function patchContactWithContact(contact: Contact, contactId: number) {
  const myHeaders = standardHeaders();

  const raw = JSON.stringify({
    properties: mapContactToContact(contact),
  });

  const requestOptions = {
    method: "PATCH",
    headers: myHeaders,
    body: raw,
  };

  return fetch(
    `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`,
    requestOptions
  );
}

function postOrderAsDeal(
  order: Order,
  associatedCompanyId: number,
  associatedContactId: number
) {
  const headers = standardHeaders();

  const raw = JSON.stringify({
    properties: mapOrderToDeal(order),
    associations: [
      {
        to: {
          id: associatedCompanyId,
        },
        types: [
          {
            associationCategory: "HUBSPOT_DEFINED",
            associationTypeId: 341,
          },
        ],
      },
      {
        to: {
          id: associatedContactId,
        },
        types: [
          {
            associationCategory: "HUBSPOT_DEFINED",
            associationTypeId: 3,
          },
        ],
      },
    ],
  });

  const requestOptions = {
    method: "POST",
    headers: headers,
    body: raw,
  };

  return fetch("https://api.hubapi.com/crm/v3/objects/deals", requestOptions);
}

function findDealByName(dealName: string) {
  const myHeaders = standardHeaders();

  const raw = JSON.stringify({
    filters: [
      {
        propertyName: "dealname",
        operator: "EQ",
        value: dealName,
      },
    ],
  });

  const requestOptions = {
    method: "POST",
    headers: myHeaders,
    body: raw,
  };

  return fetch(
    "https://api.hubapi.com/crm/v3/objects/deals/search",
    requestOptions
  );
}

function patchDealWithOrder(order: Order, id: number) {
  const myHeaders = standardHeaders();

  const raw = JSON.stringify({
    properties: mapOrderToDeal(order),
  });

  const requestOptions = {
    method: "PATCH",
    headers: myHeaders,
    body: raw,
  };

  return fetch(
    `https://api.hubapi.com/crm/v3/objects/deals/${id}`,
    requestOptions
  );
}

export async function getAllOwners(): Promise<HubSpotOwner[]> {
  const headers = standardHeaders();
  headers.delete("Content-Type");

  const requestOptions = {
    method: "GET",
    headers: headers,
  };

  //HubSpot currently imposes a hard limit of 500 owners per request.
  const response = await fetch(
    "https://api.hubapi.com/crm/v3/owners/?limit=500",
    requestOptions
  );
  if (!response.ok) return [];

  const json = await response.json();
  const parsed = parseHubSpotOwnerResults(json);
  return parsed.results;
}

function postProductAsProduct(product: Product) {
  const headers = standardHeaders();

  const raw = JSON.stringify({
    properties: mapProductToProduct(product),
  });

  const requestOptions = {
    method: "POST",
    headers: headers,
    body: raw,
  };

  return fetch(
    "https://api.hubapi.com/crm/v3/objects/products",
    requestOptions
  );
}

function findProductBySku(sku: string) {
  const myHeaders = standardHeaders();

  const raw = JSON.stringify({
    filters: [
      {
        propertyName: "hs_sku",
        operator: "EQ",
        value: sku,
      },
    ],
  });

  const requestOptions = {
    method: "POST",
    headers: myHeaders,
    body: raw,
  };

  return fetch(
    "https://api.hubapi.com/crm/v3/objects/products/search",
    requestOptions
  );
}

function patchProductWithProduct(product: Product, id: number) {
  const myHeaders = standardHeaders();

  const raw = JSON.stringify({
    properties: mapProductToProduct(product),
  });

  const requestOptions = {
    method: "PATCH",
    headers: myHeaders,
    body: raw,
  };

  return fetch(
    `https://api.hubapi.com/crm/v3/objects/products/${id}`,
    requestOptions
  );
}

function postLineItem(lineItem: LineItem, dealId: number, productId: number) {
  const myHeaders = standardHeaders();

  const mapped = mapLineItemToLineItem(lineItem);

  const raw = JSON.stringify({
    properties: {
      ...mapped,
      hs_product_id: productId,
    },
    associations: [
      {
        to: {
          id: dealId,
        },
        types: [
          {
            associationCategory: "HUBSPOT_DEFINED",
            associationTypeId: 20,
          },
        ],
      },
    ],
  });

  const requestOptions = {
    method: "POST",
    headers: myHeaders,
    body: raw,
  };

  return fetch(
    "https://api.hubapi.com/crm/v3/objects/line_items",
    requestOptions
  );
}
