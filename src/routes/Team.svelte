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
<div class="flex flex-wrap flex-col morpho-body-text">
    <!-- <p>{team.join(' ')}</p> -->
    {#each team as member}
        <p class='capitalize '>{member}  </p>
    {/each}
</div>
