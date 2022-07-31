<script lang="ts">
  import router from "page";
  import Index from "./routes/Index.svelte";
  import Purpose from "./routes/Purpose.svelte";
  import Research from "./routes/Research.svelte";
  import Team from "./routes/Team.svelte";
  import Header from "./components/Header.svelte";
  import Footer from "./components/Footer.svelte";
  import Test from "./routes/Test.svelte";
  import Shader from "./shaders/Shader.svelte";
  import Menu from "./components/Menu.svelte";
  import {menuOpen} from './stores'
  
  let Page;
  router("/", () => (Page = Index));
  router("/test", () => (Page = Test));
  router("/purpose", () => (Page = Purpose));
  router("/research", () => (Page = Research));
  router("/team", () => (Page = Team));
  $: toRender = $menuOpen ? Menu : Page;
  router.start();
</script>

<Shader />
<Header />
<svelte:component this={toRender} />
<Footer />

<style>
  :global(body) {
    padding-left: 24px;
    padding-right: 24px;
  }
  :global(h2) {
    font-size: 48px !important;
    line-height: 42px !important;
    border-bottom: 1px solid;
    margin-top: 16px !important;
    padding-bottom: 24px;
    font-weight: 300 !important;
  }
  :global(h3) {
    font-size: 24px !important;
    line-height: 18px !important;
    /* border-bottom: 1px solid; */
    margin-top: 24px !important;
    padding-bottom: 24px;
    font-weight: 300 !important;
  }
  :global(.morpho-body-text) {
    margin-top: 8px;
    line-height: 40px;
    font-size: 32px;
    font-weight: 300;
    padding-bottom: 16px;
    border-bottom: 1px solid;
  }
  :global(p::after) {
    content: "";
    height: 100%;
    display: inline-block;
  }
  :global(a::after) {
    content: "";
    height: 100%;
    display: inline-block;
  }
  :global(h2::after) {
    content: "";
    height: 100%;
    display: inline-block;
  }
  :global(h3::after) {
    content: "";
    height: 100%;
    display: inline-block;
  }
</style>
