const MONEY_PATTERN = /^-?\d+(\.\d{1,2})?$/;

function toCents(value, fieldName) {
  const normalized = String(value ?? "0").trim();

  if (!MONEY_PATTERN.test(normalized)) {
    throw new Error(`${fieldName} must be a valid monetary amount with max 2 decimals`);
  }

  const isNegative = normalized.startsWith("-");
  const unsigned = isNegative ? normalized.slice(1) : normalized;
  const [whole, decimals = ""] = unsigned.split(".");
  const cents = BigInt(whole) * 100n + BigInt((decimals + "00").slice(0, 2));

  return isNegative ? -cents : cents;
}

function centsToSqlAmount(cents) {
  const isNegative = cents < 0n;
  const unsigned = isNegative ? -cents : cents;
  const whole = unsigned / 100n;
  const decimal = String(unsigned % 100n).padStart(2, "0");

  return `${isNegative ? "-" : ""}${whole}.${decimal}`;
}

module.exports = {
  toCents,
  centsToSqlAmount
};
