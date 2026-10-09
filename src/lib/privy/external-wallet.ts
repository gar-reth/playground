import { browser } from "$app/environment";
import { writable } from "svelte/store";
import {
  connect,
  createConfig,
  getConnections,
  getConnectors,
  http,
  injected,
  signMessage,
  watchConnectors,
  type Config,
  type Connector,
} from "@wagmi/core";
import { mainnet } from "@wagmi/core/chains";

export type InjectedWallet = {
  address: string;
  chainId: number;
  client:
    | "metamask"
    | "coinbase_wallet"
    | "rainbow"
    | "brave_wallet"
    | "unknown";
};

export type InjectedWalletOption = {
  uid: string;
  name: string;
  icon?: string;
};

export const injectedWallets = writable<InjectedWalletOption[]>([]);

let config: Config | undefined;
let publishAttempt = 0;

export async function connectInjectedWallet(
  uid: string,
): Promise<InjectedWallet> {
  const wagmi = ensureConfig();
  const connector = connectorByUid(wagmi, uid);
  const existing = getConnections(wagmi).find(
    (connection) => connection.connector.uid === uid,
  );
  const connection = existing ?? (await connect(wagmi, { connector }));

  return {
    address: connection.accounts[0],
    chainId: connection.chainId,
    client: walletClient(connector),
  };
}

export async function signInjectedMessage(
  uid: string,
  message: string,
): Promise<string> {
  const wagmi = ensureConfig();
  return signMessage(wagmi, { connector: connectorByUid(wagmi, uid), message });
}

function ensureConfig(): Config {
  if (!browser)
    throw new Error("A browser wallet can only be used in the browser");

  if (!config) {
    config = createConfig({
      chains: [mainnet],
      connectors: [injected()],
      multiInjectedProviderDiscovery: true,
      ssr: true,
      transports: { [mainnet.id]: http() },
    });
    publish();
    watchConnectors(config, { onChange: publish });
  }

  return config;
}

async function publish(): Promise<void> {
  const wagmi = config;
  if (!wagmi) return;

  const attempt = ++publishAttempt;
  const options: InjectedWalletOption[] = [];

  for (const connector of visibleConnectors(getConnectors(wagmi))) {
    const provider = await connector.getProvider().catch(() => undefined);
    if (!provider) continue;
    options.push({
      uid: connector.uid,
      name: connector.name,
      icon: connector.icon,
    });
  }

  if (attempt !== publishAttempt) return;
  injectedWallets.set(options);
}

function visibleConnectors(connectors: readonly Connector[]): Connector[] {
  const discovered = connectors.filter(
    (connector) => connector.type === "injected" && connector.id !== "injected",
  );
  if (discovered.length > 0) return discovered;
  return connectors.filter((connector) => connector.type === "injected");
}

function connectorByUid(wagmi: Config, uid: string): Connector {
  const connector = getConnectors(wagmi).find(
    (candidate) => candidate.uid === uid,
  );
  if (!connector) throw new Error("That wallet is no longer available");
  return connector;
}

function walletClient(connector: Connector): InjectedWallet["client"] {
  const rdns =
    typeof connector.rdns === "string"
      ? connector.rdns
      : (connector.rdns?.join(" ") ?? "");
  const hint = `${connector.id} ${connector.name} ${rdns}`.toLowerCase();

  if (hint.includes("brave")) return "brave_wallet";
  if (hint.includes("coinbase")) return "coinbase_wallet";
  if (hint.includes("rainbow")) return "rainbow";
  if (hint.includes("metamask")) return "metamask";
  return "unknown";
}

if (browser) ensureConfig();
