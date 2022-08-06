<script>
    const team = [
        ['nia', null],
        ['faith', null],
        ['joel', 'https://www.joelsimon.net/'],
        ['jim', null],
        ['jeff', null],
        ['thomas', 'https://photon.garden/'],
        ['evan', 'http://www.evcasey.com'],
        ['ian', 'https://iandoesallthethings.com'],
        ['gabe'],
        ['tal'],
        ['max', 'https://maxbittker.com/'],
        ['victor']
    ].sort()
</script>
<h2>Team</h2>
<div class="flex flex-wrap flex-col morpho-body-text">
    <!-- <p>{team.join(' ')}</p> -->
    {#each team as [member, href]}
        {#if href == null}
            <p class='capitalize'>{member}  </p>
        {:else} 
            <a class='capitalize' {href} target="_blank">{member} ↗</a>
        {/if}
    {/each}
</div>
