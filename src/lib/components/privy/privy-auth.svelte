<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { injectedWallets } from '$lib/privy/external-wallet';
	import { privy } from '$lib/privy/session.svelte';

	type Busy = 'send' | 'verify' | 'logout' | 'wallet' | 'external' | 'sign' | 'token';

	let email = $state('');
	let code = $state('');
	let step = $state<'email' | 'code'>('email');
	let busy = $state<Busy | null>(null);
	let formError = $state<string | null>(null);
	let signature = $state<string | null>(null);
	let connectingUid = $state<string | null>(null);

	async function run(action: Busy, fn: () => Promise<void>) {
		formError = null;
		busy = action;

		try {
			await fn();
		} catch (error) {
			formError = errorMessage(error);
		} finally {
			busy = null;
		}
	}

	function sendCode(event: SubmitEvent) {
		event.preventDefault();
		const nextEmail = email.trim();

		void run('send', async () => {
			await privy.sendEmailCode(nextEmail);
			email = nextEmail;
			code = '';
			step = 'code';
		});
	}

	function verifyCode(event: SubmitEvent) {
		event.preventDefault();

		void run('verify', async () => {
			await privy.loginWithEmail(email, code.trim());
		});
	}

	function connectExternalWallet(uid: string) {
		signature = null;
		connectingUid = uid;
		void run('external', () => privy.connectExternalWallet(uid)).finally(() => {
			connectingUid = null;
		});
	}

	function createWallet() {
		signature = null;
		void run('wallet', () => privy.createEthereumWallet());
	}

	function signMessage() {
		signature = null;
		void run('sign', async () => {
			signature = await privy.signMessage('Hello from the playground');
		});
	}

	function copyAccessToken() {
		void run('token', async () => {
			const token = await privy.getAccessToken();
			if (!token) throw new Error('No access token is available');
			await navigator.clipboard.writeText(token);
			toast.success('Access token copied');
		});
	}

	function logout() {
		void run('logout', async () => {
			await privy.logout();
			email = '';
			code = '';
			step = 'email';
			signature = null;
		});
	}

	function errorMessage(error: unknown): string {
		if (error instanceof Error && error.message) return error.message;
		if (
			typeof error === 'object' &&
			error !== null &&
			'message' in error &&
			typeof error.message === 'string' &&
			error.message
		) {
			return error.message;
		}
		if (typeof error === 'string' && error) return error;
		return 'Something went wrong';
	}
</script>

<section class="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
	<div class="mb-4">
		<h2 class="text-lg font-semibold">Privy</h2>
		<p class="text-sm text-slate-500">Sign in with email or a browser wallet.</p>
	</div>

	{#if privy.status === 'idle' || privy.status === 'loading'}
		<p class="text-sm text-slate-500">Connecting to Privy…</p>
	{:else if privy.status === 'unconfigured'}
		<p class="text-sm text-slate-600">
			Add <code class="font-mono text-xs">PUBLIC_PRIVY_APP_ID</code> to
			<code class="font-mono text-xs">.env</code>, then restart the dev server.
			<code class="font-mono text-xs">PUBLIC_PRIVY_CLIENT_ID</code> is optional.
		</p>
	{:else if privy.status === 'error'}
		<p class="text-sm text-red-600">{privy.error}</p>
		<button
			type="button"
			class="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 transition hover:bg-slate-100"
			onclick={() => privy.retry()}
		>
			Try again
		</button>
	{:else if privy.user}
		<div class="flex flex-col gap-4">
			<div>
				<p class="text-sm text-slate-500">Signed in</p>
				<p class="font-medium">{privy.email ?? 'No email on this account'}</p>
				<p class="mt-1 break-all font-mono text-xs text-slate-500">{privy.user.id}</p>
			</div>

			{#if privy.ethereumAddress}
				<div>
					<p class="text-sm text-slate-500">Embedded wallet</p>
					<p class="break-all font-mono text-sm">{privy.ethereumAddress}</p>
				</div>
			{/if}

			{#if privy.externalEthereumAddresses.length > 0}
				<div>
					<p class="text-sm text-slate-500">External wallet</p>
					{#each privy.externalEthereumAddresses as address (address)}
						<p class="break-all font-mono text-sm">{address}</p>
					{/each}
				</div>
			{/if}

			{#if signature}
				<div>
					<p class="text-sm text-slate-500">Signature</p>
					<p class="break-all font-mono text-xs text-slate-700">{signature}</p>
				</div>
			{/if}

			{#if formError}
				<p class="text-sm text-red-600">{formError}</p>
			{/if}

			<div class="flex flex-wrap gap-2">
				{#if privy.ethereumAddress}
					<button
						type="button"
						class="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white transition hover:bg-indigo-700 disabled:opacity-50"
						disabled={busy !== null}
						onclick={signMessage}
					>
						{busy === 'sign' ? 'Signing…' : 'Sign message'}
					</button>
				{:else}
					<button
						type="button"
						class="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white transition hover:bg-indigo-700 disabled:opacity-50"
						disabled={busy !== null}
						onclick={createWallet}
					>
						{busy === 'wallet' ? 'Creating…' : 'Create Ethereum wallet'}
					</button>
				{/if}
				{@render walletChoices(busy, connectingUid, connectExternalWallet)}
				<button
					type="button"
					class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 transition hover:bg-slate-100 disabled:opacity-50"
					disabled={busy !== null}
					onclick={copyAccessToken}
				>
					{busy === 'token' ? 'Copying…' : 'Copy access token'}
				</button>
				<button
					type="button"
					class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 transition hover:bg-slate-100 disabled:opacity-50"
					disabled={busy !== null}
					onclick={logout}
				>
					{busy === 'logout' ? 'Logging out…' : 'Log out'}
				</button>
			</div>
		</div>
	{:else if step === 'email'}
		<div class="flex flex-col gap-3">
			<form class="flex flex-col gap-3" onsubmit={sendCode}>
				<label for="privy-email" class="text-sm font-medium">Email</label>
				<input
					id="privy-email"
					class="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
					type="email"
					autocomplete="email"
					required
					bind:value={email}
					disabled={busy !== null}
				/>
				<button
					type="submit"
					class="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white transition hover:bg-indigo-700 disabled:opacity-50"
					disabled={busy !== null}
				>
					{busy === 'send' ? 'Sending…' : 'Send code'}
				</button>
			</form>
			<div class="flex items-center gap-3 text-sm text-slate-400">
				<span class="h-px flex-1 bg-slate-200"></span>
				or
				<span class="h-px flex-1 bg-slate-200"></span>
			</div>
			{@render walletChoices(busy, connectingUid, connectExternalWallet)}
			{#if formError}
				<p class="text-sm text-red-600">{formError}</p>
			{/if}
		</div>
	{:else}
		<form class="flex flex-col gap-3" onsubmit={verifyCode}>
			<label for="privy-code" class="text-sm font-medium">Code for {email}</label>
			<input
				id="privy-code"
				class="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
				type="text"
				inputmode="numeric"
				autocomplete="one-time-code"
				maxlength="6"
				required
				bind:value={code}
				disabled={busy !== null}
			/>
			{#if formError}
				<p class="text-sm text-red-600">{formError}</p>
			{/if}
			<button
				type="submit"
				class="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white transition hover:bg-indigo-700 disabled:opacity-50"
				disabled={busy !== null}
			>
				{busy === 'verify' ? 'Verifying…' : 'Log in'}
			</button>
			<button
				type="button"
				class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 transition hover:bg-slate-100 disabled:opacity-50"
				disabled={busy !== null}
				onclick={() => {
					step = 'email';
					code = '';
					formError = null;
				}}
			>
				Use a different email
			</button>
		</form>
	{/if}
</section>

{#snippet walletChoices(
	busy: Busy | null,
	connectingUid: string | null,
	connect: (uid: string) => void
)}
	<div class="flex w-full flex-col gap-2">
	{#if $injectedWallets.length === 0}
		<p class="text-sm text-slate-500">
			No browser wallet found. Install MetaMask or another injected wallet.
		</p>
	{:else}
		<div class="flex flex-col gap-2">
			{#each $injectedWallets as wallet (wallet.uid)}
				<button
					type="button"
					class="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 transition hover:bg-slate-100 disabled:opacity-50"
					disabled={busy !== null}
					onclick={() => connect(wallet.uid)}
				>
					{#if wallet.icon}
						<img src={wallet.icon} alt="" class="size-4" />
					{/if}
					{busy === 'external' && connectingUid === wallet.uid ? 'Connecting…' : wallet.name}
				</button>
			{/each}
		</div>
	{/if}
	</div>
{/snippet}
