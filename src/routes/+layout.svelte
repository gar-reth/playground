<script lang="ts">
	import { Toaster } from 'svelte-sonner';
	import favicon from '$lib/assets/favicon.svg';
	import PrivyFrame from '$lib/components/privy/privy-frame.svelte';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<PrivyFrame />
{@render children()}
<Toaster visibleToasts={5} richColors duration={10000} />
