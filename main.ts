import { getSourceJson } from "./spreadsheet";

async function run() {
  const data = getSourceJson("./customers.xlsx");
  console.log(data["customers"][0]);
}

run();
