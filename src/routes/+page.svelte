<script lang="ts">
	import { toast } from 'svelte-sonner';

	const samples = [
		() => toast('Copied'),
		() =>
			toast.success('Draft published', {
				description: 'Your changes are live.'
			}),
		() =>
			toast.info('Sync in progress', {
				description:
					'Pulling notes from three workspaces. This usually takes a few seconds.'
			}),
		() =>
			toast.warning('Storage almost full', {
				description:
					'You have used 9.4 GB of 10 GB. Older exports will be archived on Friday unless you free up space or upgrade the plan.'
			}),
		() =>
			toast.error('Could not send invoice', {
				description:
					'Stripe rejected the request because the customer is missing a billing address, a VAT number, and a valid payment method. Add those details, then retry. The payload was also missing line items for the March usage period.'
			}),
		() =>
			toast('Review requested', {
				description:
					'Maya left comments on the hero copy, the pricing table, and the footer legal line. She also attached a short voice note covering tone of voice for the launch email.',
				action: {
					label: 'Open',
					onClick: () => {}
				}
			})
	];

	let index = $state(0);

	function showToast() {
		samples[index % samples.length]();
		index += 1;
	}
</script>

<main class="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 text-slate-900">
	<h1 class="text-3xl font-bold">Playground</h1>
	<p class="max-w-sm text-center text-slate-600">
		Each click fires a different toast so the stack has mixed heights.
	</p>
	<button
		class="rounded-lg bg-indigo-600 px-4 py-2 text-white transition hover:bg-indigo-700"
		onclick={showToast}
	>
		Show toast
	</button>
</main>
