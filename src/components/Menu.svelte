<script lang="ts">
    import { menuOpen } from "../stores";
</script>

<div class="flex flex-col">
    {#each ["purpose", "research", "team"] as path}
        <a
            on:click={() => ($menuOpen = false)}
            class="flex"
            href="/{path}">{path}</a
        >
        {/each}
        <a
            on:click={() => ($menuOpen = false)}
            target="_blank"
            class="flex"
            href="https://twitter.com/StudioMorphogen">Twitter ↗</a
        >
        <a
            on:click={() => ($menuOpen = false)}
            target="_blank"
            class="flex"
            href="https://github.com/Morphogens">GitHub ↗</a
        >
</div>

<style>
    a {
        text-transform: capitalize;
        border-bottom: 1px solid;
        line-height: 24px;
        font-size: 32px;
        margin: 0px;
        margin-top: 16px;
        padding-bottom: 16px;
        font-weight: 300;
    }
</style>
