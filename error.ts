import { ImpressDataType } from "./schema";

export class DataError extends Error {
  public readonly rowIdentifier;
  public readonly rowNumber; //this is not necessarily the actual row number in Excel because if there are blank rows, they will be skipped
  public readonly type;

  constructor(
    type: ImpressDataType,
    rowIdentifier: string,
    rowNumber: number,
    message?: string
  ) {
    super(message);

    this.type = type;
    this.rowIdentifier = rowIdentifier;
    this.rowNumber = rowNumber;
  }
}

type AppErrorType = "Environment" | "API" | "Unknown";

export class AppError extends Error {
  public readonly type;

  constructor(type: AppErrorType, message?: string) {
    super(message);

    this.type = type;
  }
}
