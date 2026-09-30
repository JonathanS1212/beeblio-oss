import { eveChannel } from "eve/channels/eve";
import { proxyUserAuth } from "../proxy-auth";

export default eveChannel({
  auth: proxyUserAuth,
});
