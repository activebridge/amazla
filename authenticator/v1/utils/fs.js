import * as fs from "./../shared/fs";

const FILE_NAME = "accounts.json";

export function readAccounts() {
  return JSON.parse(fs.readFileSync(FILE_NAME) || "[]");
}

export function writeAccounts(data) {
  return fs.writeFileSync(FILE_NAME, JSON.stringify(data));
}
