import { browser } from "$app/environment";
import { env } from "$env/dynamic/public";
import Privy, {
  type ExternalWallet,
  LocalStorage,
  getEntropyDetailsFromUser,
  getUserEmbeddedEthereumWallet,
} from "@privy-io/js-sdk-core";
import {
  type InjectedWallet,
  connectInjectedWallet,
  signInjectedMessage,
} from "./external-wallet";

type PrivyClient = InstanceType<typeof Privy>;
type PrivyUser = Awaited<ReturnType<PrivyClient["user"]["get"]>>["user"];

const IFRAME_TIMEOUT_MS = 20_000;

class PrivySession {
  status = $state<"idle" | "loading" | "ready" | "unconfigured" | "error">(
    env.PUBLIC_PRIVY_APP_ID?.trim() ? "idle" : "unconfigured",
  );
  user = $state<PrivyUser | null>(null);
  error = $state<string | null>(null);

  #client: PrivyClient | null = null;
  #iframe: HTMLIFrameElement | null = null;
  #detach: (() => void) | null = null;
  #generation = 0;
  #initialized = false;

  get email(): string | null {
    const user = this.user;
    if (!user) return null;

    for (const account of user.linked_accounts) {
      if (account.type === "email") return account.address;
    }

    return null;
  }

  get ethereumAddress(): string | null {
    if (!this.user) return null;
    return getUserEmbeddedEthereumWallet(this.user)?.address ?? null;
  }

  get externalEthereumAddresses(): string[] {
    const user = this.user;
    if (!user) return [];

    const addresses: string[] = [];
    for (const account of user.linked_accounts) {
      if (account.type !== "wallet") continue;
      if (!("address" in account) || typeof account.address !== "string")
        continue;
      if ("connector_type" in account && account.connector_type === "embedded")
        continue;
      if ("chain_type" in account && account.chain_type !== "ethereum")
        continue;
      addresses.push(account.address);
    }

    return addresses;
  }

  async connect(iframe: HTMLIFrameElement): Promise<void> {
    if (!browser) return;

    const generation = ++this.#generation;
    this.#iframe = iframe;
    this.#detach?.();
    this.#detach = null;

    try {
      await import("./polyfill");
      if (generation !== this.#generation) return;

      const client = this.#ensureClient();
      if (!client || generation !== this.#generation) return;

      this.status = "loading";
      this.error = null;

      const detach = await attachIframe(client, iframe);
      if (generation !== this.#generation) {
        detach();
        return;
      }

      this.#detach = detach;

      if (!this.#initialized) {
        await client.initialize();
        if (generation !== this.#generation) return;
        await this.#loadUser();
        if (generation !== this.#generation) return;
        this.#initialized = true;
      }

      if (generation !== this.#generation) return;
      this.status = "ready";
    } catch (error) {
      if (generation !== this.#generation) return;
      console.error("Privy initialization failed:", error);
      this.status = "error";
      this.error = errorMessage(error);
    }
  }

  disconnect(): void {
    this.#generation += 1;
    this.#detach?.();
    this.#detach = null;
  }

  async retry(): Promise<void> {
    if (!this.#iframe) return;
    await this.connect(this.#iframe);
  }

  async sendEmailCode(email: string): Promise<void> {
    await this.#requireClient().auth.email.sendCode(email);
  }

  async connectExternalWallet(connectorUid: string): Promise<void> {
    const client = this.#requireClient();
    const injected = await connectInjectedWallet(connectorUid);
    const wallet = externalWallet(injected);
    const { message } = await client.auth.siwe.init(
      wallet,
      window.location.host,
      window.location.origin,
    );
    const signature = await signInjectedMessage(connectorUid, message);

    if (this.user) {
      const linked = await client.auth.siwe.linkWithSiwe(
        signature,
        wallet,
        message,
      );
      this.user = linked.user;
      return;
    }

    const session = await client.auth.siwe.loginWithSiwe(
      signature,
      wallet,
      message,
      "login-or-sign-up",
    );
    this.user = session.user;
  }

  async loginWithEmail(email: string, code: string): Promise<void> {
    const session = await this.#requireClient().auth.email.loginWithCode(
      email,
      code,
      "login-or-sign-up",
    );
    this.user = session.user;
  }

  async logout(): Promise<void> {
    const userId = this.user?.id;
    await this.#requireClient().auth.logout(userId ? { userId } : undefined);
    this.user = null;
  }

  async createEthereumWallet(): Promise<void> {
    const session = await this.#requireClient().embeddedWallet.create({});
    this.user = session.user;
  }

  async signMessage(message: string): Promise<string> {
    const client = this.#requireClient();
    const user = this.user;
    const wallet = user ? getUserEmbeddedEthereumWallet(user) : null;
    const entropy = getEntropyDetailsFromUser(user);

    if (!wallet || !entropy) {
      throw new Error("Create an Ethereum wallet before signing");
    }

    const provider = await client.embeddedWallet.getEthereumProvider({
      wallet,
      entropyId: entropy.entropyId,
      entropyIdVerifier: entropy.entropyIdVerifier,
    });

    const signature = await provider.request({
      method: "personal_sign",
      params: [message, wallet.address],
    });

    return typeof signature === "string"
      ? signature
      : JSON.stringify(signature);
  }

  async getAccessToken(): Promise<string | null> {
    return this.#requireClient().getAccessToken();
  }

  #ensureClient(): PrivyClient | null {
    if (this.#client) return this.#client;

    const appId = env.PUBLIC_PRIVY_APP_ID?.trim();
    const clientId = env.PUBLIC_PRIVY_CLIENT_ID?.trim();

    if (!appId) {
      this.status = "unconfigured";
      this.error = null;
      return null;
    }

    this.#client = new Privy({
      appId,
      storage: new LocalStorage(),
      ...(clientId ? { clientId } : {}),
    });

    return this.#client;
  }

  #requireClient(): PrivyClient {
    if (!this.#client || this.status !== "ready") {
      throw new Error("Privy is not ready");
    }

    return this.#client;
  }

  async #loadUser(): Promise<void> {
    if (!this.#client) return;

    try {
      const { user } = await this.#client.user.get();
      this.user = user;
    } catch {
      this.user = null;
    }
  }
}

async function attachIframe(
  client: PrivyClient,
  iframe: HTMLIFrameElement,
): Promise<() => void> {
  const url = client.embeddedWallet.getURL();

  if (iframe.getAttribute("src") === url) {
    await waitForLoad(iframe, () => {
      iframe.src = "about:blank";
    });
  }

  await waitForLoad(iframe, () => {
    iframe.src = url;
  });

  const poster = iframe.contentWindow;
  if (!poster) {
    throw new Error("Privy iframe did not expose a content window");
  }

  client.setMessagePoster({
    postMessage: (message, targetOrigin, transfer) => {
      poster.postMessage(
        message,
        targetOrigin,
        transfer === undefined ? undefined : [transfer],
      );
    },
    reload: () => {
      iframe.src = url;
    },
  });

  const listener = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow || event.data == null) return;

    try {
      const data =
        typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      client.embeddedWallet.onMessage(data);
    } catch {
      // The iframe also emits messages that are not wallet replies.
    }
  };

  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

function externalWallet(wallet: InjectedWallet): ExternalWallet {
  return {
    address: wallet.address,
    chainId: `eip155:${wallet.chainId}`,
    connectorType: "injected",
    walletClientType: wallet.client,
  };
}

function waitForLoad(
  iframe: HTMLIFrameElement,
  start: () => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onLoad = () => {
      window.clearTimeout(timer);
      resolve();
    };

    const timer = window.setTimeout(() => {
      iframe.removeEventListener("load", onLoad);
      reject(new Error("Timed out loading the Privy secure context"));
    }, IFRAME_TIMEOUT_MS);

    iframe.addEventListener("load", onLoad, { once: true });
    start();
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Something went wrong";
}

export const privy = new PrivySession();
