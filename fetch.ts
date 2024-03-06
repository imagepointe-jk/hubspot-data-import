import { AppError } from "./error";
import { mapContactToContact, mapCustomerToCompany } from "./mapData";
import { CompanyResource, Contact, Customer } from "./schema";

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

  //now that we have the id of the existing company, update its data.
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
