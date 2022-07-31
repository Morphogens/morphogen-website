<script>
    const team = [
        'nia',
        'faith',
        'joel',
        'jim',
        'jeff',
        'thomas',
        'ian',
        'gabe',
        'tal',
        'max',
        'victor'
    ].sort()
</script>
<h2>Team</h2>
<p class="morpho-body-text text-left">
    {#each team as member}
        <p class='capitalize'>{member}</p>  
    {/each}
</p>
