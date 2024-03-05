import { AppError } from "./error";
import { mapCustomerToCompany } from "./mapData";
import { Contact, Customer } from "./schema";

const accessToken = () => {
  const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!accessToken)
    throw new AppError("Environment", "No HubSpot access token!");
  return accessToken;
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
  //the error from the post request does not provide the id of the existing record,
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

function postCustomerAsCompany(customer: Customer) {
  const headers = new Headers();
  headers.append("Content-Type", "application/json");
  headers.append("Authorization", `Bearer ${accessToken()}`);

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
  const headers = new Headers();
  headers.append("Content-Type", "application/json");
  headers.append("Authorization", `Bearer ${accessToken()}`);

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
  const headers = new Headers();
  headers.append("Content-Type", "application/json");
  headers.append("Authorization", `Bearer ${accessToken()}`);

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
