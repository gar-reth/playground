<script lang="ts">
	import { onMount } from 'svelte';
	import { privy } from '$lib/privy/session.svelte';

	let iframe: HTMLIFrameElement;

	onMount(() => {
		void privy.connect(iframe);
		return () => privy.disconnect();
	});
</script>

<iframe bind:this={iframe} title="Privy secure context" style="display: none"></iframe>
