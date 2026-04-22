// Switch to "PRODUCTION" before publishing to npm / deploying.
const ENV: "LOCAL" | "DEV" | "PRODUCTION" = "LOCAL";

export interface Domain {
  screenerApi: string;
  phoneApi: string;
  vipApi: string;
}

export function getDomain(): Domain {
  if (ENV === "LOCAL") {
    return {
      screenerApi: "http://localhost:5000/api/v1",
      phoneApi:    "http://localhost:5003/api/v1",
      vipApi:      "http://localhost:5005/api/v1",
    };
  }

  if (ENV === "DEV") {
    return {
      screenerApi: "https://staging.hyring.com/api/v1",
      phoneApi:    "https://staging.hyring.com/call/api/v1",
      vipApi:      "https://staging.hyring.com/vip/api/v1",
    };
  }

  return {
    screenerApi: "https://api-screener.hyring.com/api/v1",
    phoneApi:    "https://phonescreener.hyring.com/api/v1",
    vipApi:      "https://api-vip.hyring.com/api/v1",
  };
}
