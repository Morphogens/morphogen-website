<script lang="ts">
    const year = new Date().getFullYear()
</script>

<div class='flex justify-between fixed bottom-4 margin-24px'>
    <p>@{year} Morphogen Inc.</p>
    <p>info@morphogen.io</p>
</div>


<style>
    div {
        width: calc(100vw - 48px);
        /* color: rgb(153, 153, 153); */
        border-top:  1px solid;
        /* border-top:  1px solid rgb(153, 153, 153); */
    }
</style>