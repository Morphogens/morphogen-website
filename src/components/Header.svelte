<script lang="ts">
import {menuOpen} from '../stores'
</script>

<div class="morpho-header flex justify-between w-full">
    {#if !$menuOpen}
        <div class="flex">
            <a href='/'>Morphogen</a>
        </div>
        <div class="flex">
            <a class='mr-4' href='https://artbreeder.com' target='_blank'>Artbreeder</a>
            <p on:click={() => $menuOpen=true}>Menu</p>
        </div>
    {:else}
        <!-- Spacer -->
        <div></div>
        <p on:click={() => $menuOpen=false}>Close</p>
    {/if}
</div>

<style>
    p {
        cursor: pointer;
    }
    .morpho-header {
        border-bottom: 1px solid;
        letter-spacing: -.01em;
        font-size: 34px;
        line-height: 40px;
        font-weight: 300;
        padding-bottom: 20px;
        /* backdrop-filter: blur(4px); */
        /* background-color: rgba(240, 248, 255, 0.279); */
    }
    @media (max-width: 800px) {
        .morpho-header {
            margin-top: 8px;
            font-size: 23px;
            line-height: 24px;
            letter-spacing: 0rem;
        }
    }

</style>