import {
  localDev,
} from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { proxyUserAuth } from "../proxy-auth";

export default eveChannel({
  auth: [
    // The Next.js app proxies authenticated users via a signed JWT.
    proxyUserAuth,
    // Open on localhost for the eve TUI / REPL and `eve dev`; ignored in
    // production (only proxyUserAuth accepts real requests there).
    localDev(),
  ],
});
